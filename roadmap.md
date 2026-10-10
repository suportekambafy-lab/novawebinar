# Roadmap desta cópia

## Feito
- [x] Endereços públicos deixaram de estar fixos no código: as ligações das salas usam o domínio onde a aplicação corre (ou `VITE_PUBLIC_APP_URL`, se definido)
- [x] Redirecionamento para subdomínio de administração passou a ser opcional (`VITE_ADMIN_HOST` + `VITE_PUBLIC_HOSTS`)
- [x] Documentação herdada do projeto original removida
- [x] Base de dados própria com toda a estrutura aplicada e chaves de IA, transcrição e tarefas automáticas configuradas
- [x] Fase 1: gateway de IA com vários fornecedores (`src/lib/ai/gateway.server.ts`): OpenAI, Gemini e Anthropic atrás da mesma interface, router por tarefa, saída estruturada, repetições, reserva, disjuntor e registo por chamada em `ai_calls`. A OpenAI foi validada com a API real (esquemas, prompts reais e reserva); Gemini e Anthropic só com pedidos simulados e chave inválida

## Por fazer
- [x] Nome do produto definido: Novawebinar (logótipos em `src/assets/brand/` ainda provisórios)
- [ ] Ligar um domínio próprio e, se for usado, definir `VITE_PUBLIC_APP_URL` / `VITE_ADMIN_HOST` / `VITE_PUBLIC_HOSTS`
- [ ] Primeiro conteúdo: criar organização, carregar vídeo e criar o primeiro webinar
- [ ] Reações com gatilho demasiado distante (casos acima de 45 s): rever escolha da âncora/frase e a janela máxima de reação
- [ ] Deteção de pedidos de participação com verbos além de "coloca/escreve"
- [ ] Validar Gemini e Anthropic com chaves reais (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`): correr `LIVE_AI=1 npx vitest run src/lib/ai/schemas.test.ts` com cada um como `AI_PROVIDER`
- [ ] Preços por modelo em `AI_MODEL_PRICES`, confirmados na página de cada fornecedor (sem preço, as chamadas não são cobradas e ficam com o custo por saber)
- [ ] Fase 3 do motor de previsão: recolha de resultados reais e ecrã de comparação (tabela `webinar_prediction_snapshots` já existe)
