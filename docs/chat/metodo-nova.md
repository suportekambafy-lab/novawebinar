# Método Nova: como o chat é gerado

O chat gerado tem de parecer um chat real de um webinar ao vivo. O Método Nova separa o que é
decidível por regras (quem, quando, a quê) do que só a IA escreve bem (o texto). Código em
`src/lib/chat-engine/`.

## Etapas

1. **Transcrição por palavra** (AssemblyAI). Sem ela não há geração.
2. **Blocos de fala** (`blocks.ts`, `classify.server.ts`): a fala em blocos de 10 a 30 s, cada um com
   tipo (pergunta ao público, pedido, leitura do chat, prova social, oferta…), o que espera do público e
   o que o apresentador leu ou nomeou (nomes, cidades, perguntas, valores). Regras primeiro, IA a afinar.
   O nome do apresentador nunca é alguém do chat.
3. **Oportunidades** (`plan.ts`): de cada bloco nascem as ocasiões de alguém escrever, com dependência
   explícita: ANTES (o que o apresentador vai ler ou quem ele vai nomear), DEPOIS (respostas e reacções)
   ou LIVRE. Uma leitura de valores até 4 minutos depois de um pedido lê as respostas desse pedido.
   A oferta começa onde o editor a marcou ou, sem marca, no primeiro bloco de oferta com preço.
4. **Elenco** (`cast.ts`): as pessoas do webinar inteiro, fixas. As alunas que o apresentador nomeia
   estão lá desde o início; o público chega (60% nos primeiros 2 min), parte sai, poucos falam muito.
   Uma linha de situação por pessoa, escrita pela IA uma vez.
5. **Guião** (`script.ts`): por trecho, linhas com quem escreve, o milissegundo, a oportunidade, a
   intenção, o tamanho e, quando há, o texto obrigatório. Ninguém escreve antes de chegar; quem responde
   a um pedido não responde a outro nos 40 s seguintes; as respostas têm cauda; há réplicas «@Nome»; as
   mensagens soltas rodam de intenção (dúvida, identificação, descoberta, objecção, intenção).
6. **Escrita** (`novaWindow` em `ai-comments.functions.ts`): a IA recebe o guião e devolve só o texto de
   cada linha. Linhas obrigatórias sem texto levam o que o apresentador cita ou uma presença curta.
7. **Validação** (`validate.ts`, `finalize.server.ts`): as dez verificações de cronologia, formato, nome
   lido, duplicados, conhecimento do futuro e densidade. Cada mensagem sai com causa e confiança.

## O que fica de fora

- Sem transcrição por palavra, o caminho antigo (janelas com prompt livre) continua a existir.
- O guião não escreve texto: tudo o que é palavra vem da IA, ao estilo de cada pessoa.
