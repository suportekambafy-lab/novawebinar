import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/cookies")({
  head: () => ({
    meta: [
      { title: "Política de cookies — Novawebinar" },
      { name: "description", content: "Que cookies e armazenamento local o Novawebinar utiliza e para que servem." },
      { property: "og:title", content: "Política de cookies — Novawebinar" },
      { property: "og:description", content: "Cookies e armazenamento local utilizados pela plataforma Novawebinar." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <LegalPage title="Política de cookies" updated="17 de setembro de 2026">
      <h2>1. O que utilizamos</h2>
      <p>O Novawebinar utiliza cookies e armazenamento local do navegador para manter a sessão iniciada, guardar preferências da interface e permitir que um participante regresse a uma sala sem voltar a inscrever-se.</p>
      <h2>2. Cookies essenciais</h2>
      <p>São necessários ao funcionamento da plataforma: autenticação, segurança e manutenção do estado da sessão. Sem estes cookies não é possível utilizar a área autenticada.</p>
      <h2>3. Preferências</h2>
      <p>Guardamos escolhas simples, como o estado do menu lateral e opções de visualização, para manter a experiência consistente entre visitas.</p>
      <h2>4. Participação em webinars</h2>
      <p>Na sala de webinar, guardamos localmente a identificação do participante para associar mensagens e presença à sessão correta.</p>
      <h2>5. Gestão</h2>
      <p>Pode apagar ou bloquear cookies nas definições do seu navegador. A remoção dos cookies essenciais implica terminar a sessão e pode impedir o acesso às salas.</p>
    </LegalPage>
  );
}
