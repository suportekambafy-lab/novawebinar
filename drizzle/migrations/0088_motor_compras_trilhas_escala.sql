-- Motor de automações: compras fora do webinar, uma sequência por contacto, e escala por minuto.
-- Depende da 0082 (automation_conditions_at_send e as versões de tick e recheck que aqui se substituem).
--
-- 1. Compra fora do webinar. Os factos de compra (comprou, falhou, abandonou, reembolsou) só contavam
--    vendas presas ao mesmo webinar. Uma compra sem webinar (fora da janela de atribuição) ou feita por
--    outro webinar da mesma oferta não parava a sequência de vendas, e a pessoa recebia «ainda vai a
--    tempo» depois de pagar. E sem nenhuma inscrição o contacto não tinha factos ({}), por isso as guardas
--    («Comprou?») passavam sempre. Agora:
--     - contact_purchase_facts lê as vendas do contacto: do mesmo webinar OU da mesma oferta (o id do
--       produto no link do botão ou das ofertas extra, inteiro e entre separadores);
--     - automation_contact_facts e automation_session_facts juntam-nas sempre, mesmo sem inscrição.
--    Regra do produto: «compra aprovada cancela as sequências de venda daquela oferta».
--
-- 2. Uma sequência por contacto. A mesma automação, para o mesmo contacto e o mesmo webinar, podia ter
--    duas execuções activas (faltou à sessão de terça e à de quinta: duas sequências «Não acessou»,
--    todas as mensagens em dobro). Um gatilho deixa só a do evento mais recente; as anteriores são
--    canceladas («superseded»), mesmo a meio (o executor só envia com a execução em «running»).
--    Webinars diferentes e automações diferentes continuam independentes (correm em paralelo de
--    propósito, ex.: duas automações de pós-compra).
--
-- 3. Escala. O tick e o recheck chamavam automation_session_facts(sessão) para cada execução e filtravam
--    depois: com 2000 presentes e 3 automações, 6000 agregações da sessão inteira no mesmo minuto, e um
--    tempo esgotado desfazia tudo e parava as automações de todas as contas. Agora:
--     - automation_contact_session_facts(sessão, contacto) agrega só a pessoa (índice por sessão+contacto);
--     - o tick trata no máximo 1000 execuções por minuto (as restantes ficam para o minuto seguinte).
--
-- Só IF NOT EXISTS / CREATE OR REPLACE; nenhum DROP. As assinaturas existentes mantêm-se.

CREATE INDEX IF NOT EXISTS participants_session_contact_idx ON public.participants (webinar_session_id, contact_id);
CREATE INDEX IF NOT EXISTS real_purchase_events_contact_status_idx ON public.real_purchase_events (contact_id, status);
CREATE INDEX IF NOT EXISTS automation_runs_active_owner_idx ON public.automation_runs (automation_id, contact_id)
  WHERE status IN ('waiting', 'ready', 'running');

-- O id do produto pertence à oferta do webinar? Inteiro, entre separadores do link (/ = ? & #).
CREATE OR REPLACE FUNCTION public.offer_matches_product(_webinar_id uuid, _product_id text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN length(btrim(coalesce(_product_id, ''))) < 4 OR _webinar_id IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM webinars w
     CROSS JOIN LATERAL (
       SELECT w.cta_url AS url
       UNION ALL
       SELECT o->>'url' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.extra_offers) = 'array' THEN w.extra_offers ELSE '[]'::jsonb END) o
     ) u
     WHERE w.id = _webinar_id AND u.url IS NOT NULL
       AND u.url ~ ('(^|[/=?&#])' || regexp_replace(btrim(_product_id), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '($|[/?&#])')
  ) END;
$$;

-- Os factos de compra de um contacto para um webinar: as vendas desse webinar e as da mesma oferta.
-- Sempre com as cinco chaves (falso quando não há vendas), para as guardas nunca passarem por omissão.
CREATE OR REPLACE FUNCTION public.contact_purchase_facts(_contact_id uuid, _webinar_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
           'checkout_started', count(*) > 0,
           'purchased', coalesce(bool_or(r.status = 'approved'), false),
           'payment_failed', coalesce(bool_or(r.status = 'failed'), false) AND NOT coalesce(bool_or(r.status = 'approved'), false),
           'checkout_abandoned', coalesce(bool_or(r.status = 'abandoned'
                                   OR (r.status = 'pending' AND r.status_at < now() - make_interval(hours => s.hours))), false)
                                 AND NOT coalesce(bool_or(r.status = 'approved'), false),
           'refunded', coalesce(bool_or(r.status = 'refunded'), false) AND NOT coalesce(bool_or(r.status = 'approved'), false))
    FROM (SELECT intelligence_setting('checkout_abandoned_hours')::integer AS hours) s
    LEFT JOIN real_purchase_events r
      ON _contact_id IS NOT NULL AND r.contact_id = _contact_id
     AND (_webinar_id IS NULL OR r.webinar_id = _webinar_id OR offer_matches_product(_webinar_id, r.product_id))
   GROUP BY s.hours;
$$;

-- Factos do contacto (gatilhos de contacto): a presença como antes, as compras sempre por cima.
CREATE OR REPLACE FUNCTION public.automation_contact_facts(_contact_id uuid, _webinar_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((
    SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
             'entered', bool_or(f.first_progress_at IS NOT NULL OR f.actual_watch_seconds > 0),
             'attended', bool_or(f.attended),
             'actual_watch_seconds', max(f.actual_watch_seconds),
             'entry_seconds', min(f.entry_seconds),
             'reached_pitch', bool_or(f.reached_pitch),
             'reached_offer', bool_or(f.reached_offer),
             'left_early', bool_or(s.ended_at IS NOT NULL) AND bool_or(f.attended)
                           AND bool_or(f.offer_start_seconds IS NOT NULL) AND NOT bool_or(f.reached_offer),
             'no_show', bool_or(s.ended_at IS NOT NULL) AND NOT bool_or(f.attended),
             'replay', bool_or(f.viewing_mode = 'replay'),
             'saw_offer', bool_or(f.saw_offer),
             'clicked', bool_or(f.clicked),
             'participations', count(*)) END
      FROM participant_facts f
      LEFT JOIN webinar_sessions s ON s.id = f.webinar_session_id
     WHERE f.contact_id = _contact_id AND (_webinar_id IS NULL OR f.webinar_id = _webinar_id)
  ), '{}'::jsonb) || contact_purchase_facts(_contact_id, _webinar_id);
$$;

-- Factos de toda a sessão (o disparo do fim/início da sessão cria uma execução por presente).
CREATE OR REPLACE FUNCTION public.automation_session_facts(_session_id uuid)
RETURNS TABLE(contact_id uuid, facts jsonb)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT f.contact_id, jsonb_build_object(
           'entered', bool_or(f.first_progress_at IS NOT NULL OR f.actual_watch_seconds > 0),
           'attended', bool_or(f.attended),
           'actual_watch_seconds', max(f.actual_watch_seconds),
           'entry_seconds', min(f.entry_seconds),
           'reached_pitch', bool_or(f.reached_pitch),
           'reached_offer', bool_or(f.reached_offer),
           'left_early', e.ended AND bool_or(f.attended) AND bool_or(f.offer_start_seconds IS NOT NULL)
                         AND NOT bool_or(f.reached_offer),
           'no_show', e.ended AND NOT bool_or(f.attended),
           'replay', bool_or(f.viewing_mode = 'replay'),
           'saw_offer', bool_or(f.saw_offer),
           'clicked', bool_or(f.clicked),
           'participations', count(*)) || contact_purchase_facts(f.contact_id, e.webinar_id)
    FROM participant_facts f
   CROSS JOIN (SELECT s.webinar_id, s.ended_at IS NOT NULL AS ended FROM webinar_sessions s WHERE s.id = _session_id) e
   WHERE f.webinar_session_id = _session_id AND f.contact_id IS NOT NULL
   GROUP BY f.contact_id, e.ended, e.webinar_id;
$$;

-- Factos de UMA pessoa numa sessão: o que o tick, o recheck e o executor precisam (NULL se não esteve).
CREATE OR REPLACE FUNCTION public.automation_contact_session_facts(_session_id uuid, _contact_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
           'entered', bool_or(f.first_progress_at IS NOT NULL OR f.actual_watch_seconds > 0),
           'attended', bool_or(f.attended),
           'actual_watch_seconds', max(f.actual_watch_seconds),
           'entry_seconds', min(f.entry_seconds),
           'reached_pitch', bool_or(f.reached_pitch),
           'reached_offer', bool_or(f.reached_offer),
           'left_early', bool_or(e.ended) AND bool_or(f.attended) AND bool_or(f.offer_start_seconds IS NOT NULL)
                         AND NOT bool_or(f.reached_offer),
           'no_show', bool_or(e.ended) AND NOT bool_or(f.attended),
           'replay', bool_or(f.viewing_mode = 'replay'),
           'saw_offer', bool_or(f.saw_offer),
           'clicked', bool_or(f.clicked),
           'participations', count(*)) || contact_purchase_facts(_contact_id, max(e.webinar_id::text)::uuid) END
    FROM participant_facts f
   CROSS JOIN (SELECT s.webinar_id, s.ended_at IS NOT NULL AS ended FROM webinar_sessions s WHERE s.id = _session_id) e
   WHERE f.webinar_session_id = _session_id AND f.contact_id = _contact_id;
$$;

-- O tick (como na 0082), com os factos só da pessoa e no máximo 1000 execuções por minuto.
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

  WITH picked AS (
    SELECT r.id FROM automation_runs r
     WHERE r.status IN ('waiting', 'ready') AND r.scheduled_for <= now()
     ORDER BY r.scheduled_for
     LIMIT 1000
       FOR UPDATE OF r SKIP LOCKED
  ), due AS (
    SELECT r.id, r.status, a.active, f.facts,
           automation_conditions_met(automation_conditions_at_send(a.trigger_event, a.conditions), f.facts) AS holds
      FROM picked p
      JOIN automation_runs r ON r.id = p.id
      JOIN automations a ON a.id = r.automation_id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN r.occurrence_key LIKE 'webinar_session_%'
          THEN automation_contact_session_facts(r.webinar_session_id, r.contact_id)
          ELSE automation_contact_facts(r.contact_id, r.webinar_id) END AS facts) f ON true
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

-- O recheck depois de uma compra (como na 0082), com os factos só da pessoa.
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
          THEN automation_contact_session_facts(r.webinar_session_id, r.contact_id)
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

-- Uma execução activa por automação, contacto e webinar: fica a do evento mais recente.
CREATE OR REPLACE FUNCTION public.automation_runs_supersede() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NULL OR NEW.status NOT IN ('waiting', 'ready') THEN RETURN NULL; END IF;
  -- Duas execuções da mesma pessoa a nascer ao mesmo tempo esperam uma pela outra.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.automation_id::text || ':' || NEW.contact_id::text || ':' || coalesce(NEW.webinar_id::text, ''), 0));
  IF EXISTS (
    SELECT 1 FROM automation_runs o
     WHERE o.automation_id = NEW.automation_id AND o.contact_id = NEW.contact_id
       AND o.webinar_id IS NOT DISTINCT FROM NEW.webinar_id AND o.id <> NEW.id
       AND o.status IN ('waiting', 'ready', 'running')
       AND coalesce(o.event_id, 0) > coalesce(NEW.event_id, 0)
  ) THEN
    -- Chegou atrasada (há uma mais recente): é esta que sai.
    UPDATE automation_runs SET status = 'cancelled', finished_at = now(), locked_until = NULL, updated_at = now(),
           result = jsonb_build_object('cancelled', 'superseded')
     WHERE id = NEW.id;
  ELSE
    UPDATE automation_runs o SET status = 'cancelled', finished_at = now(), locked_until = NULL, updated_at = now(),
           result = jsonb_build_object('cancelled', 'superseded', 'by', NEW.id)
     WHERE o.automation_id = NEW.automation_id AND o.contact_id = NEW.contact_id
       AND o.webinar_id IS NOT DISTINCT FROM NEW.webinar_id AND o.id <> NEW.id
       AND o.status IN ('waiting', 'ready', 'running');
  END IF;
  RETURN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'automation_runs_supersede' AND tgrelid = 'public.automation_runs'::regclass) THEN
    CREATE TRIGGER automation_runs_supersede AFTER INSERT ON public.automation_runs
      FOR EACH ROW EXECUTE FUNCTION public.automation_runs_supersede();
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.offer_matches_product(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contact_purchase_facts(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_contact_facts(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_session_facts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_contact_session_facts(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_runs_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_recheck_contact(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_runs_supersede() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.offer_matches_product(uuid, text),
  public.contact_purchase_facts(uuid, uuid),
  public.automation_contact_facts(uuid, uuid),
  public.automation_session_facts(uuid),
  public.automation_contact_session_facts(uuid, uuid),
  public.automation_runs_tick(),
  public.automation_recheck_contact(uuid, uuid)
TO service_role;
