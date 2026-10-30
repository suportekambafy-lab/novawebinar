# Aplicar a migração 0089: país dos contactos

Estado a 30/10/2026: **por aplicar** em produção (`nazhbxrhoailjwillzju`). Testada em Postgres (PGlite) com
a vista anterior, a função `contacts_in_list` que depende dela e dados fictícios. Também se confirmou que
pode ser aplicada duas vezes sem erro.

## O que faz

- `country_from_phone(telefone)`: o país pelo indicativo (+244 → AO). Os indicativos são os de
  `src/lib/phone-countries.ts`, e um teste confirma que as duas listas são iguais.
- `contact_summaries` ganha três colunas no fim: `country_code`, `country` e `country_from` (`ip` ou
  `phone`). O país é o da inscrição mais recente com país detectado. Sem inscrição, é o do indicativo.
  As colunas que já existiam não mudam.
- `contact_country_breakdown(org, lista, lançamento)`: quantas pessoas há por país e em que etapa estão.
- Um índice parcial em `participants (contact_id, joined_at DESC)` para as linhas que têm país.

Não apaga nada: só `CREATE OR REPLACE` e `IF NOT EXISTS`.

## Passos

1. Abra https://supabase.com/dashboard/project/nazhbxrhoailjwillzju/sql/new
2. Copie todo o conteúdo de `drizzle/migrations/0089_contact_country.sql` e cole-o no editor.
3. Carregue em **Run**. Deve aparecer `Success. No rows returned`.
4. Para confirmar, cole e corra esta consulta:

   ```sql
   SELECT country_code, country_from, count(*)
     FROM contact_summaries
    GROUP BY 1, 2
    ORDER BY 3 DESC
    LIMIT 10;
   ```

   Deve aparecer uma linha por país, por exemplo `AO | ip | 120`. A linha com `country_code` vazio
   conta as pessoas sem país.

5. Recarregue a página Contactos. No resumo do grupo aparece a secção «De que países», e basta tocar
   num país para filtrar a lista.

## Sem a migração

A aplicação continua a funcionar como antes. O país de cada pessoa é lido pelo browser, e a
facturação por país nas Análises também. Só o filtro e a secção «De que países» ficam escondidos.
