-- Testes A/B. As cinco tabelas e as funções ab_assign / ab_test_metrics vieram do projecto antigo sem
-- chaves estrangeiras, índices, políticas nem permissões. Este ficheiro fecha isso sem tocar nos dados.
--
-- Modelo: um teste tem um endereço público próprio (slug) e duas ou mais variantes, cada uma com o seu
-- webinar e uma fatia do tráfego. Quem abre o endereço do teste recebe uma variante (ab_test_assignments)
-- e vê a sala desse webinar; o que a pessoa fez fica em participants; as compras cruzam-se por e-mail.

-- ---------- Chaves estrangeiras ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_tests_organization_id_fkey') THEN
    ALTER TABLE public.ab_tests ADD CONSTRAINT ab_tests_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_variants_ab_test_id_fkey') THEN
    ALTER TABLE public.ab_test_variants ADD CONSTRAINT ab_test_variants_ab_test_id_fkey
      FOREIGN KEY (ab_test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_variants_organization_id_fkey') THEN
    ALTER TABLE public.ab_test_variants ADD CONSTRAINT ab_test_variants_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_variants_webinar_id_fkey') THEN
    ALTER TABLE public.ab_test_variants ADD CONSTRAINT ab_test_variants_webinar_id_fkey
      FOREIGN KEY (webinar_id) REFERENCES public.webinars(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_tests_applied_variant_id_fkey') THEN
    ALTER TABLE public.ab_tests ADD CONSTRAINT ab_tests_applied_variant_id_fkey
      FOREIGN KEY (applied_variant_id) REFERENCES public.ab_test_variants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_assignments_ab_test_id_fkey') THEN
    ALTER TABLE public.ab_test_assignments ADD CONSTRAINT ab_test_assignments_ab_test_id_fkey
      FOREIGN KEY (ab_test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_assignments_variant_id_fkey') THEN
    ALTER TABLE public.ab_test_assignments ADD CONSTRAINT ab_test_assignments_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.ab_test_variants(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_assignments_organization_id_fkey') THEN
    ALTER TABLE public.ab_test_assignments ADD CONSTRAINT ab_test_assignments_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_assignments_participant_id_fkey') THEN
    ALTER TABLE public.ab_test_assignments ADD CONSTRAINT ab_test_assignments_participant_id_fkey
      FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_events_ab_test_id_fkey') THEN
    ALTER TABLE public.ab_test_events ADD CONSTRAINT ab_test_events_ab_test_id_fkey
      FOREIGN KEY (ab_test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_events_variant_id_fkey') THEN
    ALTER TABLE public.ab_test_events ADD CONSTRAINT ab_test_events_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.ab_test_variants(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_events_organization_id_fkey') THEN
    ALTER TABLE public.ab_test_events ADD CONSTRAINT ab_test_events_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_events_assignment_id_fkey') THEN
    ALTER TABLE public.ab_test_events ADD CONSTRAINT ab_test_events_assignment_id_fkey
      FOREIGN KEY (assignment_id) REFERENCES public.ab_test_assignments(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_events_participant_id_fkey') THEN
    ALTER TABLE public.ab_test_events ADD CONSTRAINT ab_test_events_participant_id_fkey
      FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_events_webinar_id_fkey') THEN
    ALTER TABLE public.ab_test_events ADD CONSTRAINT ab_test_events_webinar_id_fkey
      FOREIGN KEY (webinar_id) REFERENCES public.webinars(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_history_ab_test_id_fkey') THEN
    ALTER TABLE public.ab_test_history ADD CONSTRAINT ab_test_history_ab_test_id_fkey
      FOREIGN KEY (ab_test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_test_history_organization_id_fkey') THEN
    ALTER TABLE public.ab_test_history ADD CONSTRAINT ab_test_history_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_tests_objective_chk') THEN
    ALTER TABLE public.ab_tests ADD CONSTRAINT ab_tests_objective_chk CHECK (objective IN
      ('conversions', 'revenue', 'revenue_per_participant', 'registrations', 'attendance', 'retention', 'pitch', 'clicks'));
  END IF;
END $$;

-- ---------- Obrigatórios (os dados existentes já os têm) ----------
ALTER TABLE public.ab_tests
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN slug SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN objective SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.ab_test_variants
  ALTER COLUMN ab_test_id SET NOT NULL,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN label SET NOT NULL,
  ALTER COLUMN traffic_percentage SET NOT NULL,
  ALTER COLUMN position SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.ab_test_assignments
  ALTER COLUMN ab_test_id SET NOT NULL,
  ALTER COLUMN variant_id SET NOT NULL,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN visitor_id SET NOT NULL,
  ALTER COLUMN assigned_at SET NOT NULL;
ALTER TABLE public.ab_test_events
  ALTER COLUMN ab_test_id SET NOT NULL,
  ALTER COLUMN variant_id SET NOT NULL,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.ab_test_history
  ALTER COLUMN ab_test_id SET NOT NULL,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

-- ---------- Índices ----------
CREATE INDEX IF NOT EXISTS ab_tests_organization_status_idx ON public.ab_tests (organization_id, status);
CREATE INDEX IF NOT EXISTS ab_test_variants_test_idx ON public.ab_test_variants (ab_test_id, position);
CREATE INDEX IF NOT EXISTS ab_test_variants_webinar_idx ON public.ab_test_variants (webinar_id);
CREATE INDEX IF NOT EXISTS ab_test_assignments_test_variant_idx ON public.ab_test_assignments (ab_test_id, variant_id);
CREATE INDEX IF NOT EXISTS ab_test_assignments_email_idx ON public.ab_test_assignments (organization_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS ab_test_assignments_participant_idx ON public.ab_test_assignments (participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ab_test_events_test_idx ON public.ab_test_events (ab_test_id, variant_id, event_type);
CREATE UNIQUE INDEX IF NOT EXISTS ab_test_events_idempotency_idx ON public.ab_test_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ab_test_history_test_idx ON public.ab_test_history (ab_test_id, created_at DESC);

-- ---------- updated_at ----------
CREATE OR REPLACE FUNCTION public.ab_tests_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.ab_tests_touch() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ab_tests_touch ON public.ab_tests;
CREATE TRIGGER ab_tests_touch BEFORE UPDATE ON public.ab_tests
  FOR EACH ROW EXECUTE FUNCTION public.ab_tests_touch();

-- ---------- Acesso ----------
-- Quem é da organização lê tudo; escreve-se só pelo servidor (chave de serviço), que valida e regista
-- o histórico. O público (anon) nunca toca nestas tabelas: a atribuição corre no servidor.
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ab_tests_members_read ON public.ab_tests;
CREATE POLICY ab_tests_members_read ON public.ab_tests FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
DROP POLICY IF EXISTS ab_test_variants_members_read ON public.ab_test_variants;
CREATE POLICY ab_test_variants_members_read ON public.ab_test_variants FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
DROP POLICY IF EXISTS ab_test_assignments_members_read ON public.ab_test_assignments;
CREATE POLICY ab_test_assignments_members_read ON public.ab_test_assignments FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
DROP POLICY IF EXISTS ab_test_events_members_read ON public.ab_test_events;
CREATE POLICY ab_test_events_members_read ON public.ab_test_events FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
DROP POLICY IF EXISTS ab_test_history_members_read ON public.ab_test_history;
CREATE POLICY ab_test_history_members_read ON public.ab_test_history FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));

REVOKE ALL ON public.ab_tests, public.ab_test_variants, public.ab_test_assignments, public.ab_test_events, public.ab_test_history
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ab_tests, public.ab_test_variants, public.ab_test_assignments, public.ab_test_events, public.ab_test_history
  TO authenticated;
GRANT ALL ON public.ab_tests, public.ab_test_variants, public.ab_test_assignments, public.ab_test_events, public.ab_test_history
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ab_test_events_id_seq TO service_role;

-- A atribuição é só do servidor; as métricas verificam elas próprias quem é membro.
REVOKE EXECUTE ON FUNCTION public.ab_assign(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ab_parse_amount(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ab_test_metrics(uuid) TO authenticated, service_role;
