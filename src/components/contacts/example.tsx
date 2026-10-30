/**
 * Modo exemplo dos Contactos: cinco pessoas fictícias de três lançamentos, para
 * ver como fica. Tudo vive neste ecrã: nada é lido nem gravado na base de dados,
 * e cada nome leva a etiqueta «Exemplo».
 */
import { contactCountryOf } from "@/lib/contact-countries";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExampleBanner } from "@/components/support/inbox";
import { Button } from "@/components/ui/button";
import type { ContactSummary, JourneyStep, TimelineItem } from "@/lib/contacts";
import {
  contactFile,
  filterContacts,
  launchLabel,
  sourceRowsOf,
  stageCountsOf,
  type ContactFile,
  type OriginRow,
} from "@/lib/contacts-journey";
import type { CommercialContext, WebinarParticipation } from "@/lib/support/context";
import { intentLabel } from "@/lib/support/model";
import {
  ContactFileView,
  ContactList,
  ContactsFrame,
  GroupSummary,
  ListChips,
  ScopeNav,
  ScopePicker,
  type ContactsStep,
  type ScopeGroup,
} from "./contacts-view";

/* ---------- Dados ---------- */

const NOW = Date.now();
const H = 3_600_000;
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();

const LAUNCHES = {
  fd: { title: "Fórmula Digital", duration: 3900, offer: 2730 },
  tp: { title: "Tráfego Pago do Zero", duration: 3600, offer: 2700 },
  d5: { title: "Desafio 5 dias", duration: 3000, offer: 2250 },
} as const;
type LaunchId = keyof typeof LAUNCHES;
const TITLE = (id: string) => LAUNCHES[id as LaunchId]?.title;

const LISTS = [
  { id: "alunos", name: "Alunos 2025" },
  { id: "quentes", name: "Leads quentes" },
];
const SEGMENTS = [{ id: "clicaram", name: "Clicaram e não compraram", why: "clicou na oferta e não comprou" }];

type Spec = {
  webinar: LaunchId;
  hoursAgo: number;
  mode?: "live" | "replay";
  watched: number;
  peak?: number;
  entry?: number;
  reached?: boolean;
  clicked?: number;
  checkout?: boolean;
  failed?: boolean;
  purchased?: boolean;
  messages?: number;
  source?: string;
  campaign?: string;
  via?: string;
};

type Person = {
  contact: ContactSummary;
  launches: Spec[];
  purchases: CommercialContext["purchases"];
  cases: { intent: string; status: string; number: number; hoursAgo: number; preview: string }[];
  segments: string[];
  place: string;
  device: string;
};

function person(
  id: string,
  c: Partial<ContactSummary>,
  rest: Omit<Person, "contact" | "segments"> & { segments?: string[] },
): Person {
  const launches = rest.launches;
  return {
    ...rest,
    segments: rest.segments ?? [],
    contact: {
      id,
      organization_id: "exemplo",
      source: "registration",
      created_at: at(Math.max(...launches.map((l) => l.hoursAgo), 1) + 1),
      first_seen_at: null,
      last_seen_at: null,
      first_campaign: null,
      first_source: "direto",
      email: null,
      phone: null,
      name: null,
      list_ids: [],
      messages: launches.reduce((s, l) => s + (l.messages ?? 0), 0),
      events_registered: launches.length,
      events_attended: launches.filter((l) => l.watched >= 300).length,
      watched_seconds: launches.reduce((s, l) => s + l.watched, 0),
      reached_offer: launches.some((l) => l.reached),
      clicked_offer: launches.some((l) => l.clicked !== undefined),
      checkout_started: launches.some((l) => l.checkout),
      checkout_abandoned: false,
      payment_failed: launches.some((l) => l.failed),
      purchases: launches.filter((l) => l.purchased).length,
      webinar_ids: launches.map((l) => l.webinar),
      stage: "new",
      ...c,
    },
  };
}

const PEOPLE: Person[] = [
  person(
    "ex-ana",
    {
      name: "Ana Martins",
      email: "ana.martins@exemplo.ao",
      phone: "+244923000101",
      stage: "customer",
      first_source: "instagram",
      first_campaign: "fd-outubro",
      last_seen_at: at(2),
      list_ids: ["alunos"],
    },
    {
      launches: [
        { webinar: "fd", hoursAgo: 50, watched: 3420, peak: 3480, reached: true, clicked: 2810, checkout: true, purchased: true, messages: 2, source: "instagram", campaign: "fd-outubro" },
      ],
      purchases: [{ id: "b-ana", title: "Fórmula Digital · acesso vitalício", amount: "45 000 Kz", status: "approved", at: at(49) }],
      cases: [{ intent: "access", status: "resolved", number: 12, hoursAgo: 3, preview: "Já consegui entrar na área de membros, obrigada!" }],
      place: "Luanda, Angola",
      device: "mobile",
    },
  ),
  person(
    "ex-joao",
    {
      name: "João Baptista",
      email: "joao.baptista@exemplo.ao",
      phone: "+244912000202",
      stage: "checkout",
      first_source: "facebook",
      first_campaign: "tp-lookalike",
      last_seen_at: at(0.7),
      list_ids: ["quentes"],
    },
    {
      launches: [
        { webinar: "tp", hoursAgo: 26, watched: 2950, peak: 3010, reached: true, clicked: 2760, checkout: true, failed: true, messages: 1, source: "facebook", campaign: "tp-lookalike" },
      ],
      purchases: [{ id: "b-joao", title: "Tráfego Pago do Zero", amount: "35 000 Kz", status: "failed", at: at(25) }],
      cases: [{ intent: "payment", status: "open", number: 18, hoursAgo: 0.7, preview: "O Multicaixa Express recusou o pagamento. Há outra forma?" }],
      segments: ["clicaram"],
      place: "Benguela, Angola",
      device: "desktop",
    },
  ),
  person(
    "ex-marta",
    {
      name: "Marta Sousa",
      email: "marta.sousa@exemplo.pt",
      phone: "+351912000303",
      stage: "reached_offer",
      first_source: "youtube",
      last_seen_at: at(20),
      list_ids: ["quentes"],
    },
    {
      launches: [
        { webinar: "d5", hoursAgo: 220, mode: "replay", watched: 2850, peak: 2900, reached: true, source: "youtube" },
        { webinar: "fd", hoursAgo: 21, watched: 2400, entry: 420, peak: 2820, reached: true, messages: 1, source: "youtube", campaign: "canal-out" },
      ],
      purchases: [],
      cases: [],
      place: "Lisboa, Portugal",
      device: "desktop",
    },
  ),
  person(
    "ex-carlos",
    {
      name: "Carlos Neto",
      phone: "+244934000404",
      stage: "no_show",
      first_source: "whatsapp",
      last_seen_at: at(30),
    },
    {
      launches: [{ webinar: "d5", hoursAgo: 30, watched: 0, source: "whatsapp", via: "embed" }],
      purchases: [],
      cases: [],
      place: "Huambo, Angola",
      device: "mobile",
    },
  ),
  person(
    "ex-beatriz",
    {
      name: "Beatriz Fonseca",
      email: "beatriz.fonseca@exemplo.ao",
      stage: "watched",
      first_source: "google",
      first_campaign: "pesquisa-trafego",
      last_seen_at: at(26),
    },
    {
      launches: [{ webinar: "tp", hoursAgo: 26, watched: 1260, peak: 1300, source: "google", campaign: "pesquisa-trafego" }],
      purchases: [],
      cases: [],
      place: "Luanda, Angola",
      device: "tablet",
    },
  ),
];

/** A ficha de uma pessoa do exemplo, montada pela mesma função que monta a real. */
function exampleFile(p: Person): ContactFile {
  const webinars: WebinarParticipation[] = [];
  const steps: JourneyStep[] = [];
  const origins: OriginRow[] = [];
  const timeline: TimelineItem[] = [];
  const event = (name: string, label: string, hoursAgo: number, webinarId: string, detail: string | null = null) =>
    timeline.push({ name, label, at: at(hoursAgo), webinarId, second: null, times: 1, detail });

  p.launches.forEach((l, i) => {
    const w = LAUNCHES[l.webinar];
    const pid = `${p.contact.id}-${i}`;
    const attended = l.watched >= 300;
    webinars.push({
      participantId: pid,
      webinarId: l.webinar,
      title: w.title,
      at: at(l.hoursAgo),
      attended,
      watchedPct: Math.round((l.watched / w.duration) * 100),
      watchedSeconds: l.watched,
      reachedOffer: Boolean(l.reached),
      clicked: l.clicked !== undefined,
      checkout: Boolean(l.checkout),
      paymentFailed: Boolean(l.failed),
      checkoutAbandoned: false,
      purchased: Boolean(l.purchased),
      refunded: false,
      messages: l.messages ?? 0,
    });
    steps.push({
      kind: "event",
      at: at(l.hoursAgo),
      id: pid,
      title: w.title,
      mode: l.mode ?? "live",
      attended,
      watchedSeconds: l.watched,
      watchMeasured: true,
      entrySeconds: l.entry ?? 0,
      peakSeconds: l.peak ?? l.watched,
      durationSeconds: w.duration,
      watchedPct: Math.round((l.watched / w.duration) * 100),
      offerAtPct: Math.round((w.offer / w.duration) * 100),
      reachedOffer: Boolean(l.reached),
      clicked: l.clicked !== undefined,
      clickedAt: null,
      clickedAtSecond: l.clicked ?? null,
      messages: l.messages ?? 0,
    });
    origins.push({
      id: pid,
      webinar_id: l.webinar,
      joined_at: at(l.hoursAgo + 48),
      registration_source: l.via ?? "room",
      utm_source: l.source ?? null,
      utm_campaign: l.campaign ?? null,
      referrer: null,
    });
    event("registered", "Inscreveu-se", l.hoursAgo + 48, l.webinar);
    if (l.watched > 0) event("started_watching", "Começou a ver", l.hoursAgo, l.webinar);
    if (l.reached) event("offer_viewed", "Viu a oferta", l.hoursAgo - 0.75, l.webinar);
    if (l.clicked !== undefined) event("offer_clicked", "Clicou na oferta", l.hoursAgo - 0.8, l.webinar);
    if (l.checkout) event("checkout_started", "Iniciou o pagamento", l.hoursAgo - 0.85, l.webinar);
    if (l.failed) event("payment_failed", "O pagamento falhou", l.hoursAgo - 0.9, l.webinar, w.title);
    if (l.purchased) {
      event("purchase_approved", "Compra aprovada", l.hoursAgo - 0.9, l.webinar, w.title);
      event("automation_entered", "Entrou na automação", l.hoursAgo - 0.9, l.webinar, "Boas-vindas ao aluno");
    }
  });

  const approved = p.purchases.filter((b) => b.status === "approved");
  return contactFile({
    contact: p.contact,
    context: {
      webinars,
      purchases: p.purchases,
      approvedPurchases: approved.length,
      spent: approved.length ? [{ currency: "AOA", total: 45000 * approved.length }] : [],
      cases: p.cases.map((k) => ({
        id: `${p.contact.id}-k${k.number}`,
        number: k.number,
        intent: k.intent,
        status: k.status,
        created_at: at(k.hoursAgo),
        resolved_at: null,
      })),
    },
    steps,
    origins,
    timeline: timeline.sort((a, b) => b.at.localeCompare(a.at)),
    titles: new Map(Object.entries(LAUNCHES).map(([id, w]) => [id, w.title])),
    talks: p.cases.map((k) => ({
      id: `${p.contact.id}-t${k.number}`,
      at: at(k.hoursAgo),
      title: TITLE(p.contact.webinar_ids?.at(-1) ?? "") ?? "Conversa",
      preview: k.preview,
      cases: [`Caso ${k.number} · ${intentLabel(k.intent)} · ${k.status === "open" ? "Aberto" : "Resolvido"}`],
    })),
    place: p.place,
    device: p.device,
  });
}

/* ---------- Ecrã ---------- */

const THEMES = [...new Set(PEOPLE.flatMap((p) => p.cases.map((k) => k.intent)))];

function inScope(p: Person, scope: string) {
  const [kind, id] = scope.split(":");
  if (kind === "launch") return p.contact.webinar_ids?.includes(id!) ?? false;
  if (kind === "theme") return p.cases.some((k) => k.intent === id);
  if (kind === "list") return p.contact.list_ids?.includes(id!) ?? false;
  if (kind === "segment") return p.segments.includes(id!);
  return true;
}

export function ExampleContacts({
  onExit,
  initialId = null,
  initialStep = "list",
  initialScope = "all",
}: {
  onExit: () => void;
  initialId?: string | null;
  initialStep?: ContactsStep;
  initialScope?: string;
}) {
  const [scope, setScope] = useState(initialScope);
  const [stage, setStage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialId);
  const [step, setStep] = useState<ContactsStep>(initialStep);
  const pretend = (what: string) => toast(`No exemplo nada é guardado: ${what}.`);

  const count = (key: string) => PEOPLE.filter((p) => inScope(p, key)).length;
  const groups: ScopeGroup[] = [
    { id: "all", items: [{ key: "all", kind: "all", label: "Todos os contactos", count: PEOPLE.length }] },
    {
      id: "launches",
      title: "Lançamentos",
      items: Object.entries(LAUNCHES).map(([id, w]) => ({
        key: `launch:${id}`,
        kind: "launch" as const,
        label: w.title,
        count: count(`launch:${id}`),
      })),
    },
    {
      id: "themes",
      title: "Temas das conversas",
      items: THEMES.map((id) => ({ key: `theme:${id}`, kind: "theme" as const, label: intentLabel(id), count: count(`theme:${id}`) })),
    },
    {
      id: "lists",
      title: "Listas",
      items: LISTS.map((l) => ({ key: `list:${l.id}`, kind: "list" as const, label: l.name, count: count(`list:${l.id}`) })),
      add: { label: "Nova lista", onClick: () => pretend("a lista seria criada") },
    },
    {
      id: "segments",
      title: "Segmentos",
      items: SEGMENTS.map((s) => ({ key: `segment:${s.id}`, kind: "segment" as const, label: s.name, count: count(`segment:${s.id}`) })),
      add: { label: "Novo segmento", onClick: () => pretend("o segmento seria criado") },
    },
  ];
  const scopeLabel = groups.flatMap((g) => g.items).find((i) => i.key === scope)?.label ?? "Todos os contactos";

  const scoped = PEOPLE.filter((p) => inScope(p, scope)).map((p) => p.contact);
  const rows = filterContacts(scoped, { stage, search });
  const counts = stageCountsOf(scoped);
  const files = useMemo(() => new Map(PEOPLE.map((p) => [p.contact.id!, exampleFile(p)])), []);
  const open = openId ? files.get(openId) : undefined;
  const person = PEOPLE.find((p) => p.contact.id === openId);

  const pickScope = (key: string) => {
    setScope(key);
    setStage(null);
  };

  return (
    <ContactsFrame
      step={step}
      banner={<ExampleBanner onExit={onExit} />}
      nav={<ScopeNav groups={groups} active={scope} onSelect={pickScope} />}
      list={
        <ContactList
          title={scopeLabel}
          total={rows.length}
          picker={<ScopePicker groups={groups} active={scope} onSelect={pickScope} />}
          tools={
            <Button
              variant="outline"
              size="sm"
              className="@2xl:hidden"
              onClick={() => {
                setOpenId(null);
                setStep("detail");
              }}
            >
              Resumo
            </Button>
          }
          search={search}
          onSearch={setSearch}
          counts={counts}
          stage={stage}
          onStage={setStage}
          rows={rows.map((c) => ({
            contact: c,
            launch: launchLabel(c.webinar_ids, TITLE),
            country: contactCountryOf([], c.phone),
            example: true,
          }))}
          activeId={openId}
          onSelect={(id) => {
            setOpenId(id);
            setStep("detail");
          }}
        />
      }
      detail={
        open && person ? (
          <ContactFileView
            key={open.id}
            file={open}
            example
            lists={
              <ListChips
                lists={LISTS.filter((l) => person.contact.list_ids?.includes(l.id))}
                segments={SEGMENTS.filter((s) => person.segments.includes(s.id))}
                addable={LISTS.filter((l) => !person.contact.list_ids?.includes(l.id))}
                onAdd={() => pretend("a pessoa entraria na lista")}
                onRemove={() => pretend("a pessoa sairia da lista")}
              />
            }
            onOpenConversation={() => pretend("a conversa abriria no Atendimento")}
            onBack={() => {
              setOpenId(null);
              setStep("list");
            }}
          />
        ) : (
          <GroupSummary
            title={scopeLabel}
            counts={counts}
            sources={sourceRowsOf(scoped)}
            stage={stage}
            onStage={setStage}
            onBack={() => setStep("list")}
          />
        )
      }
    />
  );
}
