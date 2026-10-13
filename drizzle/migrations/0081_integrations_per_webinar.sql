-- Integrações por webinar (produto): cada ligação (pixel, plataforma de venda, webhook de saída)
-- pode valer para toda a conta (webinar_id nulo) ou só para um webinar. Na sala, o pixel do webinar
-- substitui o da conta; as vendas que chegam ao receptor de um webinar ficam-lhe atribuídas sem
-- adivinhar; o webhook de saída de um webinar recebe os acontecimentos desse webinar e o da conta o
-- resto. O WhatsApp fica por conta (é um número).
-- Uma ligação por fornecedor e por âmbito: a unicidade passa a (organização, fornecedor, webinar),
-- com o nulo a contar como um valor (a ligação da conta é única).
--
-- Desfazer: ALTER TABLE integrations DROP CONSTRAINT integrations_org_provider_webinar_key, ADD CONSTRAINT
-- integrations_org_provider_key UNIQUE (organization_id, provider), DROP COLUMN webinar_id.

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS webinar_id uuid REFERENCES public.webinars(id) ON DELETE CASCADE;

ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_org_provider_key;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_org_provider_webinar_key
  UNIQUE NULLS NOT DISTINCT (organization_id, provider, webinar_id);

CREATE INDEX IF NOT EXISTS integrations_webinar_idx ON public.integrations (webinar_id);

-- O browser escolhe o âmbito ao ligar; não o muda depois (apaga e liga de novo).
GRANT INSERT (organization_id, provider, enabled, secret, settings, webinar_id) ON public.integrations TO authenticated;
-- A coluna nova também se lê no browser (a leitura é por coluna, sem o segredo).
GRANT SELECT (webinar_id) ON public.integrations TO authenticated;
