import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { landingFeatures } from "@/lib/landing-features";
import iconAsset from "@/assets/brand/novawebinar-icon.png";

/** O símbolo oficial (o N vermelho, o mesmo do painel e do favicon) com o nome. */
export function BrandMark({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 text-[1.125rem] font-semibold tracking-[-0.02em] ${className}`}
    >
      <img
        src={iconAsset}
        width={32}
        height={32}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-8 flex-none"
      />
      {/* No telemóvel o cabeçalho mostra só o símbolo (o link tem o nome no aria-label). */}
      <span className={compact ? "max-sm:sr-only" : ""}>Novawebinar</span>
    </span>
  );
}

const sectionLinks = [
  { href: "/#automacoes", label: "Automações" },
  { href: "/#perguntas", label: "Perguntas" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!featuresOpen && !menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!featuresRef.current?.contains(event.target as Node)) setFeaturesOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFeaturesOpen(false);
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [featuresOpen, menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <header data-site data-surface="base" className="site-header sticky top-0 z-50">
      <div className="site-wrap flex h-16 items-center gap-4 lg:gap-8">
        <Link to="/" aria-label="Novawebinar, início" className="rounded-md">
          <BrandMark compact />
        </Link>

        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-7 text-[15px] font-medium lg:flex"
        >
          <div className="relative" ref={featuresRef} onMouseLeave={() => setFeaturesOpen(false)}>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1 rounded-md hover:text-s-text-2"
              aria-expanded={featuresOpen}
              onClick={() => setFeaturesOpen((open) => !open)}
              onMouseEnter={() => setFeaturesOpen(true)}
            >
              Funcionalidades{" "}
              <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
            {featuresOpen && (
              <div className="absolute left-0 top-full grid w-[34rem] grid-cols-2 gap-1 rounded-[var(--radius-card-site)] bg-white p-3 shadow-[var(--shadow-pop)]">
                {landingFeatures.map((feature) => (
                  <Link
                    key={feature.slug}
                    to="/funcionalidades/$slug"
                    params={{ slug: feature.slug }}
                    className="grid gap-0.5 rounded-lg p-3 hover:bg-s-card"
                    onClick={() => setFeaturesOpen(false)}
                  >
                    <strong className="text-[15px] font-medium">{feature.menuTitle}</strong>
                    <span className="text-site-meta font-normal text-s-text-2">
                      {feature.menuCopy}
                    </span>
                  </Link>
                ))}
                <Link
                  to="/funcionalidades"
                  className="col-span-2 mt-1 rounded-lg border-t border-s-line p-3 text-site-small"
                  onClick={() => setFeaturesOpen(false)}
                >
                  Ver todas as funcionalidades
                </Link>
              </div>
            )}
          </div>
          {sectionLinks.map((link) => (
            <a key={link.href} href={link.href} className="rounded-md hover:text-s-text-2">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link to="/auth/login" className="site-btn site-btn-sm site-btn-outline max-sm:hidden">
            Entrar
          </Link>
          <Link to="/auth/register" className="site-btn site-btn-sm site-btn-primary">
            Criar conta
          </Link>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full lg:hidden"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="size-5" strokeWidth={1.5} />
            ) : (
              <Menu className="size-5" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="site-menu"
          aria-label="Menu"
          className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto bg-white lg:hidden"
        >
          <div className="site-wrap flex min-h-full flex-col py-4">
            {landingFeatures.map((feature) => (
              <Link
                key={feature.slug}
                to="/funcionalidades/$slug"
                params={{ slug: feature.slug }}
                className="grid gap-0.5 border-b border-s-line py-3.5"
                onClick={close}
              >
                <strong className="text-site-body font-medium">{feature.menuTitle}</strong>
                <span className="text-site-meta text-s-text-2">{feature.menuCopy}</span>
              </Link>
            ))}
            {sectionLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="border-b border-s-line py-3.5 text-site-body font-medium"
                onClick={close}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-auto grid gap-2 pt-6">
              <Link to="/auth/login" className="site-btn site-btn-outline" onClick={close}>
                Entrar
              </Link>
              <Link to="/auth/register" className="site-btn site-btn-primary" onClick={close}>
                Criar conta
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
