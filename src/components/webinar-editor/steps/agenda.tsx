import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Clock, Eye, Film, Play, Repeat, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaneHeader, PanelDialog, PanelNavButton, PanelNavGroup, PanelTitle } from "@/components/panel-modal";
import { EntryBadge, entryCardColor, entryLiveLabel } from "@/components/room/entry-screen";
import { VideoThumb } from "@/components/video-thumb";
import type { EntryField } from "@/lib/entry-fields";
import { entryPalette, type WaitingRoom } from "@/lib/room-logic";
import { cn } from "@/lib/utils";
import { Field, Note, Section, Seg, SwitchRow } from "../ui";
import type { EditorForm, FocusProps, SetForm } from "../form";
import { LibraryGrid, type VideoSourceLite } from "./video";

export type ScheduleKind = "single" | "repeat" | "jit" | "ondemand";

const ZONES: [string, [string, string][]][] = [
  [
    "África",
    [
      ["Africa/Luanda", "Angola · Luanda"],
      ["Africa/Maputo", "Moçambique · Maputo"],
      ["Atlantic/Cape_Verde", "Cabo Verde · Praia"],
      ["Africa/Bissau", "Guiné-Bissau · Bissau"],
      ["Africa/Sao_Tome", "São Tomé e Príncipe · São Tomé"],
      ["Africa/Lagos", "Nigéria · Lagos"],
      ["Africa/Johannesburg", "África do Sul · Joanesburgo"],
      ["Africa/Nairobi", "Quénia · Nairobi"],
      ["Africa/Cairo", "Egipto · Cairo"],
      ["Africa/Casablanca", "Marrocos · Casablanca"],
    ],
  ],
  [
    "Europa",
    [
      ["Europe/Lisbon", "Portugal · Lisboa"],
      ["Atlantic/Azores", "Portugal · Açores"],
      ["Europe/Madrid", "Espanha · Madrid"],
      ["Europe/Paris", "França · Paris"],
      ["Europe/London", "Reino Unido · Londres"],
      ["Europe/Berlin", "Alemanha · Berlim"],
      ["Europe/Rome", "Itália · Roma"],
      ["Europe/Zurich", "Suíça · Zurique"],
    ],
  ],
  [
    "América do Sul",
    [
      ["America/Sao_Paulo", "Brasil · São Paulo"],
      ["America/Manaus", "Brasil · Manaus"],
      ["America/Argentina/Buenos_Aires", "Argentina · Buenos Aires"],
      ["America/Bogota", "Colômbia · Bogotá"],
      ["America/Santiago", "Chile · Santiago"],
      ["America/Lima", "Peru · Lima"],
    ],
  ],
  [
    "América do Norte",
    [
      ["America/New_York", "Estados Unidos · Nova Iorque"],
      ["America/Chicago", "Estados Unidos · Chicago"],
      ["America/Denver", "Estados Unidos · Denver"],
      ["America/Los_Angeles", "Estados Unidos · Los Angeles"],
      ["America/Toronto", "Canadá · Toronto"],
      ["America/Mexico_City", "México · Cidade do México"],
    ],
  ],
  [
    "Ásia e Oceânia",
    [
      ["Asia/Dili", "Timor-Leste · Díli"],
      ["Asia/Macau", "Macau"],
      ["Asia/Dubai", "Emirados Árabes · Dubai"],
      ["Asia/Kolkata", "Índia · Calcutá"],
      ["Asia/Tokyo", "Japão · Tóquio"],
      ["Australia/Sydney", "Austrália · Sydney"],
    ],
  ],
  ["Geral", [["UTC", "UTC · tempo universal"]]],
];

function offsetLabel(zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part === "GMT" ? "GMT+0" : (part ?? "");
  } catch {
    return "";
  }
}

const DAYS: [number, string, string][] = [
  [1, "Seg", "Segunda-feira"],
  [2, "Ter", "Terça-feira"],
  [3, "Qua", "Quarta-feira"],
  [4, "Qui", "Quinta-feira"],
  [5, "Sex", "Sexta-feira"],
  [6, "Sáb", "Sábado"],
  [0, "Dom", "Domingo"],
];

/** Agenda: quando a sessão acontece. */
export function StepAgenda({
  form,
  set,
  focus,
  kind,
  onKind,
  nextSession,
  nextStartMs,
  ended,
  theme,
  fields,
  library,
  providerLabel,
}: {
  form: EditorForm;
  set: SetForm;
  /** A Biblioteca, para o vídeo de fundo da sala de espera. */
  library: readonly VideoSourceLite[];
  providerLabel: (provider: string) => string;
  focus: FocusProps;
  kind: ScheduleKind;
  onKind: (kind: ScheduleKind) => void;
  /** «Sexta-feira, 2 de outubro, às 17:20» ou null. */
  nextSession: string | null;
  /** O início da próxima sessão (ms), para mostrar a etiqueta da página de entrada. */
  nextStartMs: number | null;
  /** «02/10» quando a data única já passou. */
  ended: string | null;
  /** O tema da pré-visualização: o cartão em miniatura fica claro ou escuro como a página. */
  theme: "dark" | "light";
  /** Os campos da página de entrada, para mostrar o que a pessoa preenche. */
  fields: readonly EntryField[];
}) {
  const [date = "", time = ""] = form.scheduled_at.split("T");
  const zones = useMemo(
    () => ZONES.map(([group, list]) => [group, list.map(([id, name]) => [id, `${name} (${offsetLabel(id)})`])] as const),
    [],
  );
  const known = ZONES.some(([, list]) => list.some(([id]) => id === form.timezone));
  const zoneSelect = (
    <Field label="Fuso horário">
      <div className="relative">
        <select
          value={form.timezone}
          onChange={(e) => set({ timezone: e.target.value })}
          aria-label="Fuso horário"
          className="h-9 w-full appearance-none rounded-sm bg-white pl-3 pr-9 text-sm shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] outline-none focus:shadow-[inset_0_0_0_1px_var(--foreground)]"
        >
          {!known ? <option value={form.timezone}>{form.timezone}</option> : null}
          {zones.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </Field>
  );
  // Cada modo: como funciona (no cartão) e para que serve (por baixo, só o escolhido).
  const kinds: { value: ScheduleKind; icon: typeof CalendarDays; title: string; text: string; use: string }[] = [
    { value: "single", icon: CalendarDays, title: "Uma data", text: "Uma sessão, num dia e hora.", use: "Para um lançamento ou uma aula marcada." },
    { value: "repeat", icon: Repeat, title: "Repetir", text: "Nos dias e horas que escolher.", use: "Para vender todas as semanas com o mesmo vídeo." },
    { value: "jit", icon: Clock, title: "Just in time", text: "A cada 15, 30 ou 60 min.", use: "Para anúncios a correr o dia todo: ninguém espera muito." },
    { value: "ondemand", icon: Play, title: "Sempre disponível", text: "Começa quando a pessoa entra.", use: "Para uma aula sem hora, vista quando a pessoa quiser." },
  ];
  // O que a página de entrada mostra ao lado do título (a mesma etiqueta da página verdadeira).
  const badge = entryLiveLabel(kind === "ondemand" ? null : nextStartMs, form.timezone, Date.now());
  const page = entryPalette(entryCardColor(theme, form.entry_card_color), form.entry_button_color);
  // A sessão ainda por vir: só então há espera (e contagem).
  const ahead = kind !== "ondemand" && !ended && !badge.live;
  const sees =
    kind === "ondemand" ? (
      "Entra e o vídeo começa do início."
    ) : ended ? (
      <span className="text-warning">A sessão de {ended} terminou: escolha uma nova data.</span>
    ) : nextStartMs === null ? (
      "Ainda sem data marcada."
    ) : badge.live ? (
      "Entra na sessão que está a decorrer."
    ) : kind === "jit" ? (
      "Não escolhe hora: fica na sessão seguinte."
    ) : nextSession ? (
      <>
        Não escolhe data: fica na próxima sessão, <b className="font-semibold text-foreground">{nextSession}</b>.
      </>
    ) : null;

  return (
    <>
      <Section icon={CalendarDays} title="Modo" help="agenda">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Modo">
          {kinds.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => onKind(k.value)}
              className={cn(
                "grid content-start gap-0.5 rounded-lg border bg-white px-3 py-2.5 text-left hover:bg-gray-50",
                kind === k.value && "border-foreground shadow-[inset_0_0_0_1px_var(--foreground)]",
              )}
            >
              <b className="flex items-start gap-1.5 text-[13.5px] font-semibold leading-snug">
                <k.icon className="mt-[3px] size-3.5 shrink-0" />
                {k.title}
              </b>
              <span className="text-[12px] leading-snug text-muted-foreground">{k.text}</span>
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">{kinds.find((k) => k.value === kind)?.use}</p>
      </Section>

      {kind === "single" ? (
        <Section icon={Clock} title="Quando" help="agendaQuando">
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Data" required>
              <Input
                type="date"
                value={date}
                onChange={(e) => set({ scheduled_at: e.target.value ? `${e.target.value}T${time || "20:00"}` : "" })}
                {...focus("date")}
              />
            </Field>
            <Field label="Hora" required>
              <Input
                type="time"
                value={time}
                onChange={(e) => date && set({ scheduled_at: `${date}T${e.target.value || "20:00"}` })}
                disabled={!date}
              />
            </Field>
          </div>
          {zoneSelect}
        </Section>
      ) : kind === "repeat" ? (
        <Section icon={Clock} title="Quando" help="agendaQuando">
          <Field label="Dias">
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map(([n, short, full]) => {
                const on = form.recurrence_days.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={full}
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        recurrence_days: on
                          ? form.recurrence_days.filter((d) => d !== n)
                          : [...form.recurrence_days, n].sort((a, b) => a - b),
                      })
                    }
                    className={cn(
                      "h-9 rounded-md border bg-white text-[12.5px] font-medium",
                      on && "border-foreground bg-foreground text-background",
                    )}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Horas" required>
            <div className="flex flex-wrap items-center gap-2">
              {/* A chave é só a posição: com a hora na chave, cada dígito escrito recriava o campo e tirava-lhe o foco. */}
              {form.recurrence_times.map((time, i) => (
                <span key={i} className="inline-flex h-9 items-center gap-1 rounded-md border bg-white pl-2 pr-1">
                  <Clock className="size-3.5 text-muted-foreground" />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) =>
                      set({ recurrence_times: form.recurrence_times.map((t, j) => (j === i ? e.target.value || t : t)) })
                    }
                    className="w-[84px] bg-transparent text-sm outline-none"
                    aria-label={`Hora ${i + 1}`}
                    {...(i === 0 ? focus("date") : {})}
                  />
                  {form.recurrence_times.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => set({ recurrence_times: form.recurrence_times.filter((_, j) => j !== i) })}
                      aria-label="Tirar esta hora"
                      className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-[var(--ds-gray-alpha-200)]"
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
              {form.recurrence_times.length < 6 ? (
                <button
                  type="button"
                  onClick={() => set({ recurrence_times: [...form.recurrence_times, "20:00"] })}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-dashed px-2.5 text-[13px] font-medium hover:bg-gray-50"
                >
                  + Hora
                </button>
              ) : null}
            </div>
          </Field>
          {form.recurrence_days.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Sem dias escolhidos, repete todos os dias.</p>
          ) : null}
          {zoneSelect}
        </Section>
      ) : kind === "jit" ? (
        <Section icon={Clock} title="Intervalo" help="agendaIntervalo">
          <Seg
            small
            value={["15", "30", "60"].includes(form.jit_interval_minutes) ? form.jit_interval_minutes : "15"}
            onChange={(jit_interval_minutes) => set({ jit_interval_minutes })}
            options={[
              { value: "15", label: "15 min" },
              { value: "30", label: "30 min" },
              { value: "60", label: "1 hora" },
            ]}
          />
          <SwitchRow
            title="Sem sessões de noite"
            description="Entre as 22:00 e as 07:00, a próxima sessão é às 07:00."
            checked={form.jit_skip_night}
            onChange={(jit_skip_night) => set({ jit_skip_night })}
          />
          {zoneSelect}
        </Section>
      ) : null}

      {/* O que o inscrito vê na página de entrada: não escolhe data, entra na sessão que o modo dá. */}
      <Section icon={Eye} title="O que o inscrito vê">
        <div className="grid gap-2 rounded-xl p-3.5 shadow-[0_0_0_1px_var(--ds-gray-alpha-200)]" style={{ background: page.card, color: page.text }}>
          <p className="text-[14px] font-bold leading-snug">
            <EntryBadge
              live={badge.live || Boolean(ended)}
              label={badge.label}
              light={theme === "light"}
              className="mr-1.5 rounded-[5px] px-1.5 py-[2px] text-[10px] @3xl:text-[10px]"
            />
            {form.public_title || "O título do webinar"}
          </p>
          {fields.map((f) => (
            <span
              key={f.id}
              className="flex h-7 items-center rounded-md px-2.5 text-[11.5px]"
              style={{ background: page.field, color: page.placeholder, boxShadow: `0 0 0 1px ${page.line}` }}
            >
              {f.label}
            </span>
          ))}
          <span className="rounded-md py-1.5 text-center text-[12px] font-bold" style={{ background: page.button, color: page.buttonText }}>
            {form.registration_button_text || "Entrar na sala"}
          </span>
        </div>
        <p className="text-[12.5px] leading-snug text-muted-foreground">
          {sees}
          {ahead && form.waiting_room_enabled ? " Até lá, vê a contagem na sala de espera." : null}
        </p>
      </Section>

      <Section title="Sessão" help="agendaSessao">
        {kind !== "ondemand" ? (
          <>
            <SwitchRow
              icon={CalendarDays}
              title="Sala de espera"
              description="Contagem decrescente antes da hora."
              checked={form.waiting_room_enabled}
              onChange={(waiting_room_enabled) => set({ waiting_room_enabled })}
            />
            {form.waiting_room_enabled ? <WaitingOptions form={form} set={set} library={library} providerLabel={providerLabel} /> : null}
            <SwitchRow
              icon={Film}
              title="Vídeo sincronizado"
              description="Quem entra às 20:05 vê a partir do minuto 5."
              checked={form.sync_video_with_start}
              onChange={(sync_video_with_start) => set({ sync_video_with_start })}
            />
          </>
        ) : null}
        <SwitchRow
          icon={Video}
          title="Replay depois da sessão"
          description="O mesmo vídeo, para quem não viu ao vivo."
          checked={form.replay_enabled}
          onChange={(replay_enabled) => set({ replay_enabled })}
        />
      </Section>
    </>
  );
}

/**
 * A sala de espera: um vídeo da Biblioteca ao fundo (ou nenhum), escolhido no mesmo pop-up do vídeo da
 * aula, e a contagem por cima. Fica em `chat_settings.live.waiting`.
 */
function WaitingOptions({
  form,
  set,
  library,
  providerLabel,
}: {
  form: EditorForm;
  set: SetForm;
  library: readonly VideoSourceLite[];
  providerLabel: (provider: string) => string;
}) {
  const [picking, setPicking] = useState(false);
  const waiting = form.live.waiting;
  const setWaiting = (patch: Partial<WaitingRoom>) => set({ live: { ...form.live, waiting: { ...waiting, ...patch } } });
  const chosen = library.find((v) => v.id === waiting.video) ?? null;
  const nav = <PanelNavButton icon={Film} label="Da Biblioteca" active onClick={() => {}} />;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border bg-white p-3">
      <div className="flex items-center gap-2">
        <b className="min-w-0 flex-1 text-sm font-medium">Vídeo de fundo</b>
        {chosen ? (
          <Button variant="ghost" size="sm" onClick={() => setWaiting({ video: null })}>
            Tirar
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
          {chosen ? "Trocar" : "Escolher"}
        </Button>
      </div>
      <div className="-mt-1 flex items-center gap-2.5">
        {chosen ? (
          <VideoThumb
            name={chosen.name}
            thumbnailUrl={chosen.thumbnail_url}
            sourceUrl={chosen.source_url}
            overlay={false}
            className="w-[60px] shrink-0 rounded-md"
          />
        ) : null}
        <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted-foreground">
          {chosen ? (
            <>
              <span className="block truncate font-medium text-foreground">{chosen.name}</span>
              Sem som e em ciclo; quem quiser liga o som.
            </>
          ) : (
            "Nenhum: fica o fundo da sala."
          )}
        </span>
      </div>
      <SwitchRow
        title="Mostrar contagem"
        description={chosen ? "O relógio até à hora, por cima do vídeo." : "O relógio até à hora."}
        checked={waiting.countdown}
        onChange={(countdown) => setWaiting({ countdown })}
      />
      {picking ? (
        <PanelDialog
          title="Vídeo de fundo"
          description="Um vídeo da Biblioteca para o fundo da sala de espera."
          onClose={() => setPicking(false)}
          sidebar={
            <>
              <PanelTitle>Vídeo de fundo</PanelTitle>
              <PanelNavGroup>{nav}</PanelNavGroup>
            </>
          }
          mobileNav={nav}
        >
          <PaneHeader title="Da Biblioteca" subtitle="Toca sem som e em ciclo atrás da contagem; quem quiser liga o som." />
          {library.length === 0 ? (
            <Note icon={Film}>A Biblioteca ainda está vazia. Carregue um vídeo na etapa Vídeo.</Note>
          ) : (
            <LibraryGrid
              library={library}
              current={waiting.video}
              providerLabel={providerLabel}
              onPick={(video) => {
                setWaiting({ video });
                setPicking(false);
              }}
            />
          )}
        </PanelDialog>
      ) : null}
    </div>
  );
}
