/**
 * Integrações num pop-up, como as definições da Manus: categorias à esquerda, uma lista limpa
 * à direita e, ao clicar, o detalhe com "Conectar" e a visão geral. Abre-se pelo menu em
 * qualquer página (#integracoes/secção/integração).
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Mail,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  ShoppingBag,
  Webhook,
  CodeXml,
  Funnel,
  History,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import eduzzLogo from "@/assets/integrations/eduzz.png";
import googleLogo from "@/assets/integrations/google_ads.jpg";
import hotmartLogo from "@/assets/integrations/hotmart.png";
import kambafyLogo from "@/assets/integrations/kambafy.png";
import kiwifyLogo from "@/assets/integrations/kiwify.png";
import metaLogo from "@/assets/integrations/meta.jpg";
import stripeLogo from "@/assets/integrations/stripe.png";
import tiktokLogo from "@/assets/integrations/tiktok.svg";
import whatsappLogo from "@/assets/local/whatsapp-icon.webp";
import {
  PaneHeader,
  PanelDialog,
  PanelNavButton,
  PanelNavFooter,
  PanelNavGroup,
  PanelProfile,
  PanelSection,
  PanelTitle,
} from "@/components/panel-modal";
import { EmptyState } from "@/components/ds/data";
import { SettingsModal } from "@/components/settings-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { relativeDays } from "@/lib/contacts";
import {
  connectIntegration,
  formatDateTime,
  publicOrigin,
  updateIntegration,
  useIntegrationEvents,
  useIntegrations,
  useInvalidate,
  useWorkspace,
  type IntegrationRow,
  useWebinars,
} from "@/lib/data";
import {
  DEFAULT_COUNTRY_CODE,
  generateSecret,
  PROVIDERS,
  providerInfo,
  whatsappReady,
  type IntegrationGroup,
  type ProviderId,
  type ProviderInfo,
} from "@/lib/integrations";
import { useIntegrationsRoute } from "@/lib/modal-route";
import { cn } from "@/lib/utils";
import { whatsappSession } from "@/lib/whatsapp.functions";

type Events = NonNullable<ReturnType<typeof useIntegrationEvents>["data"]>;

// O balão do WhatsApp no mesmo traço fino dos outros ícones do menu (desenho do Tabler, MIT).
const WhatsappLine = createLucideIcon("whatsapp-line", [
  ["path", { d: "M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9", key: "balao" }],
  [
    "path",
    {
      d: "M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1",
      key: "telefone",
    },
  ],
]);

type SectionId = "vendas" | "anuncios" | "whatsapp" | "email" | "sms" | "api" | "actividade";
type Section = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  subtitle: string;
  group?: IntegrationGroup;
};

const NAV: { heading: string; items: Section[] }[] = [
  {
    heading: "Vendas e anúncios",
    items: [
      {
        id: "vendas",
        label: "Plataformas de venda",
        icon: ShoppingBag,
        subtitle: "Cada venda aprovada entra sozinha e liga-se ao contacto.",
        group: "sales",
      },
      {
        id: "anuncios",
        label: "Pixels e conversões",
        icon: Funnel,
        subtitle: "Os anúncios aprendem quem se inscreve e quem compra.",
        group: "ads",
      },
    ],
  },
  {
    heading: "Mensagens",
    items: [
      {
        id: "whatsapp",
        label: "WhatsApp",
        icon: WhatsappLine,
        subtitle: "As automações enviam para o contacto e para os grupos.",
      },
      { id: "email", label: "Email", icon: Mail, subtitle: "Mensagens por email para o contacto." },
      {
        id: "sms",
        label: "SMS",
        icon: Smartphone,
        subtitle: "SMS para o número do contacto.",
      },
    ],
  },
  {
    heading: "Dados",
    items: [
      {
        id: "api",
        label: "API e webhooks",
        icon: CodeXml,
        subtitle: "Inscrições, cliques e vendas para o seu CRM, Zapier, Make ou n8n.",
        group: "send",
      },
    ],
  },
];
/** No fundo do menu, depois de uma linha, como "Criar uma equipa" e "Obter ajuda" na referência. */
const FOOTER: Section[] = [
  {
    id: "actividade",
    label: "Actividade",
    icon: History,
    subtitle: "O que as plataformas enviaram e o estado de cada pedido.",
  },
];
const SECTIONS = [...NAV.flatMap((g) => g.items), ...FOOTER];

/** Uma frase curta por integração na lista: todos os cartões com a mesma medida. */
const SHORT: Record<ProviderId, string> = {
  kambafy: "Vendas em kwanzas, ligadas ao webinar certo.",
  hotmart: "Compras, recusas, boletos e reembolsos.",
  kiwify: "Vendas, Pix, boletos e reembolsos.",
  eduzz: "Faturas pagas, canceladas e carrinhos abandonados.",
  stripe: "Checkout e Payment Links, com reembolsos.",
  webhook: "Qualquer sistema que envie um POST em JSON.",
  meta_pixel: "Facebook e Instagram aprendem quem se inscreve.",
  tiktok_pixel: "O TikTok aprende quem se inscreve e clica.",
  google_tag: "Google Ads e Analytics com inscrições e cliques.",
  outgoing_webhook: "Inscrições, cliques e vendas para o seu CRM.",
};

const LOGOS: Partial<Record<ProviderId, string>> = {
  kambafy: kambafyLogo,
  hotmart: hotmartLogo,
  kiwify: kiwifyLogo,
  eduzz: eduzzLogo,
  stripe: stripeLogo,
  meta_pixel: metaLogo,
  tiktok_pixel: tiktokLogo,
  google_tag: googleLogo,
};

const EVENT_STATUS: Record<
  string,
  { label: string; variant: "success" | "destructive" | "secondary" }
> = {
  accepted: { label: "Aceite", variant: "success" },
  rejected: { label: "Recusado", variant: "destructive" },
  ignored: { label: "Ignorado", variant: "secondary" },
};

function money(value: number | null, currency: string | null) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: currency || "AOA",
    }).format(value);
  } catch {
    return `${value} ${currency ?? ""}`;
  }
}

/** O mosaico branco de cada integração: a marca, ou um ícone na cor do canal. */
function Tile({
  src,
  icon: Icon,
  tone = "text-foreground",
  className = "size-10",
}: {
  src?: string | undefined;
  icon?: LucideIcon | undefined;
  tone?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-[var(--border-card)] bg-white",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-[62%] object-contain" draggable={false} />
      ) : (
        Icon && <Icon className={cn("size-1/2", tone)} strokeWidth={1.75} aria-hidden />
      )}
    </span>
  );
}

function ProviderTile({ id, className }: { id: ProviderId; className?: string }) {
  const src = LOGOS[id];
  if (src) return <Tile src={src} className={className} />;
  return <Tile icon={id === "outgoing_webhook" ? Send : Webhook} className={className} />;
}

const CHANNEL_TILE: Record<
  "whatsapp" | "email" | "sms",
  { src?: string; icon?: LucideIcon; tone?: string }
> = {
  whatsapp: { src: whatsappLogo },
  email: { icon: Mail, tone: "text-info" },
  sms: { icon: Smartphone, tone: "text-navy" },
};

type Status = { label: string; tone: "on" | "warn" | "off" };

function statusOf(info: ProviderInfo, row: IntegrationRow | undefined): Status {
  if (!row) return { label: "Por ligar", tone: "off" };
  if (!row.enabled) return { label: "Desligada", tone: "off" };
  const missingSecret = info.secret?.required && !row.has_secret;
  const missingSetting = info.setting && !row.settings?.[info.setting.key];
  if (missingSecret || missingSetting) return { label: "Falta configurar", tone: "warn" };
  return { label: "Ligada", tone: "on" };
}

function StatusPill({ status, small = false }: { status: Status; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium",
        small ? "px-2 py-px text-xs" : "px-2.5 py-0.5 text-xs",
        status.tone === "on" && "border-success/30 bg-success-soft text-success",
        status.tone === "warn" && "border-warning/40 bg-warning-soft text-warning-foreground",
        status.tone === "off" && "bg-white text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          status.tone === "on" && "bg-success",
          status.tone === "warn" && "bg-warning",
          status.tone === "off" && "bg-gray-400",
        )}
        aria-hidden
      />
      {status.label}
    </span>
  );
}

/* ---------- Peças da página da direita ---------- */

/** O valor do selector de âmbito para «toda a conta». */
const ACCOUNT = "conta";

/** Duas colunas sempre, com uma só integração também: todos os cartões com a mesma largura. */
const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2";

/** Uma linha da lista: mosaico, nome, uma frase e a seta, como nas referências. */
function Row({
  tile,
  title,
  text,
  status,
  onClick,
}: {
  tile: ReactNode;
  title: string;
  text: string;
  status?: Status | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[88px] w-full cursor-pointer items-center gap-3.5 rounded-xl border border-hairline bg-white px-4 text-left transition-shadow hover:shadow-[var(--shadow-raised)] focus-visible:outline-none focus-visible:ring-focus"
    >
      {tile}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-foreground">{title}</span>
          {status && status.tone !== "off" && <StatusPill status={status} small />}
        </span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {text}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-gray-600" aria-hidden />
    </button>
  );
}

/** O cartão de cima do detalhe: o que é e o botão principal. */
function ActionCard({
  tile,
  title,
  text,
  action,
}: {
  tile: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <div className="flex min-h-[76px] flex-wrap items-center gap-3.5 rounded-xl border border-hairline bg-white px-4 py-3 sm:flex-nowrap">
      {tile}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-foreground">{title}</p>
        <p className="text-[13px] text-muted-foreground">{text}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{action}</div>
    </div>
  );
}

function Overview({ children }: { children: ReactNode }) {
  return <PanelSection title="Visão geral">{children}</PanelSection>;
}

function ConnectButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="dark" {...props}>
      {children} <ArrowUpRight aria-hidden />
    </Button>
  );
}

/* ---------- O pop-up ---------- */

export default function IntegrationsModal() {
  const { section, item, go } = useIntegrationsRoute();
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const isTest = Boolean(workspace?.isTest);
  const { data: rows = [], isLoading } = useIntegrations(orgId);
  const { data: events = [] } = useIntegrationEvents(orgId);
  const [query, setQuery] = useState("");
  // As Definições abrem por cima das Integrações; o X delas volta aqui.
  const [settings, setSettings] = useState<string | null>(null);

  // O âmbito: toda a conta (webinar_id nulo) ou um webinar (produto). Cada fornecedor tem uma ligação por âmbito;
  // na sala, o pixel do webinar substitui o da conta; o receptor de vendas e o webhook de saída de um webinar
  // valem para esse webinar. O WhatsApp é sempre da conta (é um número).
  const { data: webinars = [] } = useWebinars(orgId);
  const [scope, setScope] = useState<string>(ACCOUNT);
  const webinarId = scope === ACCOUNT ? null : scope;
  const byProvider = useMemo(() => {
    const map = new Map<string, IntegrationRow>();
    for (const r of rows) {
      if (r.provider === "whatsapp" ? !r.webinar_id : (r.webinar_id ?? null) === webinarId) map.set(r.provider, r);
    }
    return map;
  }, [rows, webinarId]);
  /** Quantas ligações de cada fornecedor existem noutros âmbitos (para o cartão dizer «e mais 2 webinars»). */
  const elsewhere = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) if ((r.webinar_id ?? null) !== webinarId) count.set(r.provider, (count.get(r.provider) ?? 0) + 1);
    return count;
  }, [rows, webinarId]);
  const scopeLabel = webinarId
    ? (webinars.find((w) => w.id === webinarId)?.public_title ?? "Webinar")
    : "Toda a conta";
  const scopePicker = (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Para</span>
      <Select value={scope} onValueChange={setScope}>
        <SelectTrigger className="h-9 w-full max-w-[22rem]" aria-label="A conta ou o webinar a que a ligação se aplica">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ACCOUNT}>Toda a conta</SelectItem>
          {webinars.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.public_title || w.internal_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;
  const open = (id: SectionId) => {
    setQuery("");
    go([id]);
  };

  const navButton = (s: Section) => (
    <PanelNavButton
      key={s.id}
      icon={s.icon}
      label={s.label}
      active={s.id === current.id && !query}
      onClick={() => open(s.id)}
    />
  );

  let content: ReactNode;
  if (!orgId || isLoading) {
    content = <Skeleton className="h-64 w-full" />;
  } else if (query.trim()) {
    content = (
      <SearchResults
        query={query}
        byProvider={byProvider}
        rows={rows}
        onPick={(path) => {
          setQuery("");
          go(path);
        }}
      />
    );
  } else if (current.group) {
    const info = item ? providerInfo(item) : undefined;
    content =
      info && info.group === current.group ? (
        <ProviderDetail
          key={`${info.id}:${scope}`}
          info={info}
          row={byProvider.get(info.id)}
          events={events}
          organizationId={orgId}
          webinarId={webinarId}
          scopeLabel={scopeLabel}
          onBack={() => go([current.id])}
        />
      ) : (
        <>
          <PaneHeader title={current.label} subtitle={current.subtitle} />
          <div className="mb-4">{scopePicker}</div>
          <div className={GRID}>
            {PROVIDERS.filter((p) => p.group === current.group).map((p) => (
              <Row
                key={p.id}
                tile={<ProviderTile id={p.id} />}
                title={p.name}
                text={
                  elsewhere.get(p.id)
                    ? `${SHORT[p.id]} ${webinarId ? "Há uma ligação na conta." : `Mais ${elsewhere.get(p.id)} ${elsewhere.get(p.id) === 1 ? "webinar com a sua" : "webinars com a sua"}.`}`
                    : SHORT[p.id]
                }
                status={statusOf(p, byProvider.get(p.id))}
                onClick={() => go([current.id, p.id])}
              />
            ))}
          </div>
        </>
      );
  } else if (current.id === "whatsapp") {
    content =
      item === "oficial" ? (
        <WhatsappOfficial
          row={byProvider.get("whatsapp")}
          organizationId={orgId}
          onBack={() => go(["whatsapp"])}
        />
      ) : (
        <WhatsappOverview
          row={byProvider.get("whatsapp")}
          organizationId={orgId}
          isTest={isTest}
          onOfficial={() => go(["whatsapp", "oficial"])}
        />
      );
  } else if (current.id === "email" || current.id === "sms") {
    content = <ChannelSoon section={current} isTest={isTest} onWebhook={() => go(["api"])} />;
  } else {
    content = (
      <>
        <PaneHeader title={current.label} subtitle={current.subtitle} />
        <div>
          <Activity events={events} />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelDialog
        title="Integrações"
        description="Ligue plataformas de venda, pixels, canais de mensagens e webhooks."
        onClose={() => go(null)}
        sidebar={
          <>
            <div>
              <PanelTitle>Integrações</PanelTitle>
              <label className="relative mt-3 block px-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-gray-600"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Procurar"
                  aria-label="Procurar integrações"
                  className="h-9 pl-9"
                />
              </label>
            </div>
            {NAV.map((g) => (
              <PanelNavGroup key={g.heading} heading={g.heading}>
                {g.items.map(navButton)}
              </PanelNavGroup>
            ))}
            <PanelNavFooter>
              {FOOTER.map(navButton)}
              {workspace && (
                <PanelProfile workspace={workspace} onClick={() => setSettings("perfil")} />
              )}
            </PanelNavFooter>
          </>
        }
        mobileNav={SECTIONS.map(navButton)}
      >
        {content}
      </PanelDialog>
      {settings && (
        <SettingsModal
          section={settings}
          onSection={setSettings}
          onClose={() => setSettings(null)}
        />
      )}
    </>
  );
}

/* ---------- Procurar ---------- */

const CHANNEL_ROWS = [
  { id: "whatsapp", name: "WhatsApp", text: "Código QR ou API oficial da Meta." },
  { id: "email", name: "Email", text: "Mensagens por email para o contacto." },
  { id: "sms", name: "SMS", text: "SMS para o número do contacto." },
] as const;

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt");

function SearchResults({
  query,
  byProvider,
  rows,
  onPick,
}: {
  query: string;
  byProvider: Map<string, IntegrationRow>;
  rows: IntegrationRow[];
  onPick: (path: string[]) => void;
}) {
  const q = plain(query.trim());
  const sectionOf = (group: IntegrationGroup) => SECTIONS.find((s) => s.group === group)!.id;
  const providers = PROVIDERS.filter((p) =>
    plain(`${p.name} ${p.category} ${p.blurb}`).includes(q),
  );
  const channels = CHANNEL_ROWS.filter((c) => plain(`${c.name} ${c.text}`).includes(q));
  const whatsapp = rows.find((r) => r.provider === "whatsapp");
  return (
    <>
      <PaneHeader title="Resultados" subtitle={`Integrações com "${query.trim()}".`} />
      {providers.length + channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma integração com esse nome.</p>
      ) : (
        <div className={GRID}>
          {channels.map((c) => (
            <Row
              key={c.id}
              tile={<Tile {...CHANNEL_TILE[c.id]} />}
              title={c.name}
              text={c.text}
              status={
                c.id === "whatsapp" && whatsappReady(whatsapp)
                  ? { label: "Ligado", tone: "on" }
                  : null
              }
              onClick={() => onPick([c.id])}
            />
          ))}
          {providers.map((p) => (
            <Row
              key={p.id}
              tile={<ProviderTile id={p.id} />}
              title={p.name}
              text={SHORT[p.id]}
              status={statusOf(p, byProvider.get(p.id))}
              onClick={() => onPick([sectionOf(p.group), p.id])}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Detalhe de uma plataforma, pixel ou webhook ---------- */

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={value}
        aria-label={label}
        className="font-[family-name:var(--font-code)] text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Copiar ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function ProviderDetail({
  info,
  row,
  events,
  organizationId,
  webinarId,
  scopeLabel,
  onBack,
}: {
  info: ProviderInfo;
  row: IntegrationRow | undefined;
  events: Events;
  organizationId: string;
  /** O âmbito escolhido no topo: null é toda a conta. */
  webinarId: string | null;
  scopeLabel: string;
  onBack: () => void;
}) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  // Segredo gerado por nós: mostrado uma única vez; depois só se sabe que existe.
  const [shownSecret, setShownSecret] = useState<string | null>(null);
  const [setting, setSetting] = useState(
    info.setting ? (row?.settings?.[info.setting.key] ?? "") : "",
  );

  const run = async (task: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await task();
      if (ok) toast.success(ok);
      invalidate(["integrations"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const secret = info.secret?.generate ? generateSecret() : "";
      await connectIntegration(organizationId, info.id, secret, webinarId);
      if (secret) setShownSecret(secret);
    }, `${info.name} ligada ${webinarId ? "neste webinar" : "na conta"}. Siga os passos abaixo.`);

  const regenerate = () =>
    run(async () => {
      const secret = generateSecret();
      await updateIntegration(row!.id, { secret });
      setShownSecret(secret);
    }, "Novo segredo gerado. Actualize-o também na plataforma.");

  const settingValid = !info.setting || info.setting.pattern.test(setting.trim());
  const hookUrl = row ? `${publicOrigin()}/api/public/hooks/${row.endpoint_key}` : "";
  const isLocal = /\/\/(localhost|127\.|192\.168\.)/.test(hookUrl);
  const recent = events.filter((e) => e.provider === info.id).slice(0, 5);

  const field = (show: "url" | "secret" | "setting") => {
    if (!row) return null;
    if (show === "url") {
      return (
        <div className="space-y-1.5">
          <CopyField label="Endereço de ligação" value={hookUrl} />
          {isLocal && (
            <p className="text-xs text-warning-foreground">
              Versão local: as plataformas só conseguem enviar vendas quando a aplicação estiver
              publicada num domínio.
            </p>
          )}
        </div>
      );
    }
    if (show === "setting" && info.setting) {
      return (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={setting}
              placeholder={info.setting.placeholder}
              aria-label={info.setting.label}
              aria-invalid={!settingValid}
              onChange={(e) => setSetting(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy || !settingValid || !setting.trim()}
              onClick={() =>
                run(
                  () =>
                    updateIntegration(row.id, {
                      settings: { ...row.settings, [info.setting!.key]: setting.trim() },
                    }),
                  "Guardado.",
                )
              }
            >
              Guardar
            </Button>
          </div>
          {!settingValid && setting.trim() && (
            <p className="text-xs text-destructive" role="alert">
              Formato inválido. Exemplo: {info.setting.placeholder}
            </p>
          )}
        </div>
      );
    }
    if (show === "secret" && info.secret) {
      if (shownSecret) {
        return (
          <div className="space-y-1.5">
            <CopyField label={info.secret.label} value={shownSecret} />
            <p className="text-xs text-muted-foreground" role="status">
              Copie-o agora: por segurança não o voltamos a mostrar.
            </p>
          </div>
        );
      }
      if (info.secret.generate) {
        return (
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <span className="text-muted-foreground">
              {info.secret.label}:{" "}
              <strong className="text-foreground">
                {row.has_secret ? "definido" : "sem segredo"}
              </strong>
            </span>
            <Button variant="outline" size="sm" onClick={regenerate} disabled={busy}>
              <RefreshCw /> {row.has_secret ? "Gerar novo" : "Gerar"}
            </Button>
          </div>
        );
      }
      return (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={secretInput}
              aria-label={info.secret.label}
              placeholder={
                row.has_secret
                  ? `${info.secret.label} guardado · colar para substituir`
                  : info.secret.label
              }
              onChange={(e) => setSecretInput(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy || !secretInput.trim()}
              onClick={() =>
                run(async () => {
                  await updateIntegration(row.id, { secret: secretInput.trim() });
                  setSecretInput("");
                }, "Guardado.")
              }
            >
              Guardar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {row.has_secret && <span className="mr-1 font-medium text-success">✓ Guardado.</span>}
            {info.secret.help}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <PaneHeader title={info.name} onBack={onBack} />
      <div>
        <ActionCard
          tile={<ProviderTile id={info.id} />}
          title={info.name}
          text={`${info.category} · ${scopeLabel}`}
          action={
            row ? (
              <StatusPill status={statusOf(info, row)} />
            ) : (
              <ConnectButton onClick={connect} disabled={busy}>
                Conectar
              </ConnectButton>
            )
          }
        />
      </div>

      <Overview>
        <p>{info.blurb}</p>
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="font-medium text-foreground">Como ligar</h4>
            {info.dashboardUrl && (
              <a
                href={info.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Abrir {info.name} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
          {!row && (
            <p className="mb-3 text-muted-foreground">
              Carregue em Conectar: criamos o seu endereço de ligação
              {info.secret?.generate ? " e um segredo único" : ""}
              {webinarId ? ` só para «${scopeLabel}»` : " para toda a conta"}. Depois é só seguir os passos.
            </p>
          )}
          <ol className="space-y-4">
            {info.steps.map((step, i) => {
              const text = typeof step === "string" ? step : step.text;
              const show = typeof step === "string" ? null : step.show;
              return (
                <li key={i} className="flex gap-3">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      row ? "border-foreground/20" : "text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <p className={row ? "" : "text-muted-foreground"}>{text}</p>
                    {show && field(show)}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {info.group === "ads" && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Com visitantes da União Europeia, a lei exige pedir consentimento de cookies antes de
            activar pixels de anúncios.
          </p>
        )}

        {row && info.group === "sales" && (
          <div>
            <h4 className="mb-2 font-medium text-foreground">Últimos pedidos</h4>
            {recent.length === 0 ? (
              <p className="text-muted-foreground">
                Ainda não chegou nada. Use o botão de teste da plataforma para confirmar a ligação.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {recent.map((e) => {
                  const st = EVENT_STATUS[e.status] ?? {
                    label: e.status,
                    variant: "secondary" as const,
                  };
                  return (
                    <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate">
                          {e.buyer_email ?? e.event_type ?? "Pedido"}
                          {e.amount_value !== null ? ` · ${money(e.amount_value, e.currency)}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {relativeDays(e.received_at)}
                          {e.reason ? ` · ${e.reason}` : ""}
                        </p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {row && (
          <div className="flex items-center justify-between border-t pt-4">
            <label className="flex items-center gap-2">
              <Switch
                checked={row.enabled}
                onCheckedChange={(enabled) => run(() => updateIntegration(row.id, { enabled }))}
                disabled={busy}
              />
              {row.enabled ? "Activa" : "Desligada"}
            </label>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `Remover a ligação à ${info.name}? O histórico de vendas mantém-se.`,
                  )
                )
                  return;
                void run(async () => {
                  const { error } = await supabase.from("integrations").delete().eq("id", row.id);
                  if (error) throw error;
                  onBack();
                }, "Ligação removida.");
              }}
            >
              Remover
            </Button>
          </div>
        )}
      </Overview>
    </>
  );
}

/* ---------- WhatsApp ---------- */

const settingsOf = (row: IntegrationRow | undefined) =>
  (row?.settings ?? {}) as Record<string, string>;

function WhatsappOverview({
  row,
  organizationId,
  isTest,
  onOfficial,
}: {
  row: IntegrationRow | undefined;
  organizationId: string;
  isTest: boolean;
  onOfficial: () => void;
}) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const settings = settingsOf(row);
  const linked = whatsappReady(row);
  const officialSaved = Boolean(settings["phone_number_id"]);

  // O código pertence à ligação desta organização: cria-a, ou passa-a a não oficial, antes de o pedir.
  // Os dados da oficial ficam guardados ao lado.
  const startQr = async () => {
    setBusy(true);
    try {
      const id = row?.id ?? (await connectIntegration(organizationId, "whatsapp", "")).id;
      if (settings["mode"] !== "unofficial")
        await updateIntegration(id, { settings: { ...settings, mode: "unofficial" } });
      invalidate(["integrations"]);
      setQrOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível começar a ligação.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PaneHeader
        title="WhatsApp"
        subtitle="As automações enviam para o contacto e para os grupos."
      />
      {isTest && (
        <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          Conta de teste: as mensagens são simuladas e nada sai da plataforma.
        </p>
      )}
      <div className="space-y-3">
        <ActionCard
          tile={<Tile src={whatsappLogo} />}
          title="WhatsApp por código QR"
          text={
            linked
              ? `Ligado ao +${settings["phone"]}. As automações já enviam por este número.`
              : "O seu número, ligado em segundos, como no WhatsApp Web."
          }
          action={
            linked ? (
              <>
                <StatusPill status={{ label: "Ligado", tone: "on" }} />
                <Button variant="outline" onClick={() => setQrOpen(true)}>
                  Ver ligação
                </Button>
              </>
            ) : (
              <ConnectButton onClick={startQr} disabled={busy}>
                Conectar
              </ConnectButton>
            )
          }
        />
        <ActionCard
          tile={<Tile src={whatsappLogo} />}
          title="API oficial do WhatsApp Business"
          text="Meta: número verificado e modelos de mensagem aprovados."
          action={
            <>
              {officialSaved && <StatusPill status={{ label: "Guardada", tone: "warn" }} />}
              <Button variant="outline" onClick={onOfficial}>
                Configurar
              </Button>
            </>
          }
        />
      </div>

      <Overview>
        <p>
          As automações enviam pelo número ligado: ao contacto (WhatsApp individual) e aos grupos
          onde o número está, procurados pelo nome escrito no passo.
        </p>
        <p>Entre as 22h e as 8h, as mensagens ao contacto esperam pela manhã.</p>
        <p className="text-muted-foreground">
          Código QR: use um número dedicado ao negócio e não envie em massa a quem não pediu; o
          WhatsApp pode bloquear o número. A API oficial não tem esse risco, mas só envia modelos
          aprovados pela Meta.
        </p>
        <CountryCode row={row} organizationId={organizationId} />
      </Overview>

      {qrOpen && <QrDialog organizationId={organizationId} onClose={() => setQrOpen(false)} />}
    </>
  );
}

/** Indicativo para os números guardados sem "+", usado nas mensagens ao contacto. */
function CountryCode({
  row,
  organizationId,
}: {
  row: IntegrationRow | undefined;
  organizationId: string;
}) {
  const invalidate = useInvalidate();
  const saved = settingsOf(row)["country_code"] || DEFAULT_COUNTRY_CODE;
  const [value, setValue] = useState(saved);
  const valid = /^\d{1,4}$/.test(value.trim());

  const save = async () => {
    try {
      const id = row?.id ?? (await connectIntegration(organizationId, "whatsapp", "")).id;
      await updateIntegration(id, { settings: { ...settingsOf(row), country_code: value.trim() } });
      toast.success("Indicativo guardado.");
      invalidate(["integrations"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    }
  };

  return (
    <div className="border-t pt-4">
      <Label htmlFor="wa-country">Indicativo dos números sem +</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          id="wa-country"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24"
        />
        <Button variant="outline" disabled={!valid || value.trim() === saved} onClick={save}>
          Guardar
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Quem se inscreveu com 923 456 789 recebe no +{value.trim() || "…"} 923 456 789.
      </p>
    </div>
  );
}

/** O código QR num pop-up por cima, como nas referências; renova-se até o telemóvel ligar. */
function QrDialog({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const invalidate = useInvalidate();
  const session = useQuery({
    queryKey: ["whatsapp-session", organizationId],
    queryFn: () => whatsappSession({ data: { organizationId } }),
    refetchInterval: (q) =>
      ["WORKING", "NO_SERVER"].includes(q.state.data?.status ?? "") ? false : 3000,
    retry: false,
  });
  const data = session.data;
  const phone = data?.status === "WORKING" ? data.phone : null;
  useEffect(() => {
    if (data?.status === "WORKING") invalidate(["integrations"]);
  }, [data?.status, invalidate]);

  let body: ReactNode = "A preparar o código…";
  if (session.error) body = <span className="text-destructive">{session.error.message}</span>;
  else if (data?.status === "NO_SERVER")
    body = "O servidor de WhatsApp (WAHA) ainda não está ligado à plataforma.";
  else if (data?.status === "WORKING")
    body = (
      <span className="flex flex-col items-center gap-2 text-success">
        <span className="flex size-14 items-center justify-center rounded-full bg-success-soft">
          <Check className="size-7" aria-hidden />
        </span>
        Ligado{phone ? ` ao +${phone}` : ""}
      </span>
    );
  else if (data?.status === "SCAN_QR_CODE" && data.qr)
    body = (
      <img
        src={data.qr}
        alt="Código QR para ligar o WhatsApp"
        className="size-full object-contain"
      />
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 p-8 text-center sm:p-8">
        <div className="mx-auto flex size-60 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-card)] bg-white p-3 text-sm text-muted-foreground">
          {body}
        </div>
        <DialogTitle className="mt-6 text-xl font-semibold">
          {phone !== null || data?.status === "WORKING"
            ? "WhatsApp ligado"
            : "Continue a configuração no WhatsApp"}
        </DialogTitle>
        <DialogDescription className="mt-1.5">
          {data?.status === "WORKING"
            ? "As automações já enviam por este número."
            : "No telemóvel: WhatsApp › Aparelhos ligados › Ligar um aparelho, e aponte a câmara ao código."}
        </DialogDescription>
        <Button variant="dark" className="mt-7 h-11 w-full" onClick={onClose}>
          {data?.status === "WORKING" ? "Concluir" : "Fechar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** API oficial da Meta: os dados ficam guardados para quando houver modelos aprovados. */
function WhatsappOfficial({
  row,
  organizationId,
  onBack,
}: {
  row: IntegrationRow | undefined;
  organizationId: string;
  onBack: () => void;
}) {
  const invalidate = useInvalidate();
  const settings = settingsOf(row);
  const [phoneId, setPhoneId] = useState(settings["phone_number_id"] ?? "");
  const [wabaId, setWabaId] = useState(settings["waba_id"] ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = whatsappReady(row);

  const tokenOk = token.trim().length >= 20 || (token === "" && Boolean(row?.has_secret));
  const valid = /^\d{6,20}$/.test(phoneId.trim()) && /^\d{6,20}$/.test(wabaId.trim()) && tokenOk;

  const save = async () => {
    setBusy(true);
    try {
      const next = {
        ...settings,
        phone_number_id: phoneId.trim(),
        waba_id: wabaId.trim(),
        // Um número já ligado por código QR continua a enviar até a oficial ter modelos.
        mode: linked ? "unofficial" : "official",
      };
      const secret = token.trim() || undefined;
      if (row) await updateIntegration(row.id, { settings: next, ...(secret ? { secret } : {}) });
      else {
        const created = await connectIntegration(organizationId, "whatsapp", secret ?? "");
        await updateIntegration(created.id, { settings: next });
      }
      toast.success("Ligação oficial guardada.");
      setToken("");
      invalidate(["integrations"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PaneHeader title="API oficial do WhatsApp Business" onBack={onBack} />
      <div>
        <ActionCard
          tile={<Tile src={whatsappLogo} />}
          title="WhatsApp Business (Meta)"
          text="Número verificado e modelos de mensagem aprovados."
          action={
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Abrir Meta for Developers <ExternalLink className="size-3.5" aria-hidden />
            </a>
          }
        />
      </div>
      <Overview>
        <div className="space-y-1.5">
          <Label htmlFor="wa-phone">ID do número de telefone</Label>
          <Input
            id="wa-phone"
            inputMode="numeric"
            value={phoneId}
            onChange={(e) => setPhoneId(e.target.value)}
            placeholder="Ex.: 109876543210987"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-waba">ID da conta do WhatsApp Business</Label>
          <Input
            id="wa-waba"
            inputMode="numeric"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="Ex.: 123456789012345"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-token">Token de acesso permanente</Label>
          <Input
            id="wa-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={row?.has_secret ? "Guardado. Escreva para substituir." : "EAAG…"}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Estão em Meta for Developers › a sua app › WhatsApp › Configuração da API. O token
          permanente cria-se num utilizador de sistema do Gestor de Negócios.
        </p>
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
          Pela API oficial, as mensagens das automações só saem com modelos aprovados pela Meta;
          esse passo vem a seguir. Até lá, as automações enviam pelo número ligado por código QR.
        </p>
        <Button variant="dark" className="h-11 w-full" disabled={busy || !valid} onClick={save}>
          Guardar
        </Button>
      </Overview>
    </>
  );
}

/* ---------- Email e SMS: ainda sem fornecedor ---------- */

function ChannelSoon({
  section,
  isTest,
  onWebhook,
}: {
  section: Section;
  isTest: boolean;
  onWebhook: () => void;
}) {
  const channel = section.id as "email" | "sms";
  return (
    <>
      <PaneHeader title={section.label} subtitle={section.subtitle} />
      <div>
        <ActionCard
          tile={<Tile {...CHANNEL_TILE[channel]} />}
          title={section.label}
          text={
            isTest
              ? "Conta de teste: os envios são simulados."
              : "Ainda sem fornecedor na plataforma."
          }
          action={
            <Button variant="outline" disabled>
              Em breve
            </Button>
          }
        />
      </div>
      <Overview>
        <p>
          Até haver fornecedor, um passo de {section.label} pode seguir pelo webhook para a sua
          ferramenta (Zapier, Make, n8n ou o seu CRM), com a pessoa, o webinar e a mensagem.
        </p>
        <Button variant="outline" onClick={onWebhook}>
          Abrir API e webhooks
        </Button>
      </Overview>
    </>
  );
}

/* ---------- Actividade ---------- */

function Activity({ events }: { events: Events }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Webhook}
        title="Ainda não chegou nada"
        description="Quando uma plataforma enviar uma venda ou um teste, aparece aqui com o estado e, se for recusado, o motivo."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            {["Quando", "Plataforma", "Estado", "Comprador", "Valor"].map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const st = EVENT_STATUS[e.status] ?? { label: e.status, variant: "secondary" as const };
            const info = providerInfo(e.provider);
            return (
              <tr key={e.id} className="border-t align-top">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatDateTime(e.received_at)}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    {info && <ProviderTile id={info.id} className="size-6" />}
                    {info?.name ?? e.provider}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={st.variant} title={e.reason ?? undefined}>
                    {st.label}
                  </Badge>
                </td>
                <td className="max-w-[200px] truncate px-4 py-3">{e.buyer_email ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                  {money(e.amount_value, e.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
