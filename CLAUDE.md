# Automação de webinar: referência obrigatória

Antes de criar ou alterar qualquer parte do motor de automação (eventos, sequências, segmentos, disparos, grupos, upsell), leia estes arquivos em `docs/automacao/`:

1. `mapa-de-automacao.md`: lógica completa do funil. Contém o modelo mental, os 14 passos e a referência de nós, ligações e segmentos. Comece por aqui.
2. `mapa-de-automacao.json`: o mesmo grafo em dados. Use-o como seed e como fonte única do funil padrão.
3. `modelo-de-disparo.md` e `modelo-de-disparo.json`: motor de disparos. Contém fluxos, agendamento, estados do disparo, idempotência e os modelos de mensagem.
4. `engenharia-de-lancamentos.md`: entidades (oferta, avatar, objeções), fórmulas de planeamento e páginas.
5. `correspondencia-motor.md`: como os ids do mapa se ligam aos nomes do produto e do motor, e o que ainda não existe.

As palavras do produto (fluxo, automação, passo, disparo, momento, origem, segmento) estão em `GLOSSARY.md`, na raiz. Use-as no ecrã, no código novo e nos testes.

## Regras

- Respeitar os marcadores: [FONTE] é regra de negócio; [PROPOSTA] pode ser ajustada, mas confirme antes de mudar.
- Compra aprovada cancela as sequências de venda daquela oferta.
- A condição de cada envio é avaliada no momento do envio, não no agendamento.
- Grupos de WhatsApp não segmentam; e-mail e WhatsApp individual sim.
- Um contato está numa única sequência por trilha.
- Os ids do `mapa-de-automacao.json` são a referência do funil. O motor e o produto têm os seus próprios nomes; a ligação entre uns e outros está em `correspondencia-motor.md`. Ao criar ou renomear um gatilho, um facto ou uma automação pronta, actualize essa tabela.
- Toda a automação vive dentro de um fluxo, e edita-se no desenho do fluxo. Não criar outro ecrã de edição nem automações soltas.

## Ambiente de trabalho

- Correr localmente: `npx vite dev --host 127.0.0.1 --port 8080`.
- Base de dados: Supabase, projecto `nazhbxrhoailjwillzju`. Site: Vercel (deploy automático a cada push). Código: GitHub `suportekambafy-lab/novawebinar`, ramo `main`.
- As chaves estão no ficheiro `.env`, que nunca se mostra, nem se copia para mensagens, nem vai para o GitHub.
- Antes de dar um trabalho por concluído: `npx tsc --noEmit -p .` e `npx vitest run` (e `npm run build` em mudanças grandes).
- No fim de cada trabalho, commit e push para `main`.
- Migrações de base de dados ficam em `drizzle/migrations/`, numeradas a seguir à última; só com `IF NOT EXISTS`, sem `DROP`, e aplicadas com autorização do utilizador.
