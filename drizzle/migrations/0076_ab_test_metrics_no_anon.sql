-- As métricas dos testes A/B só para quem tem sessão (a função confirma a organização) e para o servidor;
-- a leitura do valor de uma venda (ab_parse_amount) só para o servidor.
REVOKE EXECUTE ON FUNCTION public.ab_test_metrics(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ab_parse_amount(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ab_parse_amount(text) TO service_role;
