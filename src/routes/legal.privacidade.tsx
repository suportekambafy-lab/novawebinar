import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de privacidade — Novawebinar" },
      { name: "description", content: "Como o Novawebinar recolhe, utiliza e protege os dados pessoais de clientes e participantes de webinars." },
      { property: "og:title", content: "Política de privacidade — Novawebinar" },
      { property: "og:description", content: "Como tratamos e protegemos os dados pessoais na plataforma Novawebinar." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" updated="17 de setembro de 2026">
      <h2>1. Responsável pelo tratamento</h2>
      <p>O Novawebinar trata os dados das contas de clientes. Relativamente aos participantes inscritos numa sessão, o cliente que organiza o webinar é o responsável pelo tratamento e o Novawebinar atua como subcontratante.</p>
      <h2>2. Dados recolhidos</h2>
      <p>Dados de conta (nome, email, organização), dados de inscrição e participação em webinars (nome, email, presença, tempo assistido, interações no chat e cliques na oferta) e dados técnicos necessários ao funcionamento do serviço, incluindo o endereço IP, utilizado para estimar a localização aproximada.</p>
      <h2>3. Finalidades</h2>
      <p>Utilizamos estes dados para prestar o serviço, permitir o acesso às sessões, apresentar métricas de participação e retenção, prestar apoio e garantir a segurança da plataforma.</p>
      <h2>4. Fundamentos legais</h2>
      <p>O tratamento assenta na execução do contrato, no cumprimento de obrigações legais e no interesse legítimo em manter o serviço seguro e funcional.</p>
      <h2>5. Partilha</h2>
      <p>Os dados são partilhados apenas com prestadores necessários ao funcionamento do serviço, como alojamento, base de dados, envio de mensagens e processamento de transcrições, sempre sujeitos a obrigações de confidencialidade.</p>
      <h2>6. Conservação</h2>
      <p>Conservamos os dados enquanto a conta estiver ativa e pelo período necessário ao cumprimento de obrigações legais. Os dados de participantes podem ser eliminados pelo cliente organizador.</p>
      <h2>7. Direitos</h2>
      <p>Pode solicitar o acesso, a retificação, o apagamento, a limitação ou a portabilidade dos seus dados, bem como opor-se a determinados tratamentos, e apresentar reclamação junto da autoridade de controlo competente.</p>
      <h2>8. Segurança</h2>
      <p>Aplicamos controlos de acesso por organização, ligações cifradas e acesso restrito aos vídeos privados através de endereços temporários.</p>
    </LegalPage>
  );
}
