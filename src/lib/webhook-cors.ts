/**
 * Sem CORS nos endereços que recebem vendas. A Kambafy envia os avisos do servidor (incluindo o botão
 * «testar», desde 25/10/2026), e as outras plataformas também. Um browser nunca precisa de os chamar; sem
 * os cabeçalhos CORS, nenhuma página consegue fazê-lo em nome de alguém nem ler a resposta.
 */
export function withCors(_request: Request, response: Response) {
  return response;
}
