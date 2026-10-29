-- Auditoria (14/10/2026): defeitos do motor de automações e da segurança, corrigidos de uma vez.
--
-- 1. automations_channels_guard: numa conta real era impossível ligar uma automação com WhatsApp
--    (a guarda da 0063 só deixava passar o webhook). Passa a aceitar o WhatsApp quando a
--    organização tem a ligação WhatsApp ligada (integrations). E-mail e SMS continuam sem fornecedor.
-- 2. automation_runs_tick e automation_recheck_contact reavaliavam TODAS as condições de entrada a
--    cada espera; numa automação que começa quando a sessão termina, quem via a gravação depois
--    (entered passava a true) era cancelado. Passam a ignorar os factos da sessão nessas
--    automações, como o executor (workflow.ts conditionsAtSend).
-- 3. purchase_attribution: terceira prioridade, a inscrição mais recente na janela, mesmo sem ter
--    assistido (quem compra sem entrar ficava sem webinar: as sequências de venda não paravam e o
--    «Pós-compra» não arrancava).
-- 4. automation_workflows: o browser não podia escolher o webinar do fluxo (faltava o GRANT UPDATE
--    de webinar_id); a política UPDATE passa a exigir que o webinar seja da mesma organização.
-- 5. organization_members: quem fica sem organização (funcionário removido) podia criar a
--    organização mas não a sua própria entrada como dono, e ficava trancado a carregar. Política
--    para a primeira entrada própria. Um administrador deixa de poder promover-se a dono ou
--    apagar o dono.
-- 6. credit_state: a função «suporte» obtinha o saldo que a RLS lhe esconde.
-- 7. is_organization_member/has_organization_role: o parâmetro _user_id deixa de servir para
--    enumerar membros de outras organizações (só o service_role o pode usar).
-- 8. automation_group_sends: um envio por grupo e por sessão, com trinco na base (dois executores
--    em simultâneo publicavam duas vezes no grupo).

-- 1. WhatsApp ligado na organização
CREATE OR REPLACE FUNCTION public.automations_channels_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE missing text;
BEGIN
  IF NEW.active AND NEW.steps IS NOT NULL
     AND NOT coalesce((SELECT o.is_test FROM organizations o WHERE o.id = NEW.organization_id), false) THEN
    SELECT string_agg(DISTINCT s->>'channel', ', ') INTO missing
      FROM jsonb_array_elements(NEW.steps->'nodes') n
     CROSS JOIN LATERAL jsonb_array_elements(coalesce(n->'sends', '[]'::jsonb)) s
     WHERE n->>'kind' = 'action'
       AND s->>'channel' <> 'webhook'
       AND NOT (s->>'channel' = 'whatsapp' AND EXISTS (
             SELECT 1 FROM integrations i
              WHERE i.organization_id = NEW.organization_id AND i.provider = 'whatsapp' AND i.enabled));
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'Sem fornecedor configurado para: %. Guarde a automação desligada.', missing
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2. As condições que se confirmam outra vez antes de cada mensagem (workflow.ts conditionsAtSend).
CREATE OR REPLACE FUNCTION public.automation_conditions_at_send(_trigger text, _conditions jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _trigger = 'webinar_session_ended'
    THEN coalesce((SELECT jsonb_agg(c) FROM jsonb_array_elements(coalesce(_conditions, '[]'::jsonb)) c
                    WHERE c->>'fact' NOT IN ('entered', 'attended', 'no_show', 'reached_pitch', 'reached_offer',
                                             'left_early', 'saw_offer', 'actual_watch_seconds', 'entry_seconds')),
                  '[]'::jsonb)
    ELSE coalesce(_conditions, '[]'::jsonb) END
$$;
REVOKE EXECUTE ON FUNCTION public.automation_conditions_at_send(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.automation_runs_tick() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE made_ready integer;
BEGIN
  UPDATE real_purchase_events r SET status = 'abandoned'
    FROM (SELECT intelligence_setting('checkout_abandoned_hours')::integer AS hours) s
   WHERE r.status = 'pending'
     AND r.status_at < now() - make_interval(hours => s.hours)
     AND r.status_at > now() - make_interval(hours => s.hours) - interval '7 days';

  UPDATE automation_runs SET
      status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'waiting' END,
      scheduled_for = CASE WHEN attempts >= 3 THEN scheduled_for ELSE now() END,
      finished_at = CASE WHEN attempts >= 3 THEN now() END,
      error = 'A execução foi interrompida antes de terminar.',
      locked_until = NULL, updated_at = now()
   WHERE status = 'running' AND locked_until < now();

  WITH due AS (
    SELECT r.id, r.status, a.active, f.facts,
           automation_conditions_met(automation_conditions_at_send(a.trigger_event, a.conditions), f.facts) AS holds
      FROM automation_runs r
      JOIN automations a ON a.id = r.automation_id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN r.occurrence_key LIKE 'webinar_session_%'
          THEN (SELECT sf.facts FROM automation_session_facts(r.webinar_session_id) sf
                 WHERE sf.contact_id = r.contact_id)
          ELSE automation_contact_facts(r.contact_id, r.webinar_id) END AS facts) f ON true
     WHERE r.status IN ('waiting', 'ready') AND r.scheduled_for <= now()
       FOR UPDATE OF r SKIP LOCKED
  )
  UPDATE automation_runs r SET
      status = CASE WHEN d.active AND d.holds THEN 'ready' ELSE 'cancelled' END,
      finished_at = CASE WHEN d.active AND d.holds THEN NULL ELSE now() END,
      result = CASE WHEN d.active AND d.holds THEN r.result
                    ELSE jsonb_build_object(
                      'cancelled', CASE WHEN d.active THEN 'conditions' ELSE 'inactive' END,
                      'facts', d.facts) END,
      updated_at = now()
    FROM due d
   WHERE r.id = d.id AND r.status = d.status
     AND (r.status = 'waiting' OR NOT (d.active AND d.holds));
  GET DIAGNOSTICS made_ready = ROW_COUNT;
  RETURN made_ready;
END $$;

CREATE OR REPLACE FUNCTION public.automation_recheck_contact(_organization_id uuid, _contact_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cancelled integer;
BEGIN
  WITH stale AS (
    SELECT r.id, f.facts
      FROM automation_runs r
      JOIN automations a ON a.id = r.automation_id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN r.occurrence_key LIKE 'webinar_session_%'
          THEN (SELECT sf.facts FROM automation_session_facts(r.webinar_session_id) sf
                 WHERE sf.contact_id = r.contact_id)
          ELSE automation_contact_facts(r.contact_id, r.webinar_id) END AS facts) f ON true
     WHERE r.organization_id = _organization_id AND r.contact_id = _contact_id
       AND r.status IN ('waiting', 'ready')
       AND NOT (automation_conditions_met(automation_conditions_at_send(a.trigger_event, a.conditions), f.facts)
                AND automation_conditions_met(
             (SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM jsonb_array_elements(r.guards) g
               WHERE f.facts->>(g->>'fact') IS NOT NULL), f.facts))
       FOR UPDATE OF r SKIP LOCKED
  )
  UPDATE automation_runs r SET
      status = 'cancelled', finished_at = now(), locked_until = NULL, updated_at = now(),
      result = jsonb_build_object('cancelled', 'conditions', 'facts', s.facts)
    FROM stale s
   WHERE r.id = s.id AND r.status IN ('waiting', 'ready');
  GET DIAGNOSTICS cancelled = ROW_COUNT;
  RETURN cancelled;
END $$;

-- 3. Atribuição da compra: oferta → assistiu → inscreveu-se (a mais recente na janela).
CREATE OR REPLACE FUNCTION public.purchase_attribution(
  _contact_id uuid, _product_id text, _at timestamptz DEFAULT now()
) RETURNS TABLE (webinar_id uuid, evidence text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.webinar_id, c.evidence FROM (
    (SELECT f.webinar_id, 'offer'::text AS evidence, 1 AS priority
       FROM participant_facts f
       JOIN webinars w ON w.id = f.webinar_id
      WHERE f.contact_id = _contact_id
        AND f.joined_at <= _at
        AND length(btrim(coalesce(_product_id, ''))) >= 4
        -- O id inteiro, entre separadores do link (/ = ? & #): «1234» não pode bater com «…/12345».
        AND coalesce(w.cta_url, '') ~ ('(^|[/=?&#])' || regexp_replace(btrim(_product_id), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '($|[/?&#])')
      ORDER BY f.joined_at DESC
      LIMIT 1)
    UNION ALL
    (SELECT f.webinar_id, 'attended'::text, 2
       FROM participant_facts f
      WHERE f.contact_id = _contact_id
        AND f.attended
        AND f.joined_at <= _at
        AND coalesce(f.last_progress_at, f.joined_at)
            > _at - make_interval(days => intelligence_setting('attribution_window_days')::integer)
      ORDER BY coalesce(f.last_progress_at, f.joined_at) DESC
      LIMIT 1)
    UNION ALL
    (SELECT f.webinar_id, 'registered'::text, 3
       FROM participant_facts f
      WHERE f.contact_id = _contact_id
        AND f.joined_at <= _at
        AND f.joined_at > _at - make_interval(days => intelligence_setting('attribution_window_days')::integer)
      ORDER BY f.joined_at DESC
      LIMIT 1)
  ) c
  ORDER BY c.priority
  LIMIT 1;
$$;

-- 4. O webinar do fluxo escolhe-se no browser; só webinars da mesma organização.
GRANT UPDATE (webinar_id, updated_at) ON public.automation_workflows TO authenticated;
DROP POLICY IF EXISTS automation_workflows_update ON public.automation_workflows;
CREATE POLICY automation_workflows_update ON public.automation_workflows FOR UPDATE TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner', 'admin', 'member']::workspace_role[]))
  WITH CHECK (
    public.has_organization_role(organization_id, ARRAY['owner', 'admin', 'member']::workspace_role[])
    AND (webinar_id IS NULL OR EXISTS (
      SELECT 1 FROM public.webinars w
       WHERE w.id = automation_workflows.webinar_id
         AND w.organization_id = automation_workflows.organization_id)));

-- 5. Membros: a primeira entrada própria; o dono é só do dono.
DROP POLICY IF EXISTS members_manage_admin ON public.organization_members;
CREATE POLICY members_manage_owner ON public.organization_members FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner']::public.workspace_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner']::public.workspace_role[]));
CREATE POLICY members_manage_admin ON public.organization_members FOR ALL TO authenticated
  USING (role <> 'owner' AND public.has_organization_role(organization_id, ARRAY['admin']::public.workspace_role[]))
  WITH CHECK (role <> 'owner' AND public.has_organization_role(organization_id, ARRAY['admin']::public.workspace_role[]));
CREATE POLICY members_insert_own_first ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND role = 'owner'
    AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.created_by = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = organization_members.organization_id));

-- 6. O saldo não é para a função «suporte».
CREATE OR REPLACE FUNCTION public.credit_state(_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  plan_name text;
  cap bigint;
  this_period text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  allowance bigint;
  prev record;
  unused bigint;
  total bigint;
  spent bigint;
  granted bigint;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.is_organization_member(_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização.';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND public.is_support_only(_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso ao saldo.';
  END IF;
  SELECT plan, ai_monthly_cap_micros INTO plan_name, cap FROM organizations WHERE id = _organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organização não encontrada.'; END IF;

  INSERT INTO credit_ledger (organization_id, amount_micros, kind, action, description, period)
  VALUES (_organization_id, 2000000, 'grant', 'welcome', 'Saldo de boas-vindas', 'welcome')
  ON CONFLICT (organization_id, period) WHERE kind = 'grant' DO NOTHING;

  FOR prev IN
    SELECT g.period, g.amount_micros
    FROM credit_ledger g
    WHERE g.organization_id = _organization_id AND g.kind = 'grant' AND g.action = 'plan'
      AND g.period < this_period
      AND NOT EXISTS (
        SELECT 1 FROM credit_ledger e
        WHERE e.organization_id = _organization_id AND e.kind = 'expire' AND e.period = g.period
      )
  LOOP
    SELECT greatest(0, prev.amount_micros + coalesce(sum(u.amount_micros), 0)) INTO unused
    FROM credit_ledger u
    WHERE u.organization_id = _organization_id AND u.kind = 'usage'
      AND to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = prev.period;
    SELECT coalesce(sum(amount_micros), 0) INTO total FROM credit_ledger WHERE organization_id = _organization_id;
    unused := least(unused, greatest(total, 0));
    INSERT INTO credit_ledger (organization_id, amount_micros, kind, action, description, period)
    VALUES (_organization_id, -unused, 'expire', 'plan', 'Saldo do plano não usado (' || prev.period || ')', prev.period)
    ON CONFLICT (organization_id, period) WHERE kind = 'expire' DO NOTHING;
  END LOOP;

  allowance := plan_monthly_allowance_micros(plan_name);
  IF allowance > 0 THEN
    INSERT INTO credit_ledger (organization_id, amount_micros, kind, action, description, period)
    VALUES (_organization_id, allowance, 'grant', 'plan', 'Saldo do plano (' || this_period || ')', this_period)
    ON CONFLICT (organization_id, period) WHERE kind = 'grant' DO NOTHING;
  END IF;

  SELECT coalesce(sum(amount_micros), 0) INTO total FROM credit_ledger WHERE organization_id = _organization_id;
  SELECT coalesce(-sum(amount_micros), 0) INTO spent FROM credit_ledger
  WHERE organization_id = _organization_id AND kind = 'usage' AND created_at >= month_start;
  SELECT coalesce(sum(amount_micros), 0) INTO granted FROM credit_ledger
  WHERE organization_id = _organization_id AND kind = 'grant' AND action = 'plan' AND period = this_period;

  RETURN jsonb_build_object(
    'balance_micros', total,
    'month_spent_micros', spent,
    'plan', plan_name,
    'plan_allowance_micros', allowance,
    'plan_remaining_micros', greatest(0, least(total, granted - spent)),
    'cap_micros', cap
  );
END $$;

-- 7. O _user_id só vale para o service_role; para os outros é sempre o próprio.
CREATE OR REPLACE FUNCTION public.is_organization_member(_organization_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE organization_id = _organization_id
       AND user_id = CASE WHEN coalesce(auth.role(), '') = 'service_role' THEN _user_id ELSE auth.uid() END)
$$;
CREATE OR REPLACE FUNCTION public.has_organization_role(_organization_id uuid, _roles public.workspace_role[], _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE organization_id = _organization_id
       AND user_id = CASE WHEN coalesce(auth.role(), '') = 'service_role' THEN _user_id ELSE auth.uid() END
       AND role = ANY(_roles))
$$;

-- 8. Um envio por grupo e por sessão, com trinco na base.
CREATE TABLE IF NOT EXISTS public.automation_group_sends (
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  "group" text NOT NULL,
  scope_id text NOT NULL DEFAULT '',
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (automation_id, node_id, "group", scope_id)
);
ALTER TABLE public.automation_group_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_group_sends FROM anon, authenticated;
GRANT ALL ON public.automation_group_sends TO service_role;

NOTIFY pgrst, 'reload schema';
