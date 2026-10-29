-- Recargas reembolsadas retiram os créditos que deram.
--
-- Antes: um reembolso da recarga ficava como «ignorado» e o comprador mantinha os créditos; podia
-- comprar, reembolsar e repetir.
--
-- apply_credit_refund(organização, ref da compra, ref do reembolso, total reembolsado, total pago):
--  - só existe reembolso de uma compra registada (sem compra: 'no_purchase', nada se grava);
--  - proporcional: reembolsar 30 de 100 retira 30 % dos créditos da recarga;
--  - cumulativo e sem excesso: _refunded_total é o total reembolsado ATÉ AGORA (como a Stripe manda em
--    amount_refunded); retira-se só a diferença para o que já foi retirado, nunca mais do que a compra
--    deu. Reembolsos parciais em sequência, repetidos ou fora de ordem acabam sempre no valor certo;
--  - idempotente pela ref do reembolso (o mesmo aviso duas vezes retira uma vez);
--  - sem crédito órfão: cada linha de reembolso guarda a ref da compra (meta.purchase_ref).
-- Os créditos já gastos também saem: a conta pode ficar em dívida (saldo negativo) e o uso de IA pára
-- até carregar de novo (reserve_credit, 0086, não reserva sem saldo). É a única forma de o saldo ficar
-- abaixo de zero; o uso nunca o faz.
--
-- Corre com o trinco da organização (o mesmo de reserve/settle, 0086).
-- Só IF NOT EXISTS / CREATE OR REPLACE; nenhum DROP.

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_refund_ref ON public.credit_ledger (organization_id, ref)
  WHERE kind = 'refund' AND ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_ledger_refund_purchase ON public.credit_ledger (organization_id, (meta->>'purchase_ref'))
  WHERE kind = 'refund';

CREATE OR REPLACE FUNCTION public.apply_credit_refund(
  _organization_id uuid, _purchase_ref text, _refund_ref text,
  _refunded_total numeric, _paid_total numeric, _description text, _meta jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bought bigint;
  already bigint;
  fraction numeric;
  target bigint;
  remove bigint;
  inserted integer;
BEGIN
  IF coalesce(btrim(_purchase_ref), '') = '' OR coalesce(btrim(_refund_ref), '') = '' THEN
    RAISE EXCEPTION 'Reembolso sem referência da compra ou do reembolso.';
  END IF;
  PERFORM 1 FROM organizations WHERE id = _organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organização não encontrada.'; END IF;

  IF EXISTS (SELECT 1 FROM credit_ledger WHERE organization_id = _organization_id AND kind = 'refund' AND ref = _refund_ref) THEN
    RETURN jsonb_build_object('status', 'duplicate', 'removed_micros', 0);
  END IF;

  SELECT amount_micros INTO bought FROM credit_ledger
   WHERE organization_id = _organization_id AND kind = 'purchase' AND ref = _purchase_ref;
  IF bought IS NULL THEN
    RETURN jsonb_build_object('status', 'no_purchase', 'removed_micros', 0);
  END IF;

  SELECT coalesce(-sum(amount_micros), 0) INTO already FROM credit_ledger
   WHERE organization_id = _organization_id AND kind = 'refund' AND meta->>'purchase_ref' = _purchase_ref;

  -- Sem valores (o aviso só diz «reembolsado»): reembolso total.
  IF _paid_total IS NULL OR _paid_total <= 0 OR _refunded_total IS NULL THEN
    fraction := 1;
  ELSE
    fraction := least(1, greatest(0, _refunded_total / _paid_total));
  END IF;
  target := least(bought, round(bought * fraction)::bigint);
  remove := target - already;
  IF remove <= 0 THEN
    RETURN jsonb_build_object('status', CASE WHEN already >= bought THEN 'fully_refunded' ELSE 'nothing_to_remove' END,
                              'removed_micros', 0, 'already_removed_micros', already);
  END IF;

  INSERT INTO credit_ledger (organization_id, amount_micros, kind, action, description, ref, meta)
  VALUES (_organization_id, -remove, 'refund', 'topup', coalesce(_description, 'Reembolso da recarga'), _refund_ref,
          coalesce(_meta, '{}'::jsonb) || jsonb_build_object(
            'purchase_ref', _purchase_ref, 'refunded_total', _refunded_total, 'paid_total', _paid_total,
            'bought_micros', bought))
  ON CONFLICT (organization_id, ref) WHERE kind = 'refund' AND ref IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RETURN jsonb_build_object('status', 'duplicate', 'removed_micros', 0);
  END IF;
  RETURN jsonb_build_object('status', 'applied', 'removed_micros', remove, 'already_removed_micros', already);
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_credit_refund(uuid, text, text, numeric, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_refund(uuid, text, text, numeric, numeric, text, jsonb) TO service_role;
