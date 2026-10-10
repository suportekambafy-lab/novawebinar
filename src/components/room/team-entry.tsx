import { useState, type CSSProperties } from "react";
import { BadgeCheck, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamRole } from "@/lib/room-team";
import { ROOM_FONT } from "./entry-screen";

/**
 * A entrada de quem tem o link de equipa: escolhe o nome e se aparece como «Equipa» ou «Apresentador».
 * Não preenche o formulário das pessoas, não conta na audiência e não aparece na Vista ao vivo.
 */
export function TeamEntry({
  title,
  hostName,
  theme,
  initial,
  onEnter,
}: {
  title: string;
  hostName: string;
  theme: "dark" | "light";
  initial?: { name: string; role: TeamRole } | null | undefined;
  onEnter: (member: { name: string; role: TeamRole }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<TeamRole>(initial?.role ?? "equipa");
  const light = theme === "light";
  const ready = name.trim().length >= 2;
  return (
    <TeamScreen theme={theme}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onEnter({ name: name.trim().slice(0, 40), role });
        }}
        className={cn(
          "grid w-full max-w-[420px] gap-5 rounded-[18px] p-6 sm:p-8",
          light ? "bg-white shadow-[0_10px_30px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.08)]" : "bg-[#141414] shadow-[0_30px_80px_rgba(0,0,0,.45),0_0_0_1px_rgba(255,255,255,.12)]",
        )}
      >
        <div className="grid gap-1.5">
          <span className="inline-flex items-center gap-1.5 justify-self-start rounded-full bg-[#E8440C] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
            <Users className="size-3.5" />
            Equipa
          </span>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">{title}</h1>
          <p className={cn("text-[14px] leading-snug", light ? "text-[#5C5C5C]" : "text-white/70")}>
            Assiste sem contar na audiência. O que escrever aparece a todos, com o selo.
          </p>
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">O seu nome no chat</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="name"
            placeholder="Ex.: Ana da equipa"
            className={cn(
              "h-[50px] w-full rounded-xl px-4 text-[15px] outline-none focus:shadow-[0_0_0_2px_#E8440C]",
              light ? "bg-white shadow-[0_0_0_1px_rgba(0,0,0,.14)] placeholder:text-[#8F8F8F]" : "bg-white/[0.07] shadow-[0_0_0_1px_rgba(255,255,255,.16)] placeholder:text-white/45",
            )}
          />
        </label>
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold">Aparece como</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Aparece como">
            {(
              [
                ["equipa", "Equipa", Users],
                ["apresentador", "Apresentador", BadgeCheck],
              ] as const
            ).map(([value, label, Icon]) => {
              const on = role === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setRole(value);
                    if (value === "apresentador" && !name.trim() && hostName) setName(hostName);
                  }}
                  className={cn(
                    "flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition",
                    on
                      ? "bg-[#E8440C] text-white"
                      : light
                        ? "bg-[#F2F2F2] text-[#171717] hover:bg-[#E8E8E8]"
                        : "bg-white/[0.07] text-white ring-1 ring-white/12 hover:bg-white/[0.12]",
                  )}
                >
                  <Icon className="size-[18px]" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="submit"
          disabled={!ready}
          className="h-[54px] rounded-xl bg-[#E8440C] text-[17px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Entrar na sala
        </button>
      </form>
    </TeamScreen>
  );
}

/** O fundo das páginas da equipa (entrada, a confirmar, link inválido). */
export function TeamScreen({ theme, children }: { theme: "dark" | "light"; children: React.ReactNode }) {
  return (
    <main
      className={cn(
        "flex min-h-dvh items-center justify-center px-4 py-10",
        theme === "light" ? "bg-[#F4F4F5] text-[#171717]" : "bg-[#0A0A0A] text-white",
      )}
      style={{ fontFamily: ROOM_FONT } as CSSProperties}
    >
      {children}
    </main>
  );
}

/** A confirmar o link, ou o link não serve (com o caminho para iniciar sessão). */
export function TeamNotice({ theme, state, loginHref }: { theme: "dark" | "light"; state: "checking" | "denied"; loginHref?: string | undefined }) {
  return (
    <TeamScreen theme={theme}>
      {state === "checking" ? (
        <Loader2 className="size-7 animate-spin opacity-60" aria-label="A confirmar o link de equipa" />
      ) : (
        <div className="grid max-w-sm justify-items-center gap-3 text-center">
          <h1 className="text-xl font-bold">Este link de equipa não serve</h1>
          <p className={cn("text-[14.5px] leading-snug", theme === "light" ? "text-[#5C5C5C]" : "text-white/70")}>
            {loginHref ? "Entre na sua conta do Novawebinar e volte a abrir este link." : "Peça um link novo a quem organiza o webinar."}
          </p>
          {loginHref ? (
            <a href={loginHref} className="mt-1 inline-flex h-12 items-center rounded-xl bg-[#E8440C] px-6 text-[15px] font-bold text-white">
              Iniciar sessão
            </a>
          ) : null}
        </div>
      )}
    </TeamScreen>
  );
}
