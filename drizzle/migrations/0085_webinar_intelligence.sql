-- Webinar Intelligence: um endereço único que decide o webinar pela pessoa.
--
-- O organizador escolhe um webinar favorito (para quem chega pela primeira vez) e um secundário (para quem
-- já viu um webinar da organização). O endereço é fixo; a decisão corre no servidor a cada visita e fica
-- registada em smart_link_visits (nova ou repetente), para a página mostrar quantos foram para cada lado.
-- Fora dos testes A/B: tabelas, página e resolvedor próprios.

CREATE TABLE IF NOT EXISTS public.smart_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  -- O favorito: quem chega de novo vai para aqui.
  primary_webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  -- O secundário: quem já viu um webinar da organização vai para aqui. Sem ele, vai todo para o favorito.
  secondary_webinar_id uuid REFERENCES public.webinars(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smart_links_status_chk') THEN
    ALTER TABLE public.smart_links ADD CONSTRAINT smart_links_status_chk CHECK (status IN ('active', 'paused'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smart_links_slug_chk') THEN
    ALTER TABLE public.smart_links ADD CONSTRAINT smart_links_slug_chk CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 48);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS smart_links_slug_idx ON public.smart_links (slug);
CREATE INDEX IF NOT EXISTS smart_links_organization_idx ON public.smart_links (organization_id, status);

CREATE TABLE IF NOT EXISTS public.smart_link_visits (
  id bigserial PRIMARY KEY,
  smart_link_id uuid NOT NULL REFERENCES public.smart_links(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- O cookie anónimo de um ano (o mesmo dos testes A/B, nw_visitor).
  visitor_id text NOT NULL,
  webinar_id uuid REFERENCES public.webinars(id) ON DELETE SET NULL,
  -- Verdadeiro quando a pessoa já tinha visto um webinar da organização: foi para o secundário.
  returning_visitor boolean NOT NULL DEFAULT false,
  -- Como se soube que já tinha visto: cookie, visita anterior, e-mail ou WhatsApp; vazio quando é nova.
  known_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS smart_link_visits_link_idx ON public.smart_link_visits (smart_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS smart_link_visits_visitor_idx ON public.smart_link_visits (organization_id, visitor_id);

-- updated_at
CREATE OR REPLACE FUNCTION public.smart_links_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.smart_links_touch() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'smart_links_touch' AND tgrelid = 'public.smart_links'::regclass) THEN
    CREATE TRIGGER smart_links_touch BEFORE UPDATE ON public.smart_links
      FOR EACH ROW EXECUTE FUNCTION public.smart_links_touch();
  END IF;
END $$;

-- Acesso: quem é da organização lê; escreve-se só pelo servidor (chave de serviço). O público nunca toca
-- nestas tabelas: a decisão do webinar corre no servidor.
ALTER TABLE public.smart_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_link_visits ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['smart_links', 'smart_link_visits'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_members_read') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_organization_member(organization_id))',
        t || '_members_read', t
      );
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON public.smart_links, public.smart_link_visits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.smart_links, public.smart_link_visits TO authenticated;
GRANT ALL ON public.smart_links, public.smart_link_visits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.smart_link_visits_id_seq TO service_role;
