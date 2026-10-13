/**
 * As capturas do produto no site público: imagens reais do Novawebinar a correr com uma conta fictícia
 * (scripts/cenario-capturas.mjs; nomes, pessoas e números inventados). Cada uma vem numa moldura de
 * computador ou de telemóvel. Para as refazer: criar a conta de demonstração, tirar as capturas e
 * gravar em src/assets/landing como WebP de 1600 px (computador) ou 600 px (telemóvel).
 */
import { cn } from "@/lib/utils";
import analises from "@/assets/landing/analises.webp";
import atendimento from "@/assets/landing/atendimento.webp";
import editorAgenda from "@/assets/landing/editor-agenda.webp";
import editorChat from "@/assets/landing/editor-chat.webp";
import editorOferta from "@/assets/landing/editor-oferta.webp";
import editorVendas from "@/assets/landing/editor-vendas.webp";
import fluxo from "@/assets/landing/fluxo.webp";
import inscricao from "@/assets/landing/inscricao.webp";
import metricas from "@/assets/landing/metricas.webp";
import painel from "@/assets/landing/painel.webp";
import salaAoVivo from "@/assets/landing/sala-ao-vivo.webp";
import salaAoVivoTelemovel from "@/assets/landing/sala-ao-vivo-telemovel.webp";
import salaOferta from "@/assets/landing/sala-oferta.webp";
import salaOfertaTelemovel from "@/assets/landing/sala-oferta-telemovel.webp";
import salaReplay from "@/assets/landing/sala-replay.webp";
import salaVendas from "@/assets/landing/sala-vendas.webp";
import salaVendasTelemovel from "@/assets/landing/sala-vendas-telemovel.webp";

export type ShotKind =
  | "sala"
  | "sala-oferta"
  | "sala-vendas"
  | "sala-replay"
  | "inscricao"
  | "editor-agenda"
  | "editor-chat"
  | "editor-oferta"
  | "editor-vendas"
  | "metricas"
  | "analises"
  | "atendimento"
  | "fluxo"
  | "painel";

export type PhoneShotKind = "sala" | "sala-oferta" | "sala-vendas";

/** Computador: 1600×1000 (a sala) ou 1600×1000 (o painel); tudo foi capturado a 1440×900. */
const DESKTOP: Record<ShotKind, { src: string; alt: string }> = {
  sala: { src: salaAoVivo, alt: "A sala ao vivo do Novawebinar: o vídeo com o selo «Ao vivo», o número de pessoas e o chat a acompanhar" },
  "sala-oferta": { src: salaOferta, alt: "A sala ao vivo com a oferta aberta ao lado do chat: produto, preço, contagem e botão de compra" },
  "sala-vendas": { src: salaVendas, alt: "A sala ao vivo com um aviso de compra por cima do vídeo e no chat" },
  "sala-replay": { src: salaReplay, alt: "A sala em replay, com o selo «Replay» e o chat da sessão" },
  inscricao: { src: inscricao, alt: "A página de inscrição de uma aula: capa, barra de vagas, nome, e-mail e WhatsApp" },
  "editor-agenda": { src: editorAgenda, alt: "O editor na etapa Agenda: uma data, repetir, just in time ou sempre disponível, com a sala de espera ao lado" },
  "editor-chat": { src: editorChat, alt: "O editor na etapa Chat: os comentários simulados, o país do lançamento e a pré-visualização da sala" },
  "editor-oferta": { src: editorOferta, alt: "O editor na etapa Oferta: produto, preço e o momento em que entra" },
  "editor-vendas": { src: editorVendas, alt: "O editor na etapa Vendas: os avisos de compra que aparecem na sala" },
  metricas: { src: metricas, alt: "As métricas de um webinar: inscritos, assistiram, tempo assistido, oferta, cliques, compras e conversão" },
  analises: { src: analises, alt: "A página de análises: inscrições, presença e vendas por webinar, aparelho e país" },
  atendimento: { src: atendimento, alt: "O Atendimento: as conversas privadas, o Agente IA a sugerir uma resposta e os botões para assumir ou transferir" },
  fluxo: { src: fluxo, alt: "O desenho do fluxo de automações: inscrição, grupo de WhatsApp, aquecimento, lembretes e mensagens" },
  painel: { src: painel, alt: "O painel: o próximo webinar, a agenda do mês e quem entrou hoje" },
};

const PHONE: Record<PhoneShotKind, { src: string; alt: string }> = {
  sala: { src: salaAoVivoTelemovel, alt: "A sala ao vivo no telemóvel: o vídeo em cima e o chat em baixo" },
  "sala-oferta": { src: salaOfertaTelemovel, alt: "A sala no telemóvel com a oferta aberta por cima do chat" },
  "sala-vendas": { src: salaVendasTelemovel, alt: "A sala no telemóvel com um aviso de compra no chat" },
};

/** Uma captura do computador numa moldura de browser (barra com três pontos e o endereço). */
export function DesktopShot({
  kind,
  priority = false,
  className,
  address = "app.novawebinar.com",
}: {
  kind: ShotKind;
  /** A imagem do hero carrega logo; as outras só quando se aproximam. */
  priority?: boolean;
  className?: string | undefined;
  address?: string;
}) {
  const shot = DESKTOP[kind];
  return (
    <figure className={cn("site-browser", className)}>
      <div className="site-browser-bar" aria-hidden="true">
        <span /><span /><span />
        <i>{address}</i>
      </div>
      <img
        src={shot.src}
        alt={shot.alt}
        width={1600}
        height={1000}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        draggable={false}
      />
    </figure>
  );
}

/** Uma captura do telemóvel numa moldura de telemóvel. */
export function PhoneShot({
  kind,
  className,
  priority = false,
}: {
  kind: PhoneShotKind;
  className?: string | undefined;
  priority?: boolean;
}) {
  const shot = PHONE[kind];
  return (
    <figure className={cn("site-phone", className)}>
      <img
        src={shot.src}
        alt={shot.alt}
        width={600}
        height={1301}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
      />
    </figure>
  );
}
