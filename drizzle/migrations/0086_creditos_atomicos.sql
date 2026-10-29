-- Créditos de IA: o saldo nunca fica negativo por uso, mesmo com pedidos em simultâneo.
--
-- Antes: o servidor lia o saldo (credit_state), fazia a chamada à IA e só depois registava o custo
-- (record_credit_usage), que inseria sem olhar para o saldo. N pedidos em paralelo com $0,01 de saldo
-- passavam todos a verificação e deixavam o saldo em −N × custo. O limite mensal tinha a mesma corrida.
--
-- Agora, por organização, tudo passa por um trinco na linha da organização (SELECT … FOR UPDATE):
--  1. reserve_credit: antes da chamada, reserva o que há livre (saldo − reservas activas), até ao máximo
--     da acção, e respeita o limite mensal. Sem saldo livre, não reserva e a acção não corre.
--  2. settle_credit: depois, cobra o custo real, nunca mais do que o saldo que existe nesse momento.
--     O que passar fica registado em meta.uncharged_micros (perda da plataforma, não dívida do cliente).
--  3. release_credit: a acção falhou; a reserva desaparece e nada se cobra.
-- Uma reserva esquecida (função morta a meio) expira sozinha (15 min por omissão).
-- record_credit_usage (custos já feitos, ex.: fim de uma transcrição) passa pelo mesmo trinco e pelo
-- mesmo tecto. Tudo idempotente pela referência (ref), como antes.
--
-- Os reembolsos (0087) são a única excepção: retiram os créditos comprados mesmo que já gastos (a conta
-- fica em dívida e o uso pára até carregar), para comprar, gastar e reembolsar não dar IA de graça.
--
-- Só IF NOT EXISTS / CREATE OR REPLACE; nenhum DROP.
-- Desfazer: a aplicação volta ao caminho antigo sozinha se estas funções não existirem; para as tirar,
-- REVOKE EXECUTE … FROM service_role (sem apagar dados).

CREATE TABLE IF NOT EXISTS public.credit_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount_micros bigint NOT NULL CHECK (amount_micros > 0),
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_holds_org_idx ON public.credit_holds (organization_id, expires_at);
ALTER TABLE public.credit_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.credit_holds TO service_role;

-- O que está livre agora: saldo do livro menos as reservas que ainda não expiraram. Só com o trinco.
CREATE OR REPLACE FUNCTION public.credit_free_micros(_organization_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT sum(amount_micros) FROM credit_ledger WHERE organization_id = _organization_id), 0)
       - coalesce((SELECT sum(amount_micros) FROM credit_holds
                    WHERE organization_id = _organization_id AND expires_at > now()), 0);
$$;

-- 1. Reservar antes da chamada.
CREATE OR REPLACE FUNCTION public.reserve_credit(
  _organization_id uuid, _max_micros bigint, _action text, _ttl_seconds integer DEFAULT 900
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap bigint;
  spent bigint;
  held bigint;
  free bigint;
  room bigint;
  amount bigint;
  hold uuid;
  month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF _max_micros IS NULL OR _max_micros <= 0 THEN RAISE EXCEPTION 'Reserva sem valor.'; END IF;
  -- O trinco: todas as reservas, liquidações e usos desta organização passam aqui um de cada vez.
  SELECT ai_monthly_cap_micros INTO cap FROM organizations WHERE id = _organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organização não encontrada.'; END IF;

  DELETE FROM credit_holds WHERE organization_id = _organization_id AND expires_at <= now();
  free := credit_free_micros(_organization_id);
  IF free <= 0 THEN
    RETURN jsonb_build_object('hold_id', NULL, 'amount_micros', 0, 'reason', 'no_balance');
  END IF;
  amount := least(_max_micros, free);

  IF cap IS NOT NULL THEN
    SELECT coalesce(-sum(amount_micros), 0) INTO spent FROM credit_ledger
     WHERE organization_id = _organization_id AND kind = 'usage' AND created_at >= month_start;
    SELECT coalesce(sum(amount_micros), 0) INTO held FROM credit_holds
     WHERE organization_id = _organization_id AND expires_at > now();
    room := cap - spent - held;
    IF room <= 0 THEN
      RETURN jsonb_build_object('hold_id', NULL, 'amount_micros', 0, 'reason', 'monthly_cap');
    END IF;
    amount := least(amount, room);
  END IF;

  INSERT INTO credit_holds (organization_id, amount_micros, action, expires_at)
  VALUES (_organization_id, amount, coalesce(_action, ''), now() + make_interval(secs => greatest(_ttl_seconds, 60)))
  RETURNING id INTO hold;
  RETURN jsonb_build_object('hold_id', hold, 'amount_micros', amount, 'reason', NULL);
END $$;

-- Cobra um custo já feito, sob o trinco, sem nunca passar o saldo. Partilhada por settle e record.
CREATE OR REPLACE FUNCTION public.credit_charge_locked(
  _organization_id uuid, _action text, _amount_micros bigint, _units numeric,
  _description text, _ref text, _meta jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  balance bigint;
  charge bigint;
  inserted integer := 0;
BEGIN
  IF _amount_micros IS NULL OR _amount_micros <= 0 THEN
    RETURN jsonb_build_object('charged_micros', 0, 'uncharged_micros', 0, 'duplicate', false);
  END IF;
  -- A mesma referência já foi cobrada (webhook repetido, nova tentativa): não volta a cobrar.
  IF _ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM credit_ledger WHERE organization_id = _organization_id AND kind = 'usage' AND ref = _ref
  ) THEN
    RETURN jsonb_build_object('charged_micros', 0, 'uncharged_micros', 0, 'duplicate', true);
  END IF;
  SELECT coalesce(sum(amount_micros), 0) INTO balance FROM credit_ledger WHERE organization_id = _organization_id;
  charge := least(_amount_micros, greatest(balance, 0));
  IF charge > 0 THEN
    INSERT INTO credit_ledger (organization_id, amount_micros, kind, action, units, description, ref, meta)
    VALUES (_organization_id, -charge, 'usage', _action, _units, _description, _ref,
            coalesce(_meta, '{}'::jsonb)
              || CASE WHEN charge < _amount_micros
                      THEN jsonb_build_object('uncharged_micros', _amount_micros - charge, 'cost_micros', _amount_micros)
                      ELSE '{}'::jsonb END)
    ON CONFLICT (organization_id, ref) WHERE kind = 'usage' AND ref IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object(
    'charged_micros', CASE WHEN inserted > 0 THEN charge ELSE 0 END,
    'uncharged_micros', _amount_micros - CASE WHEN inserted > 0 THEN charge ELSE 0 END,
    'duplicate', charge > 0 AND inserted = 0
  );
END $$;

-- 2. Liquidar depois da chamada: tira a reserva e cobra o custo real (no máximo o saldo).
CREATE OR REPLACE FUNCTION public.settle_credit(
  _hold_id uuid, _organization_id uuid, _action text, _amount_micros bigint, _units numeric,
  _description text, _ref text, _meta jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM organizations WHERE id = _organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organização não encontrada.'; END IF;
  IF _hold_id IS NOT NULL THEN
    DELETE FROM credit_holds WHERE id = _hold_id AND organization_id = _organization_id;
  END IF;
  RETURN credit_charge_locked(_organization_id, _action, _amount_micros, _units, _description, _ref, _meta);
END $$;

-- 3. A acção falhou: a reserva desaparece, nada se cobra.
CREATE OR REPLACE FUNCTION public.release_credit(_hold_id uuid, _organization_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM credit_holds WHERE id = _hold_id AND organization_id = _organization_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed > 0;
END $$;

-- Custos já feitos (fim de uma transcrição) e o caminho antigo: o mesmo trinco e o mesmo tecto.
-- Mesma assinatura e mesmo retorno (o saldo depois) que a versão da 0048.
CREATE OR REPLACE FUNCTION public.record_credit_usage(
  _organization_id uuid, _action text, _amount_micros bigint, _units numeric,
  _description text, _ref text, _meta jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM organizations WHERE id = _organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organização não encontrada.'; END IF;
  PERFORM credit_charge_locked(_organization_id, _action, _amount_micros, _units, _description, _ref, _meta);
  RETURN (SELECT coalesce(sum(amount_micros), 0) FROM credit_ledger WHERE organization_id = _organization_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.credit_free_micros(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_credit(uuid, bigint, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_charge_locked(uuid, text, bigint, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_credit(uuid, uuid, text, bigint, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_credit(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_credit_usage(uuid, text, bigint, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.credit_free_micros(uuid),
  public.reserve_credit(uuid, bigint, text, integer),
  public.credit_charge_locked(uuid, text, bigint, numeric, text, text, jsonb),
  public.settle_credit(uuid, uuid, text, bigint, numeric, text, text, jsonb),
  public.release_credit(uuid, uuid),
  public.record_credit_usage(uuid, text, bigint, numeric, text, text, jsonb)
TO service_role;
