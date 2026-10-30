-- Filtro de período nos Contactos («Hoje», «Ontem», «Esta semana»…) e o badge com a data da compra.
--
-- No período entra quem teve actividade nele: inscreveu-se, esteve na sala, pagou (ou o pagamento
-- mudou de estado) ou foi criado como contacto. Num período, «Compraram» é quem tem uma compra
-- aprovada DENTRO dele; quem já era cliente de antes conta à parte («Já eram clientes»), para o
-- badge «Cliente» não aparecer em quem não comprou naquele dia.
--
-- 1. contact_summaries ganha, no fim, last_purchase_at (a compra aprovada mais recente).
-- 2. contacts_in_period: as pessoas activas no período, com o mesmo âmbito de lista ou segmento;
--    _bought = true só quem comprou no período, false só quem não comprou nele.
-- 3. contact_period_summary: etapas, países e origens do período (o resumo e os filtros do ecrã).
--
-- Só IF NOT EXISTS / CREATE OR REPLACE; nenhum DROP. As assinaturas existentes mantêm-se.

CREATE INDEX IF NOT EXISTS participants_org_progress_idx
  ON public.participants (organization_id, last_progress_at);
CREATE INDEX IF NOT EXISTS real_purchase_events_org_status_at_idx
  ON public.real_purchase_events (organization_id, status_at);
CREATE INDEX IF NOT EXISTS contacts_org_created_idx
  ON public.contacts (organization_id, created_at);

-- 1. contact_summaries: a definição da 0089, sem mudanças, mais last_purchase_at no fim.
CREATE OR REPLACE VIEW public.contact_summaries WITH (security_invoker = on) AS
SELECT
  c.id,
  c.organization_id,
  c.name,
  c.email,
  c.phone,
  c.source,
  c.created_at,
  coalesce(p.events_registered, 0)::int AS events_registered,
  coalesce(p.events_attended, 0)::int AS events_attended,
  coalesce(p.watched_seconds, 0)::int AS watched_seconds,
  coalesce(p.saw_offer, false) AS reached_offer,
  coalesce(p.clicked_offer, false) AS clicked_offer,
  coalesce(msg.messages, 0)::int AS messages,
  coalesce(buy.purchases, 0)::int AS purchases,
  p.first_seen_at,
  coalesce(p.last_seen_at, c.created_at) AS last_seen_at,
  coalesce(p.webinar_ids, '{}') AS webinar_ids,
  coalesce(l.list_ids, '{}') AS list_ids,
  CASE
    WHEN coalesce(buy.purchases, 0) > 0 THEN 'customer'
    WHEN coalesce(buy.checkout_started, false) THEN 'checkout'
    WHEN coalesce(p.clicked_offer, false) THEN 'clicked'
    WHEN coalesce(p.saw_offer, false) THEN 'reached_offer'
    WHEN coalesce(p.events_attended, 0) > 0 THEN 'watched'
    WHEN coalesce(p.events_registered, 0) > 0 THEN 'no_show'
    ELSE 'new'
  END AS stage,
  coalesce(c.first_source, CASE WHEN c.source = 'registration' THEN 'direto' ELSE c.source END) AS first_source,
  c.first_campaign,
  coalesce(buy.checkout_started, false) AS checkout_started,
  coalesce(buy.last_status = 'failed', false) AS payment_failed,
  coalesce(buy.last_status = 'abandoned'
    OR (buy.last_status = 'pending'
        AND buy.last_status_at < now() - make_interval(hours => s.abandoned_hours)),
    false) AS checkout_abandoned,
  geo.country_code,
  geo.country,
  buy.last_purchase_at
FROM public.contacts c
CROSS JOIN (
  SELECT public.intelligence_setting('checkout_abandoned_hours')::integer AS abandoned_hours
) s
LEFT JOIN LATERAL (
  SELECT
    count(*) AS events_registered,
    count(*) FILTER (WHERE pw.attended) AS events_attended,
    sum(pw.watch_seconds) AS watched_seconds,
    bool_or(pw.saw_offer) AS saw_offer,
    bool_or(pw.clicked) AS clicked_offer,
    min(pw.first_seen) AS first_seen_at,
    max(pw.last_seen) AS last_seen_at,
    array_agg(pw.webinar_id) AS webinar_ids
  FROM (
    -- Uma linha por webinar: quem entrou em dois aparelhos conta uma vez.
    SELECT f.webinar_id,
      bool_or(f.attended) AS attended,
      max(f.actual_watch_seconds) AS watch_seconds,
      bool_or(f.saw_offer) AS saw_offer,
      bool_or(f.clicked) AS clicked,
      min(f.joined_at) AS first_seen,
      max(coalesce(f.last_progress_at, f.joined_at)) AS last_seen
    FROM public.participant_facts f
    WHERE f.contact_id = c.id
    GROUP BY f.webinar_id
  ) pw
) p ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS messages
  FROM public.private_messages m
  JOIN public.participants pa ON pa.id = m.participant_id
  WHERE pa.contact_id = c.id AND m.sender_kind = 'participant'
) msg ON true
-- Todos os pagamentos do contacto, com ou sem webinar atribuído.
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE rp.status = 'approved') AS purchases,
    count(*) > 0 AS checkout_started,
    (array_agg(rp.status ORDER BY rp.status_at DESC))[1] AS last_status,
    max(rp.status_at) AS last_status_at,
    max(rp.approved_at) FILTER (WHERE rp.status = 'approved') AS last_purchase_at
  FROM public.real_purchase_events rp
  WHERE rp.contact_id = c.id
) buy ON true
LEFT JOIN LATERAL (
  SELECT array_agg(m.list_id) AS list_ids
  FROM public.contact_list_members m
  WHERE m.contact_id = c.id
) l ON true
-- O país (pelo IP) da inscrição mais recente que o tem.
LEFT JOIN LATERAL (
  SELECT upper(pa.country_code) AS country_code, pa.country
  FROM public.participants pa
  WHERE pa.contact_id = c.id AND pa.country_code ~* '^[a-z]{2}$' AND upper(pa.country_code) <> 'XX'
  ORDER BY pa.joined_at DESC
  LIMIT 1
) geo ON true;

-- 2. Quem teve actividade no período [_from, _to).
CREATE OR REPLACE FUNCTION public.contacts_in_period(
  _organization_id uuid,
  _from timestamptz,
  _to timestamptz,
  _list_id uuid DEFAULT NULL,
  _bought boolean DEFAULT NULL
) RETURNS SETOF public.contact_summaries
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH active AS (
    SELECT p.contact_id AS id FROM participants p
     WHERE p.organization_id = _organization_id AND p.contact_id IS NOT NULL
       AND ((p.joined_at >= _from AND p.joined_at < _to)
         OR (p.last_progress_at >= _from AND p.last_progress_at < _to))
    UNION
    SELECT r.contact_id FROM real_purchase_events r
     WHERE r.organization_id = _organization_id AND r.contact_id IS NOT NULL
       AND ((r.status_at >= _from AND r.status_at < _to)
         OR (r.approved_at >= _from AND r.approved_at < _to))
    UNION
    SELECT c.id FROM contacts c
     WHERE c.organization_id = _organization_id AND c.created_at >= _from AND c.created_at < _to
  ), bought AS (
    SELECT DISTINCT r.contact_id AS id FROM real_purchase_events r
     WHERE r.organization_id = _organization_id AND r.contact_id IS NOT NULL
       AND r.status = 'approved' AND r.approved_at >= _from AND r.approved_at < _to
  )
  SELECT s.* FROM contact_summaries s
   WHERE s.organization_id = _organization_id
     AND s.id IN (SELECT id FROM active)
     AND (_list_id IS NULL OR s.id IN (SELECT public.contact_list_member_ids(_list_id)))
     AND (_bought IS NULL OR (s.id IN (SELECT id FROM bought)) = _bought)
$$;

-- 3. O resumo do período: as etapas (com «Compraram» = comprou no período e «Já eram clientes»),
--    os países e as origens, no mesmo formato de contact_stage_counts, contact_country_breakdown e
--    contact_source_breakdown.
CREATE OR REPLACE FUNCTION public.contact_period_summary(
  _organization_id uuid,
  _from timestamptz,
  _to timestamptz,
  _list_id uuid DEFAULT NULL,
  _webinar_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH s AS MATERIALIZED (
    SELECT p.*,
      CASE
        WHEN p.id IN (SELECT b.id FROM public.contacts_in_period(_organization_id, _from, _to, _list_id, true) b)
          THEN 'customer'
        WHEN p.stage = 'customer' THEN 'past_customer'
        ELSE p.stage
      END AS period_stage
    FROM public.contacts_in_period(_organization_id, _from, _to, _list_id) p
    WHERE _webinar_id IS NULL OR _webinar_id = ANY (p.webinar_ids)
  )
  SELECT jsonb_build_object(
    'stages', (SELECT jsonb_build_object(
      'all', count(*),
      'new', count(*) FILTER (WHERE period_stage = 'new'),
      'no_show', count(*) FILTER (WHERE period_stage = 'no_show'),
      'watched', count(*) FILTER (WHERE period_stage = 'watched'),
      'reached_offer', count(*) FILTER (WHERE period_stage = 'reached_offer'),
      'clicked', count(*) FILTER (WHERE period_stage = 'clicked'),
      'checkout', count(*) FILTER (WHERE period_stage = 'checkout'),
      'customer', count(*) FILTER (WHERE period_stage = 'customer'),
      'past_customer', count(*) FILTER (WHERE period_stage = 'past_customer'),
      'returning', count(*) FILTER (WHERE events_attended >= 2)
    ) FROM s),
    'countries', (SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.country_code IS NULL, t.contacts DESC), '[]'::jsonb)
      FROM (
        SELECT country_code,
          count(*) AS contacts,
          count(*) FILTER (WHERE period_stage = 'customer') AS customers,
          jsonb_build_object(
            'all', count(*),
            'new', count(*) FILTER (WHERE period_stage = 'new'),
            'no_show', count(*) FILTER (WHERE period_stage = 'no_show'),
            'watched', count(*) FILTER (WHERE period_stage = 'watched'),
            'reached_offer', count(*) FILTER (WHERE period_stage = 'reached_offer'),
            'clicked', count(*) FILTER (WHERE period_stage = 'clicked'),
            'checkout', count(*) FILTER (WHERE period_stage = 'checkout'),
            'customer', count(*) FILTER (WHERE period_stage = 'customer'),
            'past_customer', count(*) FILTER (WHERE period_stage = 'past_customer'),
            'returning', count(*) FILTER (WHERE events_attended >= 2)
          ) AS stages
        FROM s GROUP BY country_code
      ) t),
    'sources', (SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.contacts DESC), '[]'::jsonb)
      FROM (
        SELECT first_source AS source,
          count(*) AS contacts,
          count(*) FILTER (WHERE events_attended > 0) AS attended,
          count(*) FILTER (WHERE reached_offer OR clicked_offer OR checkout_started) AS reached_offer,
          count(*) FILTER (WHERE clicked_offer) AS clicked,
          count(*) FILTER (WHERE checkout_started) AS checkout,
          count(*) FILTER (WHERE period_stage = 'customer') AS customers
        FROM s GROUP BY first_source
      ) t)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.contacts_in_period(uuid, timestamptz, timestamptz, uuid, boolean),
  public.contact_period_summary(uuid, timestamptz, timestamptz, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contacts_in_period(uuid, timestamptz, timestamptz, uuid, boolean),
  public.contact_period_summary(uuid, timestamptz, timestamptz, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
