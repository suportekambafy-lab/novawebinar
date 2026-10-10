# Novawebinar

Plataforma de webinars gravados que correm como se fossem ao vivo («evergreen») e de sessões marcadas. Tudo acontece no mesmo produto:

- inscrição;
- sala do webinar, com chat, prova social, oferta e contagem;
- automações por email, WhatsApp e webhook;
- atendimento com agente de IA;
- painel de métricas.

Produção: <https://novawebinar.vercel.app>. O público principal está em Angola e em Moçambique, muitas vezes com dados móveis, por isso o peso das páginas conta.

## Arranque rápido

Requer Node.js 24 e npm.

```sh
npm i
cp .env.example .env   # preencher; o .env nunca vai para o Git
npm run dev            # http://localhost:8080
```

Verificações antes de qualquer entrega:

```sh
npx tsc --noEmit       # tipos
npx vitest run         # testes (cerca de 700)
npm run build          # build de produção
```

### Variáveis de ambiente

A lista completa, com a explicação de cada uma, está em `.env.example`.

| Grupo | Variáveis | Para quê |
|---|---|---|
| Supabase (cliente) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Autenticação e leitura no browser |
| Supabase (servidor) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Funções de servidor; a chave service role **nunca** vai para o cliente |
| Transcrição | `ASSEMBLYAI_API_KEY` | Transcrição com tempos por palavra |
| IA | `AI_PROVIDER`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_*` | Gateway com vários fornecedores; preços e margem do saldo de IA |
| WhatsApp | `WAHA_URL`, `WAHA_API_KEY` | WhatsApp não oficial pelo WAHA (opcional) |
| Domínios | `VITE_PUBLIC_APP_URL`, `VITE_ADMIN_HOST`, `VITE_PUBLIC_HOSTS` | Domínio público das salas (opcional) |
| Fila | `JOB_TICKER` | `off` desliga o motor interno; em serverless a fila corre por `/api/public/run-jobs` |

**Para quem colabora:** use um projecto Supabase seu, de desenvolvimento, e nunca as chaves de produção.

## Tecnologia

- **TanStack Start + React 19 + Vite 8:**
  - rotas por ficheiro em `src/routes/`;
  - funções de servidor em `*.functions.ts`, `*.server.ts` e `src/routes/api/`.
- **Tailwind CSS v4:**
  - o sistema de desenho está em `novawebinar-design/` (tokens, componentes, guias) e segue o Geist;
  - a sala tem tokens próprios (`--room-*`).
- **Supabase:**
  - Postgres com RLS, autenticação, armazenamento (upload TUS) e realtime;
  - o histórico das migrações está em `drizzle/migrations/` (0001 a 0073).
- **IA:**
  - camada própria em `src/lib/ai` (OpenAI, Gemini e Anthropic, com reservas e saldo por organização);
  - agente de atendimento em `src/lib/ai-agent`.
- **Testes:** Vitest, com os ficheiros `*.test.ts` ao lado do código.
- **Publicação:**
  - Vercel, com o preset Nitro `vercel` e funções em São Paulo (`gru1`, em `vercel.json`);
  - localmente, o preset é `node-server`.

## Estrutura

```
src/
  routes/                 páginas e API (TanStack Router, ficheiro = rota)
    w.$slug.tsx           sala pública do webinar (inscrição, espera, sala, replay)
    webinars.$webinarId.edit.tsx   editor do webinar (etapas Início → Revisão)
    automations.*         fluxos de automação
    api/public/*          webhooks, formulário embed, run-jobs
  components/
    webinar-room.tsx      a sala (formatos Webinar e Live, telemóvel, tablet, computador)
    room/                 peças da sala (chat, oferta, entrada, espera, barra de teste)
    webinar-editor/       etapas do editor e pré-visualização (room-preview.tsx espelha a sala)
    workflow/             desenho dos fluxos
    support/, contacts/, dashboard/, team/   restantes áreas do painel
    ds/, ui/              sistema de desenho e componentes base
  lib/
    room-*.ts             lógica da sala (tempos, ofertas, tema, legendas, rascunho do 👁)
    automations.server.ts motor de disparos (email, WhatsApp, webhook)
    workflow.ts           modelos de fluxo e variáveis das mensagens
    ai/, ai-agent/        IA e agente
docs/automacao/           referência obrigatória do motor de automação
novawebinar-design/   design system (tokens, guias, componentes)
drizzle/migrations/       histórico do esquema da base
```

## Regras do projecto

Antes de mexer no motor de automação, leia `CLAUDE.md` e `docs/automacao/`, começando por `mapa-de-automacao.md`.

As palavras do produto estão em `GLOSSARY.md`: fluxo, automação, passo, disparo, momento, origem, segmento. Use-as no ecrã, no código e nos testes.

Regras principais:
- Toda a automação vive dentro de um fluxo e edita-se no desenho do fluxo.
- Compra aprovada cancela as sequências de venda daquela oferta.
- A condição de cada envio é avaliada no momento do envio.
- A sala e a pré-visualização do editor têm de ficar iguais. Cada mudança em `webinar-room.tsx` ou `room/*` vai também para `room-preview.tsx`.
- O português do produto é europeu.
- Nenhum texto do painel fica abaixo de 12 px, e os traços dos ícones são 1.5, 1.75 ou 2. Quem confirma é `src/components/panel-adherence.test.ts`.
- Princípio da sala («gatilho da manada»): comentários, corações e oferta nunca saem do ecrã, mesmo com o chat escondido.

## Fluxo de trabalho no Git

- `main` é a versão de referência e só recebe alterações por Pull Request.
- Cada pessoa trabalha no seu ramo (por exemplo `parceiro/<tema>`) e abre um Pull Request para `main`.
- Nunca entram no Git:
  - `.env*` com valores reais;
  - `.vercel/`;
  - as rotas de teste `src/routes/dev-*`;
  - os vídeos `public/__teste*`.
- A publicação em produção é feita só pelo dono do projecto: `npx vercel deploy --prod` a partir de um commit limpo.

## Estado

Feito e em produção:
- editor do webinar em 11 etapas, com pré-visualização em telemóvel, tablet e computador;
- sala nos formatos Webinar e Live, com:
  - chat gerado por IA e prova social;
  - ofertas com contagem;
  - sala de espera com vídeo de fundo;
  - sala de teste (👁) com o rascunho por gravar;
- inscrição própria e formulário embed;
- fluxos de automação;
- atendimento com agente de IA;
- painel, contactos, equipas, créditos e integrações (Kambafy, webhooks, WAHA).

Ainda por ligar:
- Fornecedor de email e SMS.
- Servidor WAHA em produção.
- Agendador da fila em produção: um cron que chame `/api/public/run-jobs`.
- Carregamento de créditos.
- Migração que deixa activar automações com WhatsApp (gatilho `automations_channels_guard`).
- Formulário de inscrição antes da sala de espera, para quem chega dias antes.
- Duração dos vídeos do Vimeo e do Panda. Sem ela, a sessão não termina e as recuperações não arrancam.
