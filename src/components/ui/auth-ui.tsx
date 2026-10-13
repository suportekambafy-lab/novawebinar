import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Eye, EyeOff, Mail } from "lucide-react";
import { DesktopShot } from "@/components/landing/shots";
import { BrandMark } from "@/components/site-header";

/**
 * Moldura de login, registo, recuperar e boas-vindas (9/10, lógica Nubank):
 * barra de 64px com o símbolo e o link contextual, formulário de 400px e, no
 * computador, um aside quente com a sala e uma frase. No telemóvel o aside não
 * existe e a imagem dele não descarrega (loading="lazy" dentro de display:none).
 */
export function AuthUI({ children, topLink }: { children: ReactNode; topLink?: ReactNode }) {
  return (
    <div data-site data-surface="base" className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col">
        <header className="flex h-16 flex-none items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" aria-label="Novawebinar, início" className="rounded-md">
            <BrandMark compact />
          </Link>
          {topLink && <p className="text-right text-site-small text-s-text-2">{topLink}</p>}
        </header>
        <main className="flex flex-1 flex-col items-center gap-10 px-5 pb-10 pt-6 sm:justify-center sm:py-16">
          <div className="w-full max-w-[400px]">{children}</div>
          <p className="max-w-[400px] text-center text-site-meta text-s-text-2">
            Ao continuar, confirma que aceita os{" "}
            <Link to="/legal/termos" className="text-s-text underline underline-offset-2">
              termos
            </Link>{" "}
            e a{" "}
            <Link to="/legal/privacidade" className="text-s-text underline underline-offset-2">
              política de privacidade
            </Link>
            .
          </p>
        </main>
      </div>
      <aside
        data-surface="warm"
        aria-label="Sobre o Novawebinar"
        className="hidden flex-col justify-center gap-10 p-12 lg:flex xl:p-16"
      >
        <div className="rounded-[var(--radius-panel)] bg-s-card p-6">
          <DesktopShot kind="sala" />
        </div>
        <p className="max-w-[18ch] text-site-h2">Grave uma vez. Apresente todos os dias.</p>
      </aside>
    </div>
  );
}

export function AuthHeading({
  title,
  children,
  step,
}: {
  title: string;
  children?: ReactNode;
  step?: string;
}) {
  return (
    <div className="mb-8">
      {step && <p className="mb-3 text-site-meta font-medium text-s-text-2">{step}</p>}
      <h1 className="text-site-h2">{title}</h1>
      {children && <p className="mt-3 text-site-body text-s-text-2">{children}</p>}
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-3 rounded-[var(--radius-field)] bg-[var(--status-danger-soft)] p-3 text-site-small text-[var(--status-danger)]"
    >
      <span className="grid size-6 flex-none place-items-center rounded-full bg-white">
        <CircleAlert className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="pt-0.5">{children}</span>
    </p>
  );
}

/** Palavra-passe com o olho num alvo de 44px. */
export function PasswordField({
  id,
  label,
  after,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; after?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="site-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          minLength={8}
          maxLength={128}
          required
          className="site-field pr-12"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-0.5 top-0.5 grid size-11 place-items-center rounded-[6px] text-s-text-2 hover:text-s-text"
          aria-label={show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
        >
          {show ? (
            <EyeOff className="size-5" strokeWidth={1.5} />
          ) : (
            <Eye className="size-5" strokeWidth={1.5} />
          )}
        </button>
      </div>
      {after}
    </div>
  );
}

/** Depois de enviar: o email não chega sempre à primeira, por isso reenviar fica activo aos 60 s. */
export function EmailSent({
  title,
  email,
  onResend,
  children,
}: {
  title: string;
  email: string;
  onResend: () => Promise<string | undefined>;
  children: ReactNode;
}) {
  const [wait, setWait] = useState(60);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  return (
    <div>
      <span className="site-icon size-12">
        <Mail className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-site-h2">{title}</h1>
      <p className="mt-3 text-site-body text-s-text-2">
        Enviámos um link para <strong className="font-medium text-s-text">{email}</strong>. Abra-o
        para continuar.
      </p>
      <div className="mt-8 grid gap-3">
        <button
          type="button"
          className="site-btn site-btn-outline w-full"
          disabled={wait > 0}
          onClick={async () => {
            setStatus("");
            setWait(60);
            setStatus((await onResend()) ?? "Enviámos o email outra vez.");
          }}
        >
          {wait > 0 ? `Reenviar email (${wait} s)` : "Reenviar email"}
        </button>
        {children}
      </div>
      {status && (
        <p role="status" className="mt-4 text-site-small text-s-text-2">
          {status}
        </p>
      )}
    </div>
  );
}
