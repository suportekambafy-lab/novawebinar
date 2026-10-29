# Avisos de pagamento da Kambafy: fluxo, exposição e nova arquitectura

Estado a 29/10/2026. Ramo `webhook-assinado` (não está em produção).

## 1. Fluxo actual

Dois receptores na NovaWebinar recebem avisos da Kambafy:

| Receptor | Para quê | Como se autentica hoje |
|---|---|---|
| `/api/public/billing-webhook` | Recargas de créditos de IA (conta Kambafy da plataforma) | Um segredo global (`BILLING_WEBHOOK_SECRET`) em claro, no cabeçalho `x-webhook-secret` ou `Authorization: Bearer` |
| `/api/public/hooks/<chave>` | Vendas dos clientes (integração Kambafy de cada conta) | O segredo da integração em claro, no mesmo cabeçalho |
| `/api/public/purchase-webhook` | Vendas, endereço antigo, por webinar | O segredo do webinar em claro, também aceite no endereço (`?s=`) ou no corpo |

Os três tinham CORS aberto às origens `*.kambafy.com`, porque a Kambafy chegou a enviar os avisos a partir do
browser do comprador (comentário no código: «pagamentos Express/cartão» e botão «testar»).

Do lado da Kambafy (repositório `bright-payment-view`):

- `trigger-webhooks` lê o segredo do vendedor na base de dados e envia o aviso **do servidor**
  (`_shared/sellerWebhook.ts`). Desde 24/10 só aceita o servidor ou um administrador. Verifiquei em
  produção: um pedido anónimo, só com a chave pública, recebe `403 Não autorizado`.
- Desde 25/10 o aviso leva `X-Kambafy-Signature: t=<segundos>,v1=<HMAC-SHA256(segredo, "<t>.<corpo>")>`, e
  ainda o segredo em claro (`X-Webhook-Secret` e `Authorization`) por compatibilidade.
- O botão «testar» também corre no servidor (`test-webhook-event`).

## 2. Como o segredo chegava ao browser, e como está hoje

- **Antes de 24/10:** o checkout chamava `trigger-webhooks` a partir do browser do comprador com os dados
  da compra. O segredo ficava no servidor, mas **qualquer pessoa podia pedir à Kambafy para enviar um aviso
  de compra falso**, e a Kambafy assinava-o com o segredo verdadeiro. O resultado era o mesmo que ter o
  segredo: vendas e recargas fabricadas.
- **Hoje:** o browser já não consegue disparar avisos (403 verificado) nem lê o segredo. O segredo continua
  a viajar **em claro** em cada aviso, e a NovaWebinar aceita-o sozinho, sem olhar para a assinatura.
  Quem o tiver (registos de pedidos, um proxy, um membro da equipa, uma fuga antiga do tempo do browser)
  fabrica avisos à vontade.
- O endereço antigo aceita o segredo no próprio URL (`?s=`), que fica em registos e históricos.

## 3. Ataque reproduzido (controlado)

Teste com a base de dados simulada, sem créditos nem dinheiro reais, contra o receptor de recargas actual:

| Pedido | Resultado hoje |
|---|---|
| Aviso fabricado, só com o segredo, sem passar pela Kambafy | **Créditos dados** |
| O mesmo, repetido 5 vezes com números de encomenda inventados | **5 recargas dadas** |
| Valor pago `0` | **Créditos dados** (o valor não é comparado com o preço) |
| Sem segredo | Recusado (401) |

Conclusão: o segredo partilhado é a única barreira, e não liga o aviso a uma compra real.

## 4. Nova arquitectura (ramo `webhook-assinado`)

```
Comprador ──paga──▶ Kambafy (servidor) ──aviso assinado (HMAC, hora, corpo)──▶ NovaWebinar (servidor)
   browser: só identificadores públicos          segredo só nos dois servidores           verifica assinatura e hora
```

1. **O browser nunca entra.** Sem CORS nos três receptores: nenhuma página consegue chamá-los em nome de
   alguém. O comprador só vê identificadores públicos (o produto, a sua encomenda).
2. **Prova servidor-a-servidor: a assinatura.** A NovaWebinar recalcula `HMAC-SHA256(segredo, "<t>.<corpo>")`
   e compara em tempo constante. Só os servidores da Kambafy e da NovaWebinar têm o segredo, e a assinatura
   fica presa a **este corpo** (outro número de encomenda não serve) e a **esta hora** (janela de 5 min:
   um aviso apanhado não serve mais tarde).
3. **Assinatura presente e errada nunca passa**, mesmo na transição.
4. **Recargas:** pagamento a zero, ou abaixo do preço quando pago em dólares, não carrega créditos. A
   mesma encomenda só carrega uma vez (já era assim).
5. **Reembolsos** de recargas retiram os créditos (`apply_credit_refund`, 0087): proporcionais, uma vez,
   nunca mais do que a compra deu. Só com aviso assinado: um reembolso fabricado não tira créditos a ninguém.
6. **Transição:** `KAMBAFY_ALLOW_UNSIGNED` (por omissão ligado) deixa ainda passar avisos **sem** assinatura
   pelo segredo em claro, com um aviso nos registos, para contas configuradas antes de 25/10. Quando os
   registos mostrarem que já não chegam avisos sem assinatura, põe-se `KAMBAFY_ALLOW_UNSIGNED=off` na
   Vercel: a partir daí, só avisos assinados.

Testes do ramo: os quatro ataques acima são recusados, os avisos assinados verdadeiros passam, e os
reembolsos retiram créditos (`src/lib/webhook-assinado.test.ts`, `src/lib/billing.server.test.ts`).

## 5. Ordem para pôr em produção

1. Aplicar a 0087 (os reembolsos dependem dela; sem ela, um aviso de reembolso responde 503 e a Kambafy
   tenta mais tarde).
2. Juntar o ramo `webhook-assinado` ao `main` (com `KAMBAFY_ALLOW_UNSIGNED` ligado por omissão).
3. Confirmar nos registos da Vercel que os avisos chegam assinados (não aparece «aviso sem assinatura»).
4. Rodar o `BILLING_WEBHOOK_SECRET` (Vercel e conta Kambafy da plataforma): o actual viajou em claro.
5. `KAMBAFY_ALLOW_UNSIGNED=off` na Vercel.
6. Pedir aos clientes que ainda usam `/api/public/purchase-webhook?s=…` que passem para o endereço da
   integração (`/api/public/hooks/<chave>`), que verifica a assinatura.

## 6. O que fica por fazer do lado da Kambafy

- Deixar de enviar o segredo em claro (`X-Webhook-Secret` e `Authorization`) quando os receptores já
  verificarem a assinatura.
- Opcional, para recargas: um endpoint de consulta de encomendas do checkout (a API de pagamentos só
  consulta pagamentos criados por ela), para a NovaWebinar confirmar a encomenda antes de carregar.
