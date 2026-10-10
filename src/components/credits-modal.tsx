/**
 * Créditos num pop-up, na mesma moldura das Integrações (#creditos/secção): quanto há,
 * onde se gasta e quanto custa, o plano, carregar e histórico. Abre-se pelo menu em
 * qualquer página. As colunas seguem a largura do conteúdo (@container), não a do ecrã.
 */
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  AudioLines,
  BellRing,
  Check,
  CirclePlus,
  Clock,
  CreditCard,
  ExternalLink,
  Gauge,
  Gift,
  History,
  Hourglass,
  Image as ImageIcon,
  Landmark,
  Layers,
  ListChecks,
  Mail,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Receipt,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  WalletMinimal,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { NavTabs } from "@/components/ds/navigation";
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
import { SettingsModal } from "@/components/settings-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTION_LABEL,
  ACTION_UNIT,
  ALWAYS_FREE,
  formatUsd,
  KIND_LABEL,
  LEDGER_LIMIT,
  ledgerCutInMonth,
  MICROS_PER_USD,
  monthStartUtc,
  PLANS,
  planLabel,
  runwayDays,
  spendByAction,
  type BilledAction,
  type CreditState,
  type PublicPrices,
} from "@/lib/credits";
import { getAiPricing } from "@/lib/credits.functions";
import { whatsappLink } from "@/lib/contacts";
import {
  formatDateTime,
  useBillingProducts,
  useCreditLedger,
  useCreditState,
  useInvalidate,
  useMonthRevenue,
  useWorkspace,
  type Workspace,
} from "@/lib/data";
import { useCreditsRoute } from "@/lib/modal-route";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    id: "resumo",
    label: "Resumo",
    icon: WalletMinimal,
    subtitle: "Quanto tem, quanto gastou e o que rendeu este mês.",
  },
  {
    id: "consumo",
    label: "Consumo",
    title: "Consumo e preços",
    icon: Receipt,
    subtitle: "Onde se gasta cada crédito e quanto custa.",
  },
  {
    id: "plano",
    label: "Plano",
    icon: Layers,
    subtitle: "Os créditos que o plano inclui todos os meses.",
  },
  {
    id: "carregar",
    label: "Carregar",
    title: "Carregar créditos",
    icon: CirclePlus,
    subtitle: "Pague na Kambafy. Os créditos carregados nunca expiram.",
  },
  {
    id: "historico",
    label: "Histórico",
    icon: History,
    subtitle: "Cada entrada e cada gasto, do mais recente.",
  },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export type LedgerRow = NonNullable<ReturnType<typeof useCreditLedger>["data"]>[number];
export type Product = NonNullable<ReturnType<typeof useBillingProducts>["data"]>[number];
type Sale = { amount_value: number | null; currency: string | null };
type Meta = {
  calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  images?: number;
  transcribed_minutes?: number;
};

/**
 * Para onde vai o pedido de créditos (ou de outro plano) enquanto não há pagamento
 * ligado. Sem nenhum, aparece «por ligar» em vez de um botão sem saída.
 * `plansUrl` é a ligação de pagamento dos planos, para ligar depois (VITE_PLANS_URL).
 */
const SUPPORT = {
  whatsapp: (import.meta.env["VITE_SUPPORT_WHATSAPP"] as string | undefined)?.trim() ?? "",
  email: (import.meta.env["VITE_SUPPORT_EMAIL"] as string | undefined)?.trim() ?? "",
  plansUrl: (import.meta.env["VITE_PLANS_URL"] as string | undefined)?.trim() ?? "",
};
type Support = { whatsapp: string; email: string; plansUrl?: string };

/** Ícones de traço fino, sem «cara de IA»: o que a acção faz. */
const ACTION_ICON: Record<BilledAction, LucideIcon> = {
  agent_reply: MessagesSquare,
  chat_generation: MessageSquareText,
  webinar_analysis: ScanSearch,
  agent_content: ListChecks,
  sale_notifications: BellRing,
  image: ImageIcon,
  transcription: AudioLines,
};
const actionIcon = (action: string) => ACTION_ICON[action as BilledAction] ?? Receipt;

/** Aberto pelo endereço (#creditos/secção): o X fecha-o. */
export default function CreditsRouteModal() {
  const { section, go } = useCreditsRoute();
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const state = useCreditState(orgId);
  const { data: ledger = [] } = useCreditLedger(orgId);
  const { data: revenue = [] } = useMonthRevenue(orgId);
  const products = useBillingProducts();
  const fetchPricing = useServerFn(getAiPricing);
  const { data: pricing } = useQuery({
    queryKey: ["credits", "pricing"],
    queryFn: () => fetchPricing(),
  });
  // As Definições abrem por cima dos Créditos; o X delas volta aqui.
  const [settings, setSettings] = useState<string | null>(null);

  return (
    <>
      <CreditsDialog
        section={section}
        onSection={(id) => go([id])}
        onClose={() => go(null)}
        workspace={workspace}
        state={state.data}
        ledger={ledger}
        revenue={revenue}
        products={products.isLoading ? undefined : (products.data ?? [])}
        margin={pricing?.margin}
        prices={pricing}
        onProfile={() => setSettings("perfil")}
      />
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

/** O pop-up em si, só com dados por props (a página de verificação usa-o sem base de dados). */
export function CreditsDialog({
  section,
  onSection,
  onClose,
  workspace,
  state,
  ledger,
  revenue,
  products,
  margin,
  prices,
  onProfile,
  support = SUPPORT,
  now = Date.now(),
}: {
  section: string | undefined;
  onSection: (id: SectionId) => void;
  onClose: () => void;
  workspace: Workspace | null | undefined;
  state: CreditState | undefined;
  ledger: LedgerRow[];
  revenue: Sale[];
  /** undefined enquanto carrega. */
  products: Product[] | undefined;
  margin: number | undefined;
  /** Preços ao cliente; undefined enquanto carrega. */
  prices?: PublicPrices | undefined;
  onProfile: () => void;
  /** Contactos e ligação de pagamento (a página de verificação passa os seus). */
  support?: Support;
  now?: number;
}) {
  // Pagar na Kambafy, pedir à equipa (sem pacotes) ou ainda nada; a carregar conta como pagar.
  const topUp = products?.length !== 0 ? "pay" : support.whatsapp || support.email ? "ask" : "soon";
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const nav = (s: (typeof SECTIONS)[number]) => (
    <PanelNavButton
      key={s.id}
      icon={s.icon}
      label={s.label}
      active={s.id === current.id}
      onClick={() => onSection(s.id)}
    />
  );
  const loading = <Skeleton className="h-64 w-full" />;

  let content: ReactNode;
  if (current.id === "resumo") {
    content =
      !state || !workspace ? (
        loading
      ) : (
        <Summary
          state={state}
          ledger={ledger}
          revenue={revenue}
          topUp={topUp}
          now={now}
          onSection={onSection}
        />
      );
  } else if (current.id === "consumo") {
    content =
      !state || !workspace ? (
        loading
      ) : (
        <Usage
          ledger={ledger}
          prices={prices}
          margin={margin ?? prices?.margin}
          state={state}
          organizationId={workspace.organizationId}
          now={now}
        />
      );
  } else if (current.id === "plano") {
    content = !state ? (
      loading
    ) : (
      <Plan
        state={state}
        margin={margin ?? prices?.margin}
        workspace={workspace}
        support={support}
        now={now}
      />
    );
  } else if (current.id === "carregar") {
    content = <TopUp products={products} workspace={workspace} support={support} />;
  } else {
    content = <Ledger rows={ledger} />;
  }

  return (
    <PanelDialog
      title="Créditos"
      description="Créditos de IA: quanto há, onde se gasta, plano, carregar e histórico."
      onClose={onClose}
      sidebar={
        <>
          <div>
            <PanelTitle>Créditos</PanelTitle>
            {state && (
              <p className="mt-1 px-3 text-[13px] text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">
                  {formatUsd(state.balance_micros)}
                </span>{" "}
                disponíveis
              </p>
            )}
          </div>
          <PanelNavGroup>{SECTIONS.map(nav)}</PanelNavGroup>
          {workspace && (
            <PanelNavFooter>
              <PanelProfile workspace={workspace} onClick={onProfile} />
            </PanelNavFooter>
          )}
        </>
      }
      mobileNav={SECTIONS.map(nav)}
      mobileTitle={
        <>
          Créditos
          {state && (
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              · {formatUsd(state.balance_micros)}
            </span>
          )}
        </>
      }
    >
      <PaneHeader
        title={"title" in current ? current.title : current.label}
        subtitle={
          // Sem pacotes não se paga na Kambafy: fica só o que vale sempre.
          current.id === "carregar" && topUp !== "pay"
            ? "Os créditos carregados nunca expiram."
            : current.subtitle
        }
      />
      <div className="@container">{content}</div>
    </PanelDialog>
  );
}

/* ---------- Peças ---------- */

const TONES = {
  brand: "bg-tint-brand text-tint-brand-ink",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  muted: "bg-gray-100 text-gray-700",
} as const;

/** O mosaico de cor com o ícone, como os das Integrações. */
function Tile({
  icon: Icon,
  tone,
  className = "size-10",
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-lg", TONES[tone], className)}
    >
      <Icon className="size-1/2" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function nextRenewal(now: number) {
  const d = new Date(now);
  return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long" }).format(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
  );
}

/**
 * Um indicador. Estreito: uma linha (rótulo e nota à esquerda, valor à direita);
 * a partir de ~670 px de conteúdo, cartões lado a lado.
 */
function Stat({
  label,
  value,
  note,
  bar,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  bar?: number | null | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hairline bg-white p-4 @2xl:flex-col @2xl:flex-nowrap @2xl:items-stretch @2xl:gap-1">
      <div className="min-w-0 flex-1 @2xl:flex-none">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <div className="text-[12px] text-muted-foreground @2xl:hidden">{note}</div>
      </div>
      <div className="shrink-0 text-right text-lg font-semibold tracking-[-0.02em] tabular-nums @2xl:text-left @2xl:text-xl">
        {value}
      </div>
      <div className="hidden text-[12px] text-muted-foreground @2xl:block">{note}</div>
      {bar != null && (
        // O medidor diz o estado pela cor: a marca até 80%, aviso a partir daí, erro no limite.
        <div className="h-1.5 w-full rounded-full bg-chart-track @2xl:mt-1" aria-hidden>
          <div
            className={cn("h-full rounded-full", bar >= 100 ? "bg-destructive" : bar >= 80 ? "bg-warning" : "bg-chart-1")}
            style={{ width: `${Math.max(bar, 2)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Summary({
  state,
  ledger,
  revenue,
  topUp,
  now,
  onSection,
}: {
  state: CreditState;
  ledger: LedgerRow[];
  revenue: Sale[];
  topUp: "pay" | "ask" | "soon";
  now: number;
  onSection: (id: SectionId) => void;
}) {
  const balance = state.balance_micros;
  // Em cêntimos, para as duas partes somarem o saldo que se vê (7,97 + 11,10 = 19,07).
  const cents = (m: number) => Math.round(m / 10_000) * 10_000;
  const planLeft = cents(Math.min(state.plan_remaining_micros, Math.max(0, balance)));
  const kept = Math.max(0, cents(balance) - planLeft);
  const spent = state.month_spent_micros;
  const capPct = state.cap_micros
    ? Math.min(100, Math.round((spent / state.cap_micros) * 100))
    : null;
  const warning =
    balance <= 0
      ? "Os créditos acabaram. O agente passa as conversas para a equipa e a IA pára até carregar."
      : capPct !== null && capPct >= 80
        ? `Já usou ${capPct}% do limite mensal que definiu.`
        : balance < MICROS_PER_USD
          ? "Menos de 1 US$ em créditos: carregue para a IA não parar a meio de um webinar."
          : null;
  const runway = runwayDays(balance, spent, now);
  const runs = spendByAction(ledger, monthStartUtc(now)).reduce((n, a) => n + a.runs, 0);
  // Só se lêem os últimos movimentos: se não chegam ao dia 1, a contagem é um mínimo.
  const cut = ledgerCutInMonth(ledger, now);

  const sales = new Map<string, { total: number; count: number }>();
  for (const s of revenue) {
    const cur = s.currency ?? "—";
    const acc = sales.get(cur) ?? { total: 0, count: 0 };
    acc.total += Number(s.amount_value ?? 0);
    acc.count += 1;
    sales.set(cur, acc);
  }
  const salesCount = [...sales.values()].reduce((n, s) => n + s.count, 0);
  const usdSales = sales.get("USD")?.total ?? 0;

  return (
    <div className="space-y-7">
      <div className="overflow-hidden rounded-xl border border-hairline bg-white">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted-foreground">Créditos disponíveis</p>
              <p className="text-[34px] leading-tight font-semibold tracking-[-0.03em] tabular-nums">
                {formatUsd(balance)}
              </p>
            </div>
            {topUp === "soon" ? (
              // Ainda não há como carregar: um aviso, não um botão sem saída.
              <p className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 text-[14px] font-medium text-gray-800 @md:w-auto">
                <Clock className="size-4 text-gray-700" aria-hidden /> Carregamento em breve
              </p>
            ) : (
              <Button
                variant="dark"
                size="lg"
                onClick={() => onSection("carregar")}
                className="w-full @md:w-auto"
              >
                <CirclePlus /> {topUp === "ask" ? "Pedir créditos" : "Carregar créditos"}
              </Button>
            )}
          </div>

          {state.plan_allowance_micros > 0 ? (
            // De que é feito o saldo: o do plano gasta-se primeiro e acaba no fim do mês.
            balance > 0 && (
              <div className="space-y-2">
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="rounded-full bg-chart-1" style={{ width: `${(planLeft / balance) * 100}%` }} />
                  <div className="rounded-full bg-chart-2" style={{ width: `${(kept / balance) * 100}%` }} />
                </div>
                <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground @xl:flex-row @xl:gap-6">
                  <li className="flex items-start gap-2">
                    <span className="mt-[5px] size-2 shrink-0 rounded-full bg-chart-1" aria-hidden />
                    <span>
                      <strong className="font-medium text-foreground tabular-nums">
                        {formatUsd(planLeft)}
                      </strong>{" "}
                      do plano · renova a {nextRenewal(now)}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span
                      className="mt-[5px] size-2 shrink-0 rounded-full bg-chart-2"
                      aria-hidden
                    />
                    <span>
                      <strong className="font-medium text-foreground tabular-nums">
                        {formatUsd(kept)}
                      </strong>{" "}
                      carregados · não expiram
                    </span>
                  </li>
                </ul>
              </div>
            )
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Não expiram.{" "}
              <button
                type="button"
                onClick={() => onSection("plano")}
                className="cursor-pointer font-medium text-foreground underline-offset-2 hover:underline"
              >
                O seu plano não inclui créditos mensais.
              </button>
            </p>
          )}

          {runway !== null && (
            <p className="flex items-center gap-2 text-[13px] text-gray-800">
              <Hourglass className="size-4 shrink-0 text-gray-600" aria-hidden />
              {runway > 365
                ? "Ao ritmo deste mês, o saldo dá para mais de um ano."
                : `Ao ritmo deste mês, o saldo dá para cerca de ${runway} ${runway === 1 ? "dia" : "dias"}.`}
            </p>
          )}
        </div>
        {warning && (
          <p
            role="alert"
            className="flex items-start gap-2 border-t border-warning/30 bg-warning-soft px-5 py-3 text-[13px] text-warning"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {warning}
          </p>
        )}
      </div>

      <section>
        <h3 className="mb-3 text-[15px] font-medium text-foreground">Este mês</h3>
        <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-3 @2xl:gap-3">
          <Stat
            label="Gasto com IA"
            value={formatUsd(spent)}
            note={
              state.cap_micros
                ? `${capPct}% do limite de ${formatUsd(state.cap_micros)}`
                : "Sem limite mensal"
            }
            bar={capPct}
          />
          <Stat
            label="Acções de IA cobradas"
            value={cut ? `${runs}+` : runs}
            note={
              runs ? (
                <button
                  type="button"
                  onClick={() => onSection("consumo")}
                  className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                >
                  Ver onde se gastou
                </button>
              ) : (
                "Ainda nenhuma"
              )
            }
          />
          <Stat
            label="Vendas aprovadas"
            value={
              sales.size === 0 ? (
                "—"
              ) : (
                <span className="flex flex-col">
                  {[...sales].map(([currency, s]) => (
                    <span key={currency} className="truncate">
                      {money(s.total, currency)}
                    </span>
                  ))}
                </span>
              )
            }
            note={
              sales.size === 0
                ? "Sem vendas registadas"
                : `${salesCount} ${salesCount === 1 ? "venda" : "vendas"}`
            }
          />
        </div>
        {usdSales > 0 && spent > 0 && (
          <p className="mt-3 text-[13px] text-gray-800">
            Cada dólar de IA acompanhou{" "}
            <strong className="tabular-nums text-foreground">
              {money(usdSales / (spent / MICROS_PER_USD), "USD")}
            </strong>{" "}
            em vendas.
          </p>
        )}
      </section>
    </div>
  );
}

/** O preço de uma acção, por baixo do nome: unitário, média real, ou o que falta. */
function priceOf(
  action: BilledAction,
  prices: PublicPrices | undefined,
  average: number | undefined,
): { text: string; muted?: boolean } {
  if (!prices) return { text: "A carregar o preço…", muted: true };
  const unset = { text: "Preço a definir", muted: true };
  if (action === "image") {
    return prices.imageMicros === null
      ? unset
      : { text: `${formatUsd(prices.imageMicros)} ${ACTION_UNIT.image}` };
  }
  if (action === "transcription") {
    return prices.transcriptionHourMicros === null
      ? unset
      : { text: `${formatUsd(prices.transcriptionHourMicros)} ${ACTION_UNIT.transcription}` };
  }
  if (!prices.text) return unset;
  return average === undefined
    ? { text: "Custo real de cada vez", muted: true }
    : { text: `≈ ${formatUsd(average)} ${ACTION_UNIT[action]}` };
}

function Usage({
  ledger,
  prices,
  margin,
  state,
  organizationId,
  now,
}: {
  ledger: LedgerRow[];
  prices: PublicPrices | undefined;
  margin: number | undefined;
  state: CreditState;
  organizationId: string;
  now: number;
}) {
  const month = new Map(spendByAction(ledger, monthStartUtc(now)).map((a) => [a.action, a]));
  const monthTotal = [...month.values()].reduce((n, a) => n + a.micros, 0);
  const allTime = new Map(spendByAction(ledger).map((a) => [a.action, a]));
  // As que gastaram este mês primeiro, da maior para a menor; depois as outras.
  const actions = (Object.keys(ACTION_LABEL) as BilledAction[]).sort(
    (x, y) => (month.get(y)?.micros ?? 0) - (month.get(x)?.micros ?? 0),
  );

  return (
    <div className="space-y-7">
      <PanelSection title="Preço e gasto deste mês, por acção">
        <ul className="-my-1 divide-y divide-hairline">
          {actions.map((action) => {
            const used = allTime.get(action);
            const spent = month.get(action);
            const price = priceOf(
              action,
              prices,
              used ? Math.round(used.micros / used.runs) : undefined,
            );
            const share = spent && monthTotal ? (spent.micros / monthTotal) * 100 : 0;
            return (
              <li key={action} className="flex gap-3 py-3">
                <Tile icon={ACTION_ICON[action]} tone="brand" className="size-9" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">
                        {ACTION_LABEL[action]}
                      </span>
                      <span
                        className={cn(
                          "block text-[12px]",
                          price.muted ? "text-gray-600" : "text-gray-800",
                        )}
                      >
                        {price.text}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={cn(
                          "block font-semibold tabular-nums",
                          spent ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {spent ? (
                          formatUsd(spent.micros)
                        ) : (
                          <span aria-label="Sem uso este mês">—</span>
                        )}
                      </span>
                      {spent && (
                        <span className="block text-[12px] text-muted-foreground tabular-nums">
                          {share < 1 ? "<1" : Math.round(share)}% · {spent.runs}{" "}
                          {spent.runs === 1 ? "vez" : "vezes"}
                        </span>
                      )}
                    </span>
                  </span>
                  {spent && (
                    <span className="block h-1.5 rounded-full bg-chart-track" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-chart-1"
                        style={{ width: `${Math.max(share, 2)}%` }}
                      />
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {ledgerCutInMonth(ledger, now) && (
          <p className="text-[12px] text-muted-foreground">
            Por acção, contam os últimos {LEDGER_LIMIT} movimentos; o gasto total do mês, {formatUsd(state.month_spent_micros)}, está no Resumo.
          </p>
        )}
        <p className="flex gap-2.5 rounded-lg bg-gray-100 px-3 py-2.5 text-[13px] text-gray-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            Paga o custo real do fornecedor de IA
            {margin !== undefined ? ` mais ${Math.round(margin * 100)}%` : " mais uma margem fixa"}.
            Respostas e gerações variam com o tamanho do texto: o «≈» é a média das suas. Se a IA
            falhar, não paga.
          </span>
        </p>
      </PanelSection>

      <PanelSection title="Nunca gasta créditos">
        <ul className="grid grid-cols-1 gap-2.5 @xl:grid-cols-2">
          {ALWAYS_FREE.map((f) => (
            <li key={f} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection title="Limite mensal">
        <CapForm organizationId={organizationId} capMicros={state.cap_micros} />
      </PanelSection>
    </div>
  );
}

function CapForm({
  organizationId,
  capMicros,
}: {
  organizationId: string;
  capMicros: number | null;
}) {
  const invalidate = useInvalidate();
  const [value, setValue] = useState(capMicros ? String(capMicros / MICROS_PER_USD) : "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const usd = value.trim() ? Number(value.replace(",", ".")) : null;
    if (usd !== null && (!Number.isFinite(usd) || usd <= 0)) {
      toast.error(
        "Indique um valor em dólares maior que zero, ou deixe vazio para não ter limite.",
      );
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("organizations")
      .update({ ai_monthly_cap_micros: usd === null ? null : Math.round(usd * MICROS_PER_USD) })
      .eq("id", organizationId);
    setBusy(false);
    if (error) {
      toast.error("Só o dono ou um administrador pode mudar o limite.");
      return;
    }
    toast.success(usd === null ? "Limite removido." : "Limite mensal guardado.");
    invalidate(["credits"]);
  };
  return (
    <div className="space-y-2">
      <Label htmlFor="ai-cap" className="flex items-center gap-2 text-foreground">
        <Gauge className="size-4 text-gray-700" aria-hidden /> Gasto máximo por mês (US$)
      </Label>
      <div className="flex gap-2">
        <Input
          id="ai-cap"
          inputMode="decimal"
          placeholder="Sem limite"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10"
        />
        <Button variant="dark" size="lg" onClick={save} disabled={busy}>
          Guardar
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Ao chegar ao limite, a IA pára até ao dia 1 e o agente passa as conversas para a equipa.
      </p>
    </div>
  );
}

/** Como se cobra, em quatro frases: o modelo inteiro. */
const howLines = (margin: number | undefined) => [
  "Os créditos do plano gastam-se primeiro, renovam no dia 1 e o que sobra no fim do mês expira.",
  "Os créditos carregados nunca expiram.",
  `Cada acção paga o custo real da IA${margin !== undefined ? ` mais ${Math.round(margin * 100)}%` : " mais uma margem fixa"}; se falhar, não paga.`,
  "O limite mensal trava o gasto quando quiser.",
];

function Plan({
  state,
  margin,
  workspace,
  support,
  now,
}: {
  state: CreditState;
  margin: number | undefined;
  workspace: Workspace | null | undefined;
  support: Support;
  now: number;
}) {
  const name = planLabel(state.plan);
  const message = [
    `Olá! Quero mudar de plano na Novawebinar (tenho o plano ${name}).`,
    workspace && `Conta: ${workspace.email}`,
    workspace && `Organização: ${workspace.organizationName}`,
  ]
    .filter(Boolean)
    .join("\n");
  const whatsapp = whatsappLink(support.whatsapp, message);
  const email = support.email
    ? `mailto:${support.email}?subject=${encodeURIComponent("Mudar de plano")}&body=${encodeURIComponent(message)}`
    : null;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-hairline bg-white p-5">
        <Tile icon={Layers} tone="info" className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">O seu plano</p>
          <p className="text-xl font-semibold tracking-[-0.02em]">{name}</p>
          <p className="text-[13px] text-muted-foreground">
            {state.plan_allowance_micros > 0
              ? `Inclui ${formatUsd(state.plan_allowance_micros)} de créditos de IA por mês; renova a ${nextRenewal(now)}.`
              : "Não inclui créditos mensais: a IA gasta só o que carregar."}
          </p>
        </div>
      </div>

      <PanelSection title="Planos com créditos incluídos">
        <ul className="-my-1 divide-y divide-hairline">
          {PLANS.map((p) => {
            const mine = p.id === state.plan;
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    {p.label}
                    {mine && (
                      <span className="rounded-sm bg-gray-150 px-1.5 py-0.5 text-xs font-medium text-gray-800">
                        Actual
                      </span>
                    )}
                  </span>
                  <span className="text-[12px] text-muted-foreground">Créditos de IA por mês</span>
                </span>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
                  {formatUsd(p.allowanceMicros)}
                </span>
              </li>
            );
          })}
        </ul>
        {support.plansUrl ? (
          <Button asChild size="lg" variant="dark" className="w-full @md:w-auto">
            <a href={support.plansUrl} target="_blank" rel="noopener noreferrer">
              Mudar de plano <ExternalLink />
            </a>
          </Button>
        ) : whatsapp || email ? (
          <div className="flex flex-col gap-2 @md:flex-row">
            {whatsapp && (
              <Button asChild size="lg" variant="dark" className="w-full @md:w-auto">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle /> Mudar de plano por WhatsApp
                </a>
              </Button>
            )}
            {email && (
              <Button
                asChild
                size="lg"
                variant={whatsapp ? "outline" : "dark"}
                className="w-full @md:w-auto"
              >
                <a href={email}>
                  <Mail /> Pedir por email
                </a>
              </Button>
            )}
          </div>
        ) : (
          // A ligação de pagamento dos planos ainda não existe: diz-se, sem botão morto.
          <p className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2.5 text-[13px] text-gray-800">
            <Clock className="size-4 shrink-0 text-gray-700" aria-hidden />
            Pagamento dos planos por ligar. Quando estiver ligado, muda de plano aqui.
          </p>
        )}
      </PanelSection>

      <PanelSection title="Como se cobra">
        <ul className="space-y-2.5">
          {howLines(margin).map((line) => (
            <li key={line} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </PanelSection>
    </div>
  );
}

const PAY_WITH: { icon: LucideIcon; label: string }[] = [
  { icon: Smartphone, label: "Multicaixa Express" },
  { icon: Landmark, label: "Referência" },
  { icon: CreditCard, label: "Cartão" },
];

const AMOUNTS = [10, 25, 50, 100];

function TopUp({
  products,
  workspace,
  support,
}: {
  products: Product[] | undefined;
  workspace: Workspace | null | undefined;
  support: Support;
}) {
  const email = workspace?.email ?? "";
  if (!products) return <Skeleton className="h-32 w-full" />;
  if (products.length === 0) return <AskTopUp workspace={workspace} support={support} />;
  return (
    <div className="space-y-7">
      <p className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-[13px] text-foreground">
        <Mail className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <span>
          Pague com o email <strong className="break-all">{email || "da sua conta"}</strong>: é por
          ele que os créditos entram nesta conta.
        </span>
      </p>

      <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
        {products.map((p, i) => (
          <li key={p.id}>
            <a
              href={p.checkout_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full items-center gap-3.5 rounded-xl border border-hairline bg-white p-4 transition-shadow hover:shadow-[var(--shadow-raised)] focus-visible:outline-none focus-visible:ring-focus"
            >
              <Tile icon={CirclePlus} tone={i === 0 ? "brand" : "success"} className="size-11" />
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-semibold tracking-[-0.02em] tabular-nums">
                  {money(Number(p.usd_amount), "USD")}
                </span>
                <span className="block text-[13px] leading-snug text-muted-foreground">
                  {p.label}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-navy px-3 py-2 text-[13px] font-medium text-white">
                Pagar <ExternalLink className="size-3.5" aria-hidden />
              </span>
            </a>
          </li>
        ))}
      </ul>

      <PanelSection title="Formas de pagamento">
        <ul className="grid grid-cols-1 gap-2 @lg:grid-cols-3">
          {PAY_WITH.map((p) => (
            <li key={p.label} className="flex items-center gap-2.5">
              <Tile icon={p.icon} tone="muted" className="size-9" />
              <span className="font-medium text-foreground">{p.label}</span>
            </li>
          ))}
        </ul>
      </PanelSection>
    </div>
  );
}

/**
 * Sem pacotes à venda: escolhe-se o valor e o pedido segue por WhatsApp ou email, já
 * escrito, para a equipa carregar. Sem contacto configurado, diz só que vem a caminho.
 */
function AskTopUp({
  workspace,
  support,
}: {
  workspace: Workspace | null | undefined;
  support: Support;
}) {
  const [amount, setAmount] = useState(25);
  const message = [
    `Olá! Quero carregar ${amount} US$ em créditos na Novawebinar.`,
    workspace && `Conta: ${workspace.email}`,
    workspace && `Organização: ${workspace.organizationName}`,
  ]
    .filter(Boolean)
    .join("\n");
  const whatsapp = whatsappLink(support.whatsapp, message);
  const email = support.email
    ? `mailto:${support.email}?subject=${encodeURIComponent("Carregar créditos")}&body=${encodeURIComponent(message)}`
    : null;

  if (!whatsapp && !email) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-hairline bg-white px-6 py-8 text-center">
        <Tile icon={WalletMinimal} tone="brand" className="size-14" />
        <p className="text-[15px] font-semibold">Pacotes a caminho</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Ainda não há pacotes de créditos à venda. Quando o pagamento estiver ligado, aparecem aqui
          com o preço e o botão para pagar.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5 rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center gap-3">
        <Tile icon={WalletMinimal} tone="brand" className="size-11" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Peça os créditos à equipa</p>
          <p className="text-[13px] text-muted-foreground">
            Escolha o valor. Nós carregamos na sua conta.
          </p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Valor" className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        {AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === amount}
            onClick={() => setAmount(value)}
            className={cn(
              "h-12 cursor-pointer rounded-lg border text-[15px] font-semibold tabular-nums transition-colors",
              value === amount
                ? "border-brand bg-accent text-accent-700"
                : "border-hairline bg-white text-foreground hover:bg-[var(--hover-ghost)]",
            )}
          >
            {value} US$
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 @md:flex-row">
        {whatsapp && (
          <Button asChild size="lg" variant="dark" className="w-full @md:w-auto">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> Pedir por WhatsApp
            </a>
          </Button>
        )}
        {email && (
          <Button
            asChild
            size="lg"
            variant={whatsapp ? "outline" : "dark"}
            className="w-full @md:w-auto"
          >
            <a href={email}>
              <Mail /> Pedir por email
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function detail(row: LedgerRow) {
  const m = (row.meta ?? {}) as Meta;
  const parts: string[] = [];
  if (m.calls) parts.push(`${m.calls} ${m.calls === 1 ? "chamada" : "chamadas"}`);
  const tokens = (m.input_tokens ?? 0) + (m.output_tokens ?? 0);
  if (tokens) parts.push(`${new Intl.NumberFormat("pt-PT").format(tokens)} tokens`);
  if (m.images) parts.push(`${m.images} ${m.images === 1 ? "imagem" : "imagens"}`);
  if (m.transcribed_minutes) parts.push(`${m.transcribed_minutes} min de áudio`);
  return parts.join(" · ");
}

/** O livro guarda «Saldo do plano (2026-10)»; a data já está por baixo. */
function rowTitle(r: LedgerRow) {
  if (r.kind === "grant" && r.action === "plan") return "Créditos do plano";
  if (r.kind === "expire") return "Créditos do plano que expiraram";
  return r.description || KIND_LABEL[r.kind] || r.kind;
}

function rowIcon(r: LedgerRow): { icon: LucideIcon; tone: keyof typeof TONES } {
  if (r.kind === "usage") return { icon: actionIcon(r.action), tone: "muted" };
  if (r.kind === "grant") return { icon: Gift, tone: "info" };
  if (r.kind === "purchase") return { icon: CirclePlus, tone: "success" };
  if (r.kind === "expire") return { icon: Hourglass, tone: "muted" };
  return r.amount_micros > 0
    ? { icon: ArrowDownLeft, tone: "success" }
    : { icon: ArrowUpRight, tone: "muted" };
}

const FILTERS = [
  { id: "all", label: "Tudo" },
  { id: "out", label: "Gastos" },
  { id: "in", label: "Entradas" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function Ledger({ rows }: { rows: LedgerRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-hairline bg-white px-6 py-10 text-center">
        <Tile icon={History} tone="muted" className="size-12" />
        <p className="text-[14px] text-muted-foreground">Ainda sem movimentos.</p>
      </div>
    );
  }
  const pick = (f: Filter) =>
    rows.filter((r) =>
      f === "all" ? true : f === "in" ? r.amount_micros > 0 : r.amount_micros <= 0,
    );
  const shown = pick(filter);

  // Um bloco por mês, com o que entrou e o que saiu (o livro já vem do mais recente).
  const months: {
    key: string;
    label: string;
    inMicros: number;
    outMicros: number;
    rows: LedgerRow[];
  }[] = [];
  const monthFmt = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" });
  for (const r of shown) {
    const key = r.created_at.slice(0, 7);
    let m = months.at(-1);
    if (m?.key !== key) {
      m = {
        key,
        label: monthFmt.format(new Date(r.created_at)),
        inMicros: 0,
        outMicros: 0,
        rows: [],
      };
      months.push(m);
    }
    m.rows.push(r);
    if (r.amount_micros > 0) m.inMicros += r.amount_micros;
    else m.outMicros += -r.amount_micros;
  }

  return (
    <div className="space-y-5">
      <NavTabs
        aria-label="Filtrar movimentos"
        items={FILTERS.map((f) => ({ ...f, count: pick(f.id).length }))}
        value={filter}
        onChange={setFilter}
      />
      {months.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-white px-5 py-8 text-center text-[14px] text-muted-foreground">
          {filter === "in" ? "Ainda sem entradas." : "Ainda sem gastos."}
        </p>
      ) : (
        months.map((m) => (
          <section key={m.key}>
            <h3 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 px-1 text-[13px]">
              <span className="font-medium text-foreground first-letter:uppercase">{m.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {[
                  m.inMicros > 0 && `+${formatUsd(m.inMicros)}`,
                  m.outMicros > 0 && formatUsd(-m.outMicros),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </h3>
            <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-white">
              {m.rows.map((r) => {
                const credit = r.amount_micros > 0;
                const { icon, tone } = rowIcon(r);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <Tile icon={icon} tone={tone} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px] font-medium">{rowTitle(r)}</span>
                      {/* O ícone e o sinal já dizem se é gasto ou entrada; só os acertos o dizem. */}
                      <span className="line-clamp-2 text-[12px] text-muted-foreground">
                        {[
                          formatDateTime(r.created_at),
                          (r.kind === "refund" || r.kind === "adjustment") && KIND_LABEL[r.kind],
                          detail(r),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[14px] font-semibold tabular-nums",
                        credit ? "text-success" : "text-foreground",
                      )}
                    >
                      {credit ? "+" : ""}
                      {formatUsd(r.amount_micros)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {rows.length >= LEDGER_LIMIT && (
        <p className="text-center text-[12px] text-muted-foreground">
          Mostram-se os últimos {LEDGER_LIMIT} movimentos; o mês mais antigo pode estar incompleto.
        </p>
      )}
    </div>
  );
}
