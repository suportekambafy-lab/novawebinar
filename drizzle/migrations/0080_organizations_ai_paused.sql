-- Atendimento: o interruptor «Agente IA em todas as conversas». Em pausa, nenhuma mensagem de
-- participante é respondida pela IA em nenhuma conversa da organização: todas abrem um caso para a
-- equipa, como já acontece com a pausa numa só conversa (private_conversations.ai_paused).
-- A escrita passa pela função de servidor (só quem atende); a leitura é a dos membros.
--
-- Desfazer: ALTER TABLE public.organizations DROP COLUMN ai_paused.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false;
