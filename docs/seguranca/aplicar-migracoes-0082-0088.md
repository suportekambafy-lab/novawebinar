# Aplicar as migrações 0082 a 0088

Estado a 29/10/2026: **nenhuma destas migrações está aplicada** em produção (`nazhbxrhoailjwillzju`). O acesso
SQL desta sessão foi retirado, por isso o SQL fica aqui pronto, pela ordem certa, com verificações antes e
depois. Todas foram aplicadas e testadas num Postgres 18 local com a cadeia completa de migrações do
repositório (0000–0081) e dados fictícios.

| Ordem | Ficheiro | O que fecha | Testado localmente |
|---|---|---|---|
| 1 | `0082_auditoria_motor_e_seguranca.sql` | Canais da automação, condições na reavaliação, atribuição da compra (id de produto exacto), políticas de membros, saldo escondido ao «suporte», `is_organization_member`/`has_organization_role` sem enumeração de membros de outras contas, trinco de envios a grupos | Aplica sem erros |
| 2 | `0083_fechar_funcoes_publicas.sql` | 18 funções do projecto antigo chamáveis por anon (créditos, presença, boas-vindas) | Aplica, fecha todas as variantes, confirma-se a si própria, idempotente |
| 3 | `0084_ab_metricas_vendas.sql` | Métricas A/B: só vendas aprovadas | Não testável localmente (as tabelas A/B vieram do projecto antigo); só substitui a função |
| 4 | `0085_webinar_intelligence.sql` | **Já aplicada** (22/10) | — |
| 5 | `0086_creditos_atomicos.sql` | Saldo de créditos nunca negativo por uso, com concorrência | 14/14 verificações, 50 ligações em simultâneo |
| 6 | `0087_reembolsos_creditos.sql` | Reembolsos retiram créditos, proporcionais, idempotentes, sem excesso nem órfãos | 13/13 verificações |
| 7 | `0088_motor_compras_trilhas_escala.sql` | Compra fora do webinar pára vendas; uma execução por contacto; tick escalável | 12/12 verificações; tick de 133 s para 0,5 s |

A 0082 tem de entrar **antes** da 0088 (a 0088 substitui o tick e o recheck da 0082 por versões que escalam).
A aplicação já está preparada para as duas situações: sem a 0086 e a 0088 usa o caminho antigo sozinha.

## 1. Antes de aplicar (só leitura)

```sql
-- a) Que funções do projecto antigo existem e quem as pode chamar (deve listar as 18 da 0083, abertas).
SELECT p.oid::regprocedure AS funcao,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (
   'ai_credit_grant','ai_credit_use','ai_credit_balance','ai_credit_balance_for_org','ai_credit_sync_wallet',
   'ai_credit_resolve_org','ai_credit_is_member','ai_token_consume','ai_token_balance','presence_external_totals',
   'presence_progress_batch','presence_beat','presence_aggregate','crm_presence_flush','welcome_send',
   'welcome_default_text','refresh_room_config','rls_auto_enable')
 ORDER BY 1;

-- b) A 0082 muda is_organization_member/has_organization_role para ignorar _user_id fora do service_role.
--    Nenhuma função deste repositório os chama com um utilizador explícito; confirmar que nenhuma função
--    de produção o faz (deve devolver zero linhas, ou só as duas próprias funções).
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND pg_get_functiondef(p.oid) ~* '(is_organization_member|has_organization_role)\s*\([^)]*,[^)]*,'
   AND p.proname NOT IN ('is_organization_member', 'has_organization_role');

-- c) Tarefas agendadas que chamam funções que a 0083 fecha (correm como postgres: não são afectadas).
SELECT jobname, command FROM cron.job WHERE command ~* '(presence_|crm_presence|welcome_send|refresh_room_config)';
```

## 2. Aplicar

Pelo painel do Supabase (SQL Editor) ou pela ferramenta de migrações, **um ficheiro de cada vez, por esta
ordem**, com o conteúdo exacto do repositório:

1. `drizzle/migrations/0082_auditoria_motor_e_seguranca.sql`
2. `drizzle/migrations/0083_fechar_funcoes_publicas.sql`
3. `drizzle/migrations/0084_ab_metricas_vendas.sql`
4. `drizzle/migrations/0086_creditos_atomicos.sql`
5. `drizzle/migrations/0087_reembolsos_creditos.sql`
6. `drizzle/migrations/0088_motor_compras_trilhas_escala.sql`

Cada ficheiro corre numa transacção: se falhar, nada dele fica aplicado. A 0083 falha de propósito se,
depois de fechar, alguma das 18 funções continuar chamável.

## 3. Depois de aplicar (só leitura)

```sql
-- a) Nenhuma função interna chamável por anon ou authenticated (deve devolver zero linhas).
SELECT p.oid::regprocedure AS funcao,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   AND p.proname IN (
   'ai_credit_grant','ai_credit_use','ai_credit_balance','ai_credit_balance_for_org','ai_credit_sync_wallet',
   'ai_credit_resolve_org','ai_credit_is_member','ai_token_consume','ai_token_balance','presence_external_totals',
   'presence_progress_batch','presence_beat','presence_aggregate','crm_presence_flush','welcome_send',
   'welcome_default_text','refresh_room_config','rls_auto_enable',
   'reserve_credit','settle_credit','release_credit','credit_charge_locked','credit_free_micros',
   'record_credit_usage','apply_credit_refund','apply_credit_topup','organization_for_billing_email',
   'automation_runs_tick','automation_recheck_contact','automation_contact_facts','automation_session_facts',
   'automation_contact_session_facts','contact_purchase_facts','offer_matches_product');

-- b) TODAS as funções SECURITY DEFINER que anon ainda pode chamar (para rever uma a uma).
SELECT p.oid::regprocedure AS funcao
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
 ORDER BY 1;

-- c) O gatilho de uma execução por contacto está ligado.
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'automation_runs_supersede';
```

## 4. Testes por fora, como visitante anónimo

Com a chave pública do site (`VITE_SUPABASE_PUBLISHABLE_KEY`). Cada pedido deve devolver
`{"code":"42501", "message":"permission denied for function …"}`. Antes da 0083, o primeiro devolvia o saldo.

```bash
URL="https://nazhbxrhoailjwillzju.supabase.co/rest/v1/rpc"; KEY="<chave pública>"
Z='"00000000-0000-0000-0000-000000000000"'
# ler o saldo de créditos de outra organização
curl -s -X POST "$URL/ai_credit_balance_for_org" -H "apikey: $KEY" -H "Content-Type: application/json" -d "{\"p_org\":$Z}"
# descobrir a organização de um utilizador (por GET, transacção só de leitura)
curl -s "$URL/ai_credit_resolve_org?p_user_id=00000000-0000-0000-0000-000000000000" -H "apikey: $KEY"
curl -s "$URL/ai_credit_is_member?p_org=00000000-0000-0000-0000-000000000000" -H "apikey: $KEY"
```

`ai_credit_grant`, `ai_credit_use` e `welcome_send` **não se testam chamando-as** (se ainda estivessem
abertas, davam créditos, gastavam ou enviavam mensagens reais). A prova é a consulta 3 a) acima, que lê as
permissões sem executar nada.

## Desfazer

- 0083: `GRANT EXECUTE ON FUNCTION <função>(<argumentos>) TO anon, authenticated;` para cada uma.
- 0086: a aplicação volta sozinha ao caminho antigo se `reserve_credit` não existir; para desligar,
  `REVOKE EXECUTE ON FUNCTION public.reserve_credit(uuid,bigint,text,integer) FROM service_role;`.
- 0088: `ALTER TABLE public.automation_runs DISABLE TRIGGER automation_runs_supersede;` desliga a regra de
  uma execução por contacto; as funções substituídas podem voltar à versão da 0082 reaplicando esses blocos.
