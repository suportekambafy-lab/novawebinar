# Aplicar a migração 0089: país dos contactos

Estado: **aplicada** em produção (`nazhbxrhoailjwillzju`) a 30/10/2026, pelo terminal (`supabase db query --linked -f`). Resultado: 2025 de 2052 contactos com país. Testada em Postgres (PGlite) com
a vista anterior, a função `contacts_in_list` que depende dela e dados fictícios. Também se confirmou que
pode ser aplicada duas vezes sem erro.

## O que faz

- `contact_summaries` ganha duas colunas no fim: `country_code` e `country`. O país é o detectado pelo
  IP na inscrição mais recente, o mesmo da Vista ao vivo. O indicativo do telefone não conta, porque há
  quem viva noutro país e mantenha o número de Portugal. Quem nunca se inscreveu fica sem país.
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
   SELECT country_code, count(*)
     FROM contact_summaries
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10;
   ```

   Deve aparecer uma linha por país, por exemplo `AO | 120`. A linha com `country_code` vazio
   conta as pessoas sem país.

5. Recarregue a página Contactos. No resumo do grupo aparece a secção «De que países», e basta tocar
   num país para filtrar a lista.

## Sem a migração

A aplicação continua a funcionar como antes. O país de cada pessoa é lido pelo browser, e a
facturação por país nas Análises também. Só o filtro e a secção «De que países» ficam escondidos.
