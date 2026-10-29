-- Segurança: funções que vieram do projecto antigo (nenhuma migração deste repositório as cria, nenhum
-- código, tarefa agendada ou função do Supabase as chama) e que qualquer visitante podia chamar com a
-- chave pública do site. Verificado em produção a 29/10/2026: anon lia o saldo de créditos de IA de
-- qualquer organização (ai_credit_balance_for_org) e resolvia utilizadores em organizações.
--  - ai_credit_grant: dava créditos de IA a qualquer conta, sem verificar nada;
--  - ai_credit_use / ai_credit_balance / ai_credit_balance_for_org / ai_credit_sync_wallet /
--    ai_credit_resolve_org / ai_credit_is_member: sem sessão, aceitavam qualquer organização
--    (gastar, «reembolsar», ler os créditos de outra conta, descobrir membros);
--  - ai_token_consume / ai_token_balance: gastavam e liam os tokens de qualquer utilizador;
--  - presence_external_totals / presence_progress_batch / presence_beat: reescreviam contagens ao vivo
--    e o tempo visto de qualquer participante;
--  - presence_aggregate, crm_presence_flush, welcome_send, welcome_default_text, refresh_room_config,
--    rls_auto_enable: tarefas internas (enviar mensagens e webhooks, recalcular) que um visitante
--    podia disparar.
--
-- Fecha-se pelo NOME, em todas as variantes (a versão anterior desta migração revogava assinaturas
-- exactas e falhava inteira se uma delas fosse diferente em produção). Passam a ser só do sistema
-- (service_role); quem as corre como postgres (tarefas agendadas, gatilhos) não muda: um gatilho não
-- precisa de EXECUTE para disparar.
--
-- No fim, a própria migração confirma que nenhuma ficou chamável por anon ou authenticated; se ficar,
-- falha e nada é aplicado.
--
-- Desfazer: GRANT EXECUTE ON FUNCTION <função>(<argumentos>) TO anon, authenticated, para cada uma.

DO $$
DECLARE
  internal text[] := ARRAY[
    'ai_credit_grant', 'ai_credit_use', 'ai_credit_balance', 'ai_credit_balance_for_org',
    'ai_credit_sync_wallet', 'ai_credit_resolve_org', 'ai_credit_is_member',
    'ai_token_consume', 'ai_token_balance',
    'presence_external_totals', 'presence_progress_batch', 'presence_beat', 'presence_aggregate',
    'crm_presence_flush', 'welcome_send', 'welcome_default_text', 'refresh_room_config', 'rls_auto_enable'
  ];
  fn record;
  closed integer := 0;
  still_open text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (internal)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    closed := closed + 1;
  END LOOP;
  RAISE NOTICE 'Funções internas fechadas: %', closed;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO still_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (internal)
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF still_open IS NOT NULL THEN
    RAISE EXCEPTION 'Ainda chamáveis por anon/authenticated: %', still_open;
  END IF;
END $$;
