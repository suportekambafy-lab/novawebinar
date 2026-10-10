import {
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  Headphones,
  MessageCircle,
  MoreHorizontal,
  Radio,
  Repeat2,
  Send,
  ShoppingCart,
  Sparkles,
  Video,
} from "lucide-react";
import presenter480 from "@/assets/local/nova-presenter-480.webp";
import presenter720 from "@/assets/local/nova-presenter-720.webp";

/** A foto da sala: WebP com tamanho fixo e lazy (18 KB ou 28 KB, conforme o ecrã). */
function Presenter() {
  return (
    <img
      src={presenter480}
      srcSet={`${presenter480} 480w, ${presenter720} 720w`}
      sizes="(min-width: 1024px) 40vw, 80vw"
      width={720}
      height={480}
      loading="lazy"
      decoding="async"
      alt="Pessoa a fazer uma apresentação num ambiente profissional"
    />
  );
}

export function ScheduleVisual() {
  return (
    <div className="lp-product-frame" aria-label="Demonstração da configuração de uma sessão recorrente">
      <div className="lp-editor-rail" aria-hidden="true"><b>N</b><span className="is-active"><CalendarDays /></span><span><Video /></span><span><MessageCircle /></span><span><Sparkles /></span><span><BarChart3 /></span></div>
      <div className="lp-product-ui lp-schedule-ui">
        <div className="lp-ui-header"><div><span>WEBINAR · DEMONSTRAÇÃO</span><strong>Configuração da sessão</strong></div><MoreHorizontal /></div>
        <div className="lp-mode-switch"><span className="is-active">Webinar único</span><span>Just in time</span></div>
        <div className="lp-switch-row"><div><strong>Ativar repetição automática</strong><small>Uma sessão por dia ou por semana.</small></div><span className="lp-switch-on" aria-hidden="true" /></div>
        <div className="lp-form-grid is-four">
          <div><Repeat2 /><span>Quando</span><strong>Diário</strong></div>
          <div><Clock3 /><span>Hora de início</span><strong>20:00</strong></div>
          <div><Clock3 /><span>Hora de fim</span><strong>21:15</strong></div>
          <div><CalendarDays /><span>Fuso horário</span><strong>Lisboa</strong></div>
        </div>
        <div className="lp-ui-footer"><span><Check /> Próxima sessão preparada</span><span className="lp-faux-button">Guardar alterações</span></div>
      </div>
    </div>
  );
}

export function RoomVisual({ sales = false }: { sales?: boolean }) {
  return (
    <div className="lp-room-ui" aria-label={sales ? "Sala ao vivo com notificações de venda" : "Sala ao vivo do Novawebinar"}>
      <div className="lp-room-player">
        <Presenter />
        <div className="lp-room-top">
          <span className="lp-live-group"><b className="lp-live-tag"><Radio /> Ao Vivo</b><b className="lp-live-count"><Eye /> 1 284</b></span>
        </div>
        {sales ? (
          <div className="lp-purchase-toast"><span><ShoppingCart /></span><p><strong>João Pereira</strong> comprou Viver de Leilão</p></div>
        ) : null}
      </div>
      <div className="lp-room-side">
        <div className="lp-room-tabs"><strong>Chat</strong><span>Suporte</span><span>Oferta</span></div>
        {sales ? (
          <>
            <div className="lp-chat-line"><span className="lp-avatar">RM</span><div><strong>Ricardo M.</strong><p>Quero comprar, como faço?</p></div><small>21:02</small></div>
            <div className="lp-chat-purchase"><span><ShoppingCart /></span><p><strong>João Pereira</strong> comprou Viver de Leilão</p></div>
            <div className="lp-chat-line"><span className="lp-avatar is-alt">MS</span><div><strong>Marta S.</strong><p>Já faturei 4 mil com o método</p></div><small>21:03</small></div>
            <div className="lp-chat-purchase"><span><ShoppingCart /></span><p><strong>Inês Carvalho</strong> comprou Viver de Leilão</p></div>
            <div className="lp-message-field"><span>Escrever uma mensagem</span><Send /></div>
          </>
        ) : (
          <>
            <div className="lp-chat-line"><span className="lp-avatar">AS</span><div><strong>Ana Sofia</strong><p>Boa noite! A entrar agora, de Braga</p></div><small>20:58</small></div>
            <div className="lp-chat-line"><span className="lp-avatar is-alt">RM</span><div><strong>Ricardo M.</strong><p>Quero comprar, onde clico?</p></div><small>21:01</small></div>
            <div className="lp-chat-line"><span className="lp-avatar">MS</span><div><strong>Marta S.</strong><p>Já faturei 4 mil com o método</p></div><small>21:03</small></div>
            <div className="lp-message-field"><span>Escrever uma mensagem</span><Send /></div>
          </>
        )}
      </div>
    </div>
  );
}

export function ReplayVisual() {
  return (
    <div className="lp-room-ui" aria-label="Sala em modo replay do Novawebinar">
      <div className="lp-room-player">
        <Presenter />
        <div className="lp-room-top">
          <span className="lp-live-group"><b className="lp-replay-tag"><Video /> Replay</b><b className="lp-live-count"><Eye /> 312</b></span>
        </div>
        <div className="lp-replay-bar">
          <span className="lp-replay-track"><span style={{ width: "56%" }} /></span>
          <small>32:14 / 58:00</small>
        </div>
      </div>
      <div className="lp-room-side">
        <div className="lp-room-tabs"><strong>Chat</strong><span>Suporte</span><span>Oferta</span></div>
        <div className="lp-chat-line"><span className="lp-avatar">AS</span><div><strong>Ana Sofia</strong><p>Boa noite! A entrar agora, de Braga</p></div><small>20:58</small></div>
        <div className="lp-chat-line"><span className="lp-avatar is-alt">RM</span><div><strong>Ricardo M.</strong><p>Quero comprar, onde clico?</p></div><small>21:01</small></div>
        <div className="lp-chat-line"><span className="lp-avatar">MS</span><div><strong>Marta S.</strong><p>Já faturei 4 mil com o método</p></div><small>21:03</small></div>
        <div className="lp-message-field"><span>Escrever uma mensagem</span><Send /></div>
      </div>
    </div>
  );
}

export function AssistanceVisual() {
  return (
    <div className="lp-product-ui lp-assistance-ui" aria-label="Demonstração da configuração do Assistente IA">
      <div className="lp-ui-header"><div><span>AGENTE IA · DEMONSTRAÇÃO</span><strong>Assistência no suporte privado</strong></div><Bot /></div>
      <div className="lp-ai-status"><span><span /> Assistente IA ativo</span><small>Identificado como assistente</small></div>
      <div className="lp-ai-grid"><div><Headphones /><span>Conhecimento</span><strong>Conteúdo do webinar</strong></div><div><MessageCircle /><span>Respostas</span><strong>FAQs e objeções</strong></div></div>
      <div className="lp-ai-reply"><span>PARTICIPANTE · SUPORTE</span><p>Onde posso rever esta parte?</p><div><Bot /><p>Posso ajudar com base no conteúdo já apresentado. Se necessário, encaminho para a equipa.</p></div></div>
      <small className="lp-safety-note">A equipa pode pausar o assistente em cada conversa.</small>
    </div>
  );
}

export function DashboardVisual() {
  return (
    <div className="lp-dashboard-ui" aria-label="Pré-visualização ilustrativa do painel de acompanhamento">
      <div className="lp-dashboard-head"><div><span>VISÃO GERAL</span><strong>Acompanhamento do webinar</strong></div><span className="lp-filter-demo">Últimos 30 dias <ChevronDown /></span></div>
      <div className="lp-stat-row">
        <div><span>Inscritos</span><strong>—</strong><small>Dados reais da sua sessão</small></div>
        <div><span>Assistiram</span><strong>—</strong><small>Ao vivo e replay</small></div>
        <div><span>Tempo médio</span><strong>—</strong><small>Retenção acompanhada</small></div>
      </div>
      <div className="lp-chart-area">
        <div className="lp-chart-labels"><span>Participação ao longo da sessão</span><span>Pré-visualização</span></div>
        <svg viewBox="0 0 720 220" role="img" aria-label="Exemplo ilustrativo de gráfico de retenção">
          <path className="lp-chart-gridline" d="M0 40H720M0 100H720M0 160H720M0 215H720" />
          <path className="lp-chart-fill" d="M0 190 C90 180 120 68 205 76 S310 105 390 92 S510 126 575 130 S650 150 720 168 V220 H0Z" />
          <path className="lp-chart-line" d="M0 190 C90 180 120 68 205 76 S310 105 390 92 S510 126 575 130 S650 150 720 168" />
        </svg>
      </div>
      <span className="lp-demo-caption">Pré-visualização ilustrativa — sem dados de clientes</span>
    </div>
  );
}

export function OfferVisual() {
  return (
    <div className="lp-room-ui is-offer" aria-label="Oferta apresentada durante a sessão ao vivo">
      <div className="lp-room-player">
        <Presenter />
        <div className="lp-room-top">
          <span className="lp-live-group"><b className="lp-live-tag"><Radio /> Ao Vivo</b><b className="lp-live-count"><Eye /> 1 284</b></span>
        </div>
      </div>
      <div className="lp-room-side">
        <div className="lp-room-tabs"><span>Chat</span><span>Suporte</span><strong>Oferta</strong></div>
        <div className="lp-offer-panel">
          <div className="lp-offer-product"><span>OFERTA DA SESSÃO</span><strong>Viver de Leilão</strong></div>
          <p className="lp-offer-prices"><s>De 497 €</s><strong>Por 197 €</strong></p>
          <span className="lp-offer-cta"><ShoppingCart /> Quero garantir o meu lugar</span>
          <div className="lp-offer-countdown"><span>Oferta termina em</span><strong>14:59</strong></div>
        </div>
      </div>
    </div>
  );
}
