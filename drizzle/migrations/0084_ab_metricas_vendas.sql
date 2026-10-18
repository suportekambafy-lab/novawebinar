-- Teste A/B: as vendas que contam nos resultados (ab_test_metrics).
--  1. Só vendas aprovadas: uma venda pendente ou reembolsada contava como compra e receita.
--  2. Uma venda presa ao webinar de qualquer variante do teste conta para a variante de quem comprou
--     (o checkout partilhado, ou o receptor configurado num só webinar). Antes só contava quando a venda
--     era do webinar da própria variante, e quem estava na outra nunca aparecia como comprador.
-- O resto da função fica igual.
--
-- Desfazer: voltar a aplicar a definição anterior (JOIN rows r ON rp.webinar_id = r.webinar_id, sem estado).

CREATE OR REPLACE FUNCTION public.ab_test_metrics(p_test uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v_mode text; v_result jsonb;
BEGIN
  SELECT organization_id, assignment_mode INTO v_org, v_mode FROM ab_tests WHERE id = p_test;
  IF v_org IS NULL OR NOT (public.is_organization_member(v_org) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH vs AS (
    SELECT v.id, v.label, v.name, v.webinar_id, v.traffic_percentage, v.position,
      GREATEST(1, COALESCE(NULLIF(vsrc.duration_seconds,0), w.duration_seconds, 1)) AS dur,
      w.pitch_seconds, w.public_title
    FROM ab_test_variants v
    LEFT JOIN webinars w ON w.id = v.webinar_id
    LEFT JOIN video_sources vsrc ON vsrc.id = w.video_source_id
    WHERE v.ab_test_id = p_test
  ), exp AS (
    SELECT DISTINCT visitor_id FROM ab_test_events
    WHERE ab_test_id = p_test AND event_type = 'ab_exposure' AND visitor_id IS NOT NULL
  ), rows AS (
    SELECT a.id AS assignment_id, a.variant_id, a.device, a.utm_source, a.assigned_at, vs.dur, vs.pitch_seconds,
      p.id AS pid, COALESCE(p.watched_seconds,0) AS watched, COALESCE(p.cta_clicked,false) AS clicked,
      COALESCE(lower(p.email), lower(a.email)) AS email, vs.webinar_id,
      EXISTS (SELECT 1 FROM cta_events c WHERE c.participant_id = p.id AND c.event_type = 'view') AS offer_seen,
      EXISTS (SELECT 1 FROM exp WHERE exp.visitor_id = a.visitor_id) AS exposed
    FROM ab_test_assignments a JOIN vs ON vs.id = a.variant_id
    LEFT JOIN participants p ON p.id = a.participant_id
    WHERE a.ab_test_id = p_test
  ), matched AS (
    SELECT DISTINCT ON (rp.id) rp.id AS purchase_id, r.assignment_id, public.ab_parse_amount(rp.amount) AS amt
    FROM real_purchase_events rp
    JOIN rows r ON rp.webinar_id IN (SELECT webinar_id FROM vs WHERE webinar_id IS NOT NULL)
     AND r.email IS NOT NULL AND r.email <> ''
     AND lower(rp.buyer_email) = r.email AND rp.created_at >= r.assigned_at
    WHERE COALESCE(rp.status, 'approved') = 'approved'
    ORDER BY rp.id, r.assigned_at DESC
  ), buys AS (
    SELECT assignment_id, count(*) AS n, sum(amt) AS revenue FROM matched GROUP BY assignment_id
  ), full_rows AS (
    SELECT r.*, COALESCE(b.revenue,0) AS revenue, (b.n IS NOT NULL) AS bought
    FROM rows r LEFT JOIN buys b ON b.assignment_id = r.assignment_id
  ), per_variant AS (
    SELECT vs.id, jsonb_build_object(
      'id', vs.id, 'label', vs.label, 'name', vs.name, 'webinarId', vs.webinar_id,
      'webinarTitle', vs.public_title, 'traffic', vs.traffic_percentage, 'position', vs.position,
      'durationSeconds', vs.dur, 'pitchSeconds', vs.pitch_seconds,
      'visitors', count(f.assignment_id),
      'exposures', count(*) FILTER (WHERE f.exposed),
      'exposedOfferViews', count(*) FILTER (WHERE f.exposed AND f.offer_seen),
      'exposedBuyers', count(*) FILTER (WHERE f.exposed AND f.bought),
      'participants', count(f.pid),
      'started', count(*) FILTER (WHERE f.watched > 0),
      'p25', count(*) FILTER (WHERE f.watched > 0 AND f.watched >= f.dur*0.25),
      'p50', count(*) FILTER (WHERE f.watched > 0 AND f.watched >= f.dur*0.5),
      'p75', count(*) FILTER (WHERE f.watched > 0 AND f.watched >= f.dur*0.75),
      'p90', count(*) FILTER (WHERE f.watched > 0 AND f.watched >= f.dur*0.9),
      'completed', count(*) FILTER (WHERE f.watched > 0 AND f.watched >= f.dur*0.98),
      'pitch', CASE WHEN vs.pitch_seconds IS NULL THEN NULL ELSE count(*) FILTER (WHERE f.watched > 0 AND f.watched >= vs.pitch_seconds) END,
      'offerViews', count(*) FILTER (WHERE f.offer_seen),
      'clicks', count(*) FILTER (WHERE f.clicked),
      'buyers', count(*) FILTER (WHERE f.bought),
      'revenue', COALESCE(sum(f.revenue),0),
      'revenueSq', COALESCE(sum(f.revenue*f.revenue),0),
      'watchedTotal', COALESCE(sum(f.watched) FILTER (WHERE f.watched > 0),0),
      'retention', (SELECT jsonb_agg(c ORDER BY i) FROM (
          SELECT i, (SELECT count(*) FROM full_rows f2 WHERE f2.variant_id = vs.id AND f2.watched > 0 AND f2.watched >= vs.dur * i / 20.0) AS c
          FROM generate_series(0,20) i) t),
      'devices', (SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('visitors', nv, 'buyers', nb)), '{}'::jsonb) FROM (
          SELECT COALESCE(NULLIF(f3.device,''),'desconhecido') k, count(*) nv, count(*) FILTER (WHERE f3.bought) nb
          FROM full_rows f3 WHERE f3.variant_id = vs.id GROUP BY 1) d),
      'sources', (SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('visitors', nv, 'buyers', nb)), '{}'::jsonb) FROM (
          SELECT COALESCE(NULLIF(lower(f4.utm_source),''),'direto') k, count(*) nv, count(*) FILTER (WHERE f4.bought) nb
          FROM full_rows f4 WHERE f4.variant_id = vs.id GROUP BY 1) s)
    ) AS j, vs.position
    FROM vs LEFT JOIN full_rows f ON f.variant_id = vs.id
    GROUP BY vs.id, vs.label, vs.name, vs.webinar_id, vs.public_title, vs.traffic_percentage, vs.position, vs.dur, vs.pitch_seconds
  )
  SELECT jsonb_build_object('variants', COALESCE(jsonb_agg(j ORDER BY position), '[]'::jsonb),
    'assignmentMode', COALESCE(v_mode, 'legacy'), 'computedAt', now())
  INTO v_result FROM per_variant;
  RETURN v_result;
END $function$;
