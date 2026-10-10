import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/termos")({
  head: () => ({
    meta: [
      { title: "Termos e condições — Novawebinar" },
      { name: "description", content: "Condições de utilização da plataforma Novawebinar para criação e apresentação de webinars automatizados." },
      { property: "og:title", content: "Termos e condições — Novawebinar" },
      { property: "og:description", content: "Condições de utilização da plataforma Novawebinar." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Termos e condições" updated="17 de setembro de 2026">
      <h2>1. Objeto</h2>
      <p>Estes termos regulam o acesso e a utilização do Novawebinar, uma plataforma que permite criar, agendar e apresentar webinars a partir de conteúdo previamente gravado, com chat programado, oferta e análise de participação.</p>
      <h2>2. Conta e acesso</h2>
      <p>A criação de conta exige dados verdadeiros e atualizados. Cada utilizador é responsável pela confidencialidade das suas credenciais e por toda a atividade realizada na sua conta e na organização a que pertence.</p>
      <h2>3. Utilização aceitável</h2>
      <p>É proibido utilizar a plataforma para conteúdos ilícitos, enganosos ou que infrinjam direitos de terceiros. As funcionalidades de demonstração e simulação destinam-se a ensaio e preparação e não devem ser apresentadas como prova social real perante o público.</p>
      <h2>4. Conteúdos do utilizador</h2>
      <p>Os vídeos, textos e materiais carregados continuam a pertencer a quem os submete. O utilizador concede ao Novawebinar apenas as permissões técnicas necessárias para armazenar, processar e apresentar esse conteúdo nas sessões que configura.</p>
      <h2>5. Disponibilidade</h2>
      <p>Procuramos manter o serviço disponível de forma contínua, podendo existir interrupções para manutenção ou por causas externas. Não garantimos resultados comerciais decorrentes da utilização da plataforma.</p>
      <h2>6. Cessação</h2>
      <p>A conta pode ser encerrada pelo utilizador a qualquer momento. Podemos suspender contas que violem estes termos ou coloquem em risco a segurança do serviço.</p>
      <h2>7. Alterações</h2>
      <p>Estes termos podem ser atualizados. As alterações relevantes são comunicadas através da plataforma e entram em vigor na data indicada.</p>
      <h2>8. Contacto</h2>
      <p>Para questões sobre estes termos, contacte-nos através do endereço de apoio indicado na sua conta.</p>
    </LegalPage>
  );
}
