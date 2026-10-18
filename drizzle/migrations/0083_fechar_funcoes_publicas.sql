-- Segurança: funções SECURITY DEFINER que não nasceram neste repositório (nenhum código, tarefa agendada
-- ou função do Supabase as chama) e que qualquer visitante podia chamar com a chave pública do site:
--  - ai_credit_grant: dava créditos de IA a qualquer conta, sem verificar nada;
--  - ai_credit_use / ai_credit_balance_for_org / ai_credit_sync_wallet: sem sessão, aceitavam qualquer
--    organização (gastar, «reembolsar» ou ler os créditos de outra conta);
--  - ai_token_consume: sem sessão, gastava os tokens de qualquer utilizador;
--  - presence_external_totals: reescrevia as contagens ao vivo de qualquer webinar;
--  - presence_progress_batch: mudava o tempo visto de qualquer participante;
--  - presence_beat, presence_aggregate, crm_presence_flush, welcome_send, refresh_room_config:
--    tarefas internas (enviar webhooks e mensagens, recalcular) que um visitante podia disparar.
-- Passam a ser só do sistema (service_role); quem as corre como postgres (tarefas agendadas) não muda.
--
-- Desfazer: GRANT EXECUTE ON FUNCTION <a mesma lista> TO anon, authenticated.

REVOKE EXECUTE ON FUNCTION public.ai_credit_grant(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credit_use(text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credit_balance_for_org(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credit_sync_wallet(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credit_resolve_org(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_token_consume(integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.presence_external_totals(uuid, uuid, integer, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.presence_progress_batch(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.presence_progress_batch(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.presence_beat(text, uuid, uuid, text, text, real, real, integer, boolean, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.presence_aggregate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_presence_flush() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.welcome_send(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_room_config(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.ai_credit_grant(uuid, integer, text, text),
  public.ai_credit_use(text, text, uuid, boolean),
  public.ai_credit_balance_for_org(uuid),
  public.ai_credit_sync_wallet(uuid),
  public.ai_credit_resolve_org(uuid),
  public.ai_token_consume(integer, text, text, uuid),
  public.presence_external_totals(uuid, uuid, integer, integer, integer, integer, integer, integer, integer),
  public.presence_progress_batch(jsonb),
  public.presence_progress_batch(jsonb, uuid),
  public.presence_beat(text, uuid, uuid, text, text, real, real, integer, boolean, text, text, text, boolean),
  public.presence_aggregate(),
  public.crm_presence_flush(),
  public.welcome_send(uuid, boolean),
  public.refresh_room_config(uuid)
TO service_role;
