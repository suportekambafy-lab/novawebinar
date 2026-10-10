import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, ChevronDown, Eye, LayoutTemplate, MessageCircle, MonitorPlay, ShoppingBag, ShoppingCart, Timer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROOM_FORMATS } from "@/lib/room-logic";
import type { HelpTopic } from "./help";
import { EntryThumb } from "./room-options";
import { FORMAT_THUMB } from "./steps/video";

/**
 * A ilustração da ajuda do (i): a parte do ecrã que a secção muda, em ponto grande e com texto
 * a sério, e o elemento realçado a azul. É um desenho (não a sala verdadeira): serve para orientar.
 */

type Spot =
  | "title"
  | "form"
  | "button"
  | "card"
  | "video"
  | "format"
  | "start"
  | "caption"
  | "end"
  | "host"
  | "follow"
  | "chat"
  | "viewers"
  | "offer"
  | "countdown"
  | "color"
  | "sale"
  | "support"
  | "theme"
  | "agenda"
  | "when"
  | "jit"
  | "waiting"
  | "whatsapp"
  | "share";

const SCENES: Record<HelpTopic, Spot> = {
  inicio: "title",
  webinar: "title",
  apresentador: "host",
  partilha: "share",
  entrada: "form",
  ligarPagina: "form",
  contactos: "form",
  botaoVagas: "button",
  coresPagina: "card",
  video: "video",
  formato: "format",
  botaoEntrar: "start",
  transcricao: "caption",
  aparencia: "theme",
  corBotao: "color",
  contagem: "waiting",
  temporizador: "video",
  seguir: "follow",
  seguirMomentos: "follow",
  chat: "chat",
  chatQuem: "chat",
  paises: "chat",
  tom: "chat",
  realismo: "chat",
  perguntas: "chat",
  gerar: "chat",
  comoFicou: "chat",
  avisoSuporte: "support",
  audiencia: "viewers",
  audienciaFormato: "viewers",
  audienciaCurva: "viewers",
  oferta: "offer",
  aparenciaOferta: "offer",
  urgencia: "countdown",
  depoisVideo: "end",
  utm: "color",
  vendas: "sale",
  comprasReais: "sale",
  vendasOnde: "sale",
  vendasCor: "sale",
  vendasLinha: "sale",
  automacoes: "whatsapp",
  agente: "support",
  autonomia: "support",
  agenteFontes: "support",
  agenteEquipa: "support",
  agenteNome: "support",
  agenda: "agenda",
  agendaQuando: "when",
  agendaIntervalo: "jit",
  agendaSessao: "waiting",
};

/** Onde fica: o ecrã (etiqueta em cima da ilustração) e uma frase curta por baixo. */
const WHERE: Record<Spot, [LucideIcon, string, string]> = {
  title: [LayoutTemplate, "Página de entrada", "No topo da página de entrada e da sala."],
  form: [LayoutTemplate, "Página de entrada", "Os campos que a pessoa preenche para entrar."],
  button: [LayoutTemplate, "Página de entrada", "O botão e o aviso no topo."],
  card: [LayoutTemplate, "Página de entrada", "O cartão e o botão da página."],
  video: [MonitorPlay, "Sala", "O vídeo, igual para todos."],
  format: [MonitorPlay, "Sala", "Webinar: chat ao lado · Live: chat por cima."],
  start: [MonitorPlay, "Sala", "Ao centro do vídeo, até a pessoa tocar."],
  caption: [MonitorPlay, "Sala", "A fala, nas legendas do vídeo."],
  end: [MonitorPlay, "Sala", "Quando o vídeo acaba: a contagem e a oferta."],
  host: [MonitorPlay, "Sala", "Por baixo do vídeo: quem apresenta."],
  follow: [MonitorPlay, "Sala", "Ao lado do nome, só nos minutos escolhidos."],
  chat: [MonitorPlay, "Sala", "O chat, ao ritmo do vídeo."],
  viewers: [MonitorPlay, "Sala", "No canto do vídeo: quantos estão a ver."],
  offer: [MonitorPlay, "Sala", "O cartão da oferta, no minuto em que abre."],
  countdown: [MonitorPlay, "Sala", "O cronómetro, no cartão da oferta."],
  color: [MonitorPlay, "Sala", "O botão da oferta."],
  sale: [MonitorPlay, "Sala", "O aviso de compra, no vídeo e no chat."],
  support: [MonitorPlay, "Sala", "O Suporte: só quem pergunta vê a resposta."],
  theme: [MonitorPlay, "Sala", "A sala e a página, claras ou escuras."],
  agenda: [LayoutTemplate, "Quem se inscreve", "A página mostra a hora; a pessoa espera e entra sozinha."],
  when: [LayoutTemplate, "Página de entrada", "A data e a hora, ao lado do título."],
  jit: [LayoutTemplate, "Página de entrada", "A próxima sessão, daqui a poucos minutos."],
  waiting: [Timer, "Sala de espera", "A contagem até à hora da sessão."],
  whatsapp: [MessageCircle, "WhatsApp", "As mensagens do fluxo, no WhatsApp de cada pessoa."],
  share: [MessageCircle, "WhatsApp", "Quando alguém partilha o link da sala."],
};

const ORANGE = "#E8440C";
const LIVE = "#E5484D";

/** O realce: aro azul e um ponto a pulsar. */
function Hi({ on, className, children }: { on: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative", on && "z-[1] rounded-[8px] shadow-[0_0_0_2px_#0072F5,0_0_0_6px_rgba(0,114,245,.22)]", className)}>
      {children}
      {on ? <i className="absolute -right-1.5 -top-1.5 size-2.5 animate-pulse rounded-full bg-[#0072F5] ring-2 ring-white" /> : null}
    </div>
  );
}

/** «Ao vivo» ou «Começa às…», como na página de entrada. */
function Badge({ label, live, className }: { label: string; live?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.05em]",
        live ? "text-white" : "bg-white/12 text-white/85",
        className,
      )}
      style={live ? { background: LIVE } : undefined}
    >
      {live ? <i className="size-[5px] rounded-full bg-white" /> : null}
      {label}
    </span>
  );
}

function Entry({ spot }: { spot: Spot }) {
  // Como na página: o selo só antes da hora; à hora, só o título.
  const badge = spot === "jit" ? "Começa às 14:15" : spot === "when" ? "Começa a 12/10, 20:00" : null;
  return (
    <Hi on={spot === "card"} className="w-[248px] rounded-[14px]">
      <div className="grid gap-2.5 rounded-[14px] bg-[#141414] p-4 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,.6)]">
        {spot === "button" ? (
          <Hi on className="mb-1 grid gap-1 rounded-md p-0.5">
            <span className="relative block h-1 overflow-hidden rounded-full bg-white/15">
              <span className="absolute inset-y-0 left-0 w-[87%] rounded-full" style={{ background: ORANGE }} />
            </span>
            <span className="text-[9.5px] font-semibold text-white/70">87% das vagas preenchidas</span>
          </Hi>
        ) : null}
        <Hi on={spot === "title"} className="p-0.5">
          <p className="text-[14.5px] font-bold leading-snug">
            {badge ? (
              <Hi on className="mr-1.5 inline-block rounded-[6px] align-[2px]">
                <Badge label={badge} />
              </Hi>
            ) : null}
            Como vender no Instagram
          </p>
        </Hi>
        <Hi on={spot === "form"} className="grid gap-1.5">
          {["Nome", "WhatsApp"].map((f) => (
            <span key={f} className="flex h-8 items-center rounded-lg bg-white/[.06] px-2.5 text-[11.5px] text-white/45 shadow-[0_0_0_1px_rgba(255,255,255,.1)]">
              {f}
            </span>
          ))}
        </Hi>
        <Hi on={spot === "button"}>
          <span className="block rounded-lg py-2 text-center text-[12px] font-bold" style={{ background: ORANGE }}>
            Entrar na sala
          </span>
        </Hi>
      </div>
    </Hi>
  );
}

function Video({ spot, className }: { spot: Spot; className?: string }) {
  return (
    <Hi on={spot === "video"} className={cn("rounded-[10px]", className)}>
      <div className="relative aspect-video overflow-hidden rounded-[10px] bg-[linear-gradient(160deg,#3d434d,#16181c)]">
        <span className="absolute left-2 top-2 flex items-center gap-1.5">
          <Badge label="Ao vivo" live />
          <Hi on={spot === "viewers"} className="rounded-[6px]">
            <span className="flex items-center gap-1 rounded-[5px] bg-black/55 px-1.5 py-[2px] text-[10px] font-semibold tabular-nums text-white">
              <Eye className="size-3" />
              482
            </span>
          </Hi>
        </span>
        {spot === "start" ? (
          <Hi on className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full">
            <span className="block whitespace-nowrap [zoom:1.35]">
              <EntryThumb look="info" />
            </span>
          </Hi>
        ) : (
          <i className="absolute left-1/2 top-1/2 size-0 -translate-x-1/2 -translate-y-1/2 border-y-[9px] border-l-[15px] border-y-transparent border-l-white/85" />
        )}
        {spot === "caption" ? (
          <Hi on className="absolute inset-x-8 bottom-4 rounded-[4px]">
            <span className="block rounded-[4px] bg-black/75 px-1.5 py-0.5 text-center text-[10.5px] font-medium leading-snug">Vou mostrar-vos a mentoria</span>
          </Hi>
        ) : null}
        {spot === "sale" ? (
          <Hi on className="absolute bottom-3 left-2">
            <span className="flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-2 py-1 text-[10.5px] font-semibold text-white">
              <ShoppingCart className="size-3" />
              Helena comprou a Mentoria
            </span>
          </Hi>
        ) : null}
        <span className="absolute inset-x-2 bottom-1.5 h-[3px] rounded-full bg-white/25">
          <span className="block h-full w-[42%] rounded-full" style={{ background: ORANGE }} />
        </span>
      </div>
    </Hi>
  );
}

/** Os formatos lado a lado, com as mesmas miniaturas dos cartões do passo Vídeo. */
function Formats() {
  return (
    <Hi on className="flex gap-3 rounded-[12px] p-1.5">
      {ROOM_FORMATS.map((f) => (
        <span key={f.id} className="grid justify-items-center gap-1">
          <span className="block aspect-[2/1] w-[124px] overflow-hidden rounded-[8px] ring-1 ring-black/10">{FORMAT_THUMB[f.id]()}</span>
          <small className="text-[11.5px] font-medium text-[#4D4D4D]">{f.name}</small>
        </span>
      ))}
    </Hi>
  );
}

/** O fim do vídeo, como na sala: «A aula terminou», o tempo que falta e o botão da oferta. */
function End() {
  return (
    <Room>
      <div className="grid aspect-video place-content-center justify-items-center gap-1 rounded-[10px] bg-[linear-gradient(160deg,#2a2f38,#121417)] text-center">
        <small className="text-[8.5px] font-bold uppercase tracking-[0.2em]" style={{ color: ORANGE }}>
          A aula terminou
        </small>
        <b className="text-[12px] font-bold">As inscrições continuam abertas</b>
        <span className="text-[13px] font-bold tabular-nums">00:29:59</span>
        <Hi on className="mt-0.5 rounded-md">
          <span className="block rounded-md px-3 py-1 text-[10.5px] font-bold" style={{ background: ORANGE }}>
            Ver a oferta
          </span>
        </Hi>
      </div>
    </Room>
  );
}

/** A sala escura (fundo #0f0f0f, como o YouTube), recortada na parte que interessa. */
function Room({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("w-[264px] rounded-[14px] bg-[#0f0f0f] p-3 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,.6)]", className)}>{children}</div>;
}

function Tabs({ on }: { on: "Chat" | "Suporte" | "Oferta" }) {
  return (
    <div className="mb-2 flex gap-3 border-b border-white/10 text-[11px] font-semibold">
      {(["Chat", "Suporte", "Oferta"] as const).map((t) => (
        <span key={t} className={cn("-mb-px pb-1.5", t === on ? "border-b-2 text-white" : "text-white/45")} style={t === on ? { borderColor: ORANGE } : undefined}>
          {t}
        </span>
      ))}
    </div>
  );
}

function Host({ spot }: { spot: Spot }) {
  return (
    <Room className="pt-0">
      {/* O fundo do vídeo, cortado, para se perceber que está por baixo dele. */}
      <div className="-mx-3 mb-2.5 h-9 rounded-t-[14px] bg-[linear-gradient(180deg,#16181c,#3d434d)] opacity-70" />
      <Hi on={spot === "host"} className="flex items-center gap-2 p-1">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#8a5a44,#3b2a22)] text-[11px] font-bold">EK</span>
        <span className="min-w-0 flex-1">
          <b className="flex items-center gap-1 text-[12.5px] font-semibold">
            Edna Kiala <BadgeCheck className="size-3.5 text-[#3B9EFF]" />
          </b>
          <small className="block truncate text-[10.5px] text-white/55">Estrategista de vendas</small>
        </span>
        {spot === "follow" || spot === "host" ? (
          <Hi on={spot === "follow"} className="rounded-full">
            <span className="block rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ background: ORANGE }}>
              + Seguir
            </span>
          </Hi>
        ) : null}
      </Hi>
    </Room>
  );
}

function Chat() {
  const rows: [string, string][] = [
    ["Kátia Domingos", "Boa noite, a ver de Luanda"],
    ["Tiago", "Faz todo o sentido 🔥"],
    ["Inês", "Até quando dá para comprar?"],
  ];
  return (
    <Room>
      <Tabs on="Chat" />
      <Hi on className="grid gap-1.5 p-1">
        {rows.map(([who, text]) => (
          <span key={who} className="flex items-start gap-1.5 text-[11px] leading-snug">
            <i className="mt-px size-4 shrink-0 rounded-full bg-white/20" />
            <span>
              <b className="mr-1 font-semibold text-white/60">{who}</b>
              {text}
            </span>
          </span>
        ))}
      </Hi>
      <span className="mt-2 block rounded-full bg-white/[.08] px-3 py-1.5 text-[10.5px] text-white/40">Comentar…</span>
    </Room>
  );
}

/**
 * O cartão da oferta como está na sala («Quadrada»): o produto num quadrado com o desconto, o nome, os
 * preços, o tempo e o botão na cor da oferta. Na ajuda da Oferta aparece por cima do chat, como no
 * telemóvel; no cronómetro e na cor, no separador Oferta.
 */
function Offer({ spot }: { spot: Spot }) {
  const overChat = spot === "offer";
  return (
    <Room>
      <Tabs on={overChat ? "Chat" : "Oferta"} />
      {overChat ? (
        <div className="mb-2 grid gap-1 opacity-50">
          {[
            ["Kátia", "Boa noite, a ver de Luanda"],
            ["Inês", "Quanto custa?"],
          ].map(([who, text]) => (
            <span key={who} className="flex items-center gap-1.5 text-[10.5px]">
              <i className="size-3.5 shrink-0 rounded-full bg-white/20" />
              <b className="font-semibold text-white/60">{who}</b>
              {text}
            </span>
          ))}
        </div>
      ) : null}
      <Hi on={overChat} className="grid gap-2 rounded-[12px] bg-[#212121] p-2.5 ring-1 ring-white/10">
        <span className="flex gap-2">
          <span
            className="relative grid size-12 shrink-0 place-items-center rounded-[9px]"
            style={{ background: `linear-gradient(140deg, ${ORANGE}, color-mix(in srgb, ${ORANGE} 35%, #000))` }}
          >
            <ShoppingBag className="size-4 opacity-80" />
            <em className="absolute left-1 top-1 rounded-full bg-black/60 px-1 text-[8.5px] font-extrabold not-italic">-75%</em>
          </span>
          <span className="grid min-w-0 flex-1 content-start gap-0.5 leading-tight">
            <small className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-[#FF9A6B]">Inscrições abertas</small>
            <b className="text-[11.5px] font-extrabold">Mentoria Vendas no Instagram</b>
            <span className="flex items-baseline gap-1 text-[10.5px] tabular-nums">
              <s className="text-white/45">100 000 Kz</s>
              <b className="font-extrabold">25 000 Kz</b>
            </span>
            {overChat ? <span className="flex items-center gap-0.5 text-[10.5px] font-extrabold tabular-nums text-[#FF9A6B]"><Timer className="size-3" />09:59</span> : null}
          </span>
          {overChat ? <ChevronDown className="size-4 shrink-0 text-white/50" /> : null}
        </span>
        {/* No separador Oferta, o cronómetro diz a frase inteira, como na sala. */}
        {overChat ? null : (
          <Hi on={spot === "countdown"} className="justify-self-start rounded-[6px]">
            <span className="block rounded-[5px] bg-[#E8440C]/20 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-[#FF9A6B]">A oferta termina em 09:59</span>
          </Hi>
        )}
        <Hi on={spot === "color"} className="rounded-full">
          <span className="block rounded-full py-1.5 text-center text-[11.5px] font-extrabold" style={{ background: ORANGE }}>
            Quero minha vaga
          </span>
        </Hi>
      </Hi>
      {overChat ? <span className="mt-2 block rounded-full bg-white/[.08] px-3 py-1.5 text-[10.5px] text-white/40">Comentar…</span> : null}
    </Room>
  );
}

function Support() {
  return (
    <Room>
      <Tabs on="Suporte" />
      <Hi on className="grid gap-1.5 p-1">
        <span className="justify-self-end rounded-[12px] rounded-br-[4px] bg-white/12 px-2.5 py-1.5 text-[11px]">Dá para pagar por Multicaixa?</span>
        <span className="text-[10px] font-semibold text-white/50">Equipa Edna</span>
        <span className="justify-self-start rounded-[12px] rounded-bl-[4px] bg-[#0072F5] px-2.5 py-1.5 text-[11px]">Sim! No checkout, escolha Multicaixa Express.</span>
      </Hi>
    </Room>
  );
}

function Theme() {
  const mini = (light: boolean) => (
    <span className={cn("grid w-[112px] gap-1.5 rounded-[10px] p-2", light ? "bg-white text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.08)]" : "bg-[#0f0f0f] text-white")}>
      <span className="block aspect-video rounded-[6px] bg-[linear-gradient(160deg,#3d434d,#16181c)]" />
      {["70%", "50%"].map((w) => (
        <i key={w} className={cn("block h-1.5 rounded-full", light ? "bg-[#E5E5E5]" : "bg-white/20")} style={{ width: w }} />
      ))}
      <b className="text-[10.5px] font-semibold">{light ? "Claro" : "Escuro"}</b>
    </span>
  );
  return (
    <Hi on className="flex gap-2 rounded-[12px] p-1">
      {mini(true)}
      {mini(false)}
    </Hi>
  );
}

function Countdown({ small }: { small?: boolean }) {
  return (
    <span className="flex gap-1">
      {(small ? ["12", "34"] : ["00", "02", "34", "56"]).map((n, i) => (
        <span key={i} className={cn("grid place-items-center rounded-md bg-white/10 font-bold tabular-nums", small ? "h-6 w-5 text-[10px]" : "h-9 w-8 text-[14px]")}>
          {n}
        </span>
      ))}
    </span>
  );
}

function Waiting() {
  return (
    <Room className="grid justify-items-center gap-2 py-4 text-center">
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">Sala de espera</span>
      <b className="text-[13px] font-bold">Como vender no Instagram</b>
      <Hi on className="rounded-[8px] p-1">
        <Countdown />
      </Hi>
    </Room>
  );
}

/** O caminho de quem se inscreve: a página com a hora, a espera e a sala. */
function Journey() {
  const step = (label: string, body: ReactNode, wide?: boolean) => (
    <span className="grid justify-items-center gap-1.5">
      <span
        className={cn(
          "grid h-[70px] place-items-center rounded-[10px] bg-[#0f0f0f] p-1.5 text-white shadow-[0_12px_28px_-14px_rgba(0,0,0,.6)]",
          wide ? "w-[104px]" : "w-[64px] sm:w-[76px]",
        )}
      >
        {body}
      </span>
      <small className="text-[11px] font-medium text-[#4D4D4D]">{label}</small>
    </span>
  );
  const arrow = <ArrowRight className="mb-5 size-3.5 shrink-0 text-[#8F8F8F]" />;
  return (
    <div className="flex items-center gap-1.5">
      {step(
        "Inscreve-se",
        <span className="grid justify-items-center gap-1.5">
          <Hi on className="rounded-[6px]">
            <Badge label="Começa às 20:00" className="px-1 text-[8px] tracking-[0.02em]" />
          </Hi>
          <span className="block w-14 rounded-[4px] py-[3px] text-center text-[7.5px] font-bold" style={{ background: ORANGE }}>
            Entrar
          </span>
        </span>,
        true,
      )}
      {arrow}
      {step("Espera", <Countdown small />)}
      {arrow}
      {step(
        "Entra",
        <span className="grid justify-items-center gap-1">
          <Badge label="Ao vivo" live />
          <i className="size-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-white/85" />
        </span>,
      )}
    </div>
  );
}

function WhatsApp({ share }: { share?: boolean }) {
  return (
    <div className="w-[264px] overflow-hidden rounded-[14px] bg-[#EFEAE2] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)]">
      <div className="flex items-center gap-2 bg-[#008069] px-3 py-2 text-[12px] font-semibold text-white">
        <i className="size-6 rounded-full bg-white/35" />
        {share ? "Grupo da turma" : "Edna Kiala"}
      </div>
      <div className="grid gap-1.5 p-3">
        {share ? (
          <Hi on className="justify-self-end rounded-[10px]">
            <span className="block w-[200px] rounded-[10px] bg-[#D9FDD3] p-1.5 text-[#111B21]">
              <span className="grid aspect-[1.9] place-items-center rounded-[6px] bg-[linear-gradient(160deg,#3d434d,#16181c)]">
                <i className="size-0 border-y-[7px] border-l-[12px] border-y-transparent border-l-white/85" />
              </span>
              <b className="mt-1 block text-[11px] font-semibold leading-tight">Aula grátis: vender no Instagram</b>
              <small className="block text-[10px] text-[#667781]">Ao vivo hoje às 20:00 · novawebinar.com</small>
            </span>
          </Hi>
        ) : (
          <Hi on className="grid gap-1.5 justify-self-start rounded-[10px] p-0.5">
            {["Olá Kátia! A aula começa hoje às 20:00.", "Começámos! Entre já: …/w/aula"].map((m, i) => (
              <span key={m} className="max-w-[210px] rounded-[10px] rounded-tl-[3px] bg-white px-2.5 py-1.5 text-[11px] leading-snug text-[#111B21] shadow-[0_1px_1px_rgba(0,0,0,.08)]">
                {m}
                <small className="ml-2 text-[9px] tabular-nums text-[#667781]">{i ? "20:00" : "19:00"}</small>
              </span>
            ))}
          </Hi>
        )}
      </div>
    </div>
  );
}

function Picture({ spot }: { spot: Spot }) {
  switch (spot) {
    case "title":
    case "form":
    case "button":
    case "card":
    case "when":
    case "jit":
      return <Entry spot={spot} />;
    case "video":
    case "start":
    case "caption":
    case "viewers":
    case "sale":
      return (
        <Room>
          <Video spot={spot} />
        </Room>
      );
    case "format":
      return <Formats />;
    case "end":
      return <End />;
    case "host":
    case "follow":
      return <Host spot={spot} />;
    case "chat":
      return <Chat />;
    case "offer":
    case "countdown":
    case "color":
      return <Offer spot={spot} />;
    case "support":
      return <Support />;
    case "theme":
      return <Theme />;
    case "agenda":
      return <Journey />;
    case "waiting":
      return <Waiting />;
    case "whatsapp":
    case "share":
      return <WhatsApp share={spot === "share"} />;
  }
}

/** O tronco da ajuda: onde está, em ponto grande, com o elemento realçado. */
export function HelpScene({ topic }: { topic: HelpTopic }) {
  const spot = SCENES[topic];
  const [Icon, screen, where] = WHERE[spot];
  return (
    <figure className="grid gap-2">
      <div className="relative grid min-h-[176px] place-items-center overflow-hidden rounded-xl bg-[#F2F2F2] bg-[radial-gradient(#DADADA_1px,transparent_1px)] px-3 pb-5 pt-10 [background-size:14px_14px]">
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11.5px] font-medium text-[#4D4D4D] shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <Icon className="size-3.5" />
          {screen}
        </span>
        {/* No computador há espaço: a mesma ilustração, maior. */}
        <div className="sm:[zoom:1.15]">
          <Picture spot={spot} />
        </div>
      </div>
      <figcaption className="flex items-center gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
        <i className="block size-2 shrink-0 rounded-full bg-[#0072F5]" />
        {where}
      </figcaption>
    </figure>
  );
}
