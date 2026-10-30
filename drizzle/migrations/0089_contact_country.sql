-- O país de cada contacto, na base de dados, para filtrar e contar a lista de Contactos por país.
--
-- O país é só o da inscrição mais recente com país detectado pelo endereço de rede (IP), a mesma
-- localização da Vista ao vivo. O indicativo do telefone NÃO conta: há quem viva noutro país e
-- mantenha o número de Portugal. Quem nunca se inscreveu (importado, compra de fora) fica sem país.
-- É a mesma regra de src/lib/contact-countries.ts.
--
-- 1. contact_summaries ganha, no fim, country_code (ISO, maiúsculas) e country (o nome como veio
--    da inscrição). As colunas existentes ficam pela mesma ordem.
-- 2. contact_country_breakdown: por país, quantas pessoas e em que etapa, para o filtro e o resumo.
--
-- Só IF NOT EXISTS / CREATE OR REPLACE; nenhum DROP. As assinaturas existentes mantêm-se.

CREATE INDEX IF NOT EXISTS participants_contact_country_idx
  ON public.participants (contact_id, joined_at DESC)
  WHERE country_code IS NOT NULL;

-- 1. contact_summaries: a definição da 0056, sem mudanças, mais as duas colunas do país no fim.
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
  geo.country
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
    max(rp.status_at) AS last_status_at
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

-- 2. Por país: as pessoas e as etapas (as mesmas chaves de contact_stage_counts), com o mesmo
--    âmbito (lista ou segmento, lançamento). country_code NULL = sem país.
CREATE OR REPLACE FUNCTION public.contact_country_breakdown(
  _organization_id uuid, _list_id uuid DEFAULT NULL, _webinar_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.country_code IS NULL, t.contacts DESC), '[]'::jsonb)
  FROM (
    SELECT
      country_code,
      count(*) AS contacts,
      count(*) FILTER (WHERE purchases > 0) AS customers,
      jsonb_build_object(
        'all', count(*),
        'new', count(*) FILTER (WHERE stage = 'new'),
        'no_show', count(*) FILTER (WHERE stage = 'no_show'),
        'watched', count(*) FILTER (WHERE stage = 'watched'),
        'reached_offer', count(*) FILTER (WHERE stage = 'reached_offer'),
        'clicked', count(*) FILTER (WHERE stage = 'clicked'),
        'checkout', count(*) FILTER (WHERE stage = 'checkout'),
        'customer', count(*) FILTER (WHERE stage = 'customer'),
        'returning', count(*) FILTER (WHERE events_attended >= 2)
      ) AS stages
    FROM contact_summaries
    WHERE organization_id = _organization_id
      AND (_list_id IS NULL OR id IN (SELECT public.contact_list_member_ids(_list_id)))
      AND (_webinar_id IS NULL OR _webinar_id = ANY (webinar_ids))
    GROUP BY country_code
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.contact_country_breakdown(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_country_breakdown(uuid, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
