import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/site-header";

const linkClass = "text-s-text-2 hover:text-s-text";
const headingClass = "mb-1 text-site-meta font-medium text-[var(--accent-200)]";

export function SiteFooter() {
  return (
    <footer data-site data-surface="footer" className="pb-8 pt-[var(--section-y-tight)]">
      <div className="site-wrap">
        <p className="max-w-[18ch] text-site-h2">Grave uma vez. Apresente todos os dias.</p>
        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 text-site-small md:grid-cols-4">
          <nav aria-label="Produto" className="grid content-start gap-2.5">
            <p className={headingClass}>Produto</p>
            <Link to="/funcionalidades" className={linkClass}>
              Funcionalidades
            </Link>
            <a href="/#automacoes" className={linkClass}>
              Automações
            </a>
            <Link to="/funcionalidades/$slug" params={{ slug: "analise" }} className={linkClass}>
              Análise
            </Link>
          </nav>
          <nav aria-label="Conta" className="grid content-start gap-2.5">
            <p className={headingClass}>Conta</p>
            <Link to="/auth/login" className={linkClass}>
              Entrar
            </Link>
            <Link to="/auth/register" className={linkClass}>
              Criar conta
            </Link>
            <Link to="/auth/reset" className={linkClass}>
              Recuperar acesso
            </Link>
          </nav>
          <nav aria-label="Informação legal" className="grid content-start gap-2.5">
            <p className={headingClass}>Legal</p>
            <Link to="/legal/termos" className={linkClass}>
              Termos e condições
            </Link>
            <Link to="/legal/privacidade" className={linkClass}>
              Privacidade
            </Link>
            <Link to="/legal/cookies" className={linkClass}>
              Cookies
            </Link>
          </nav>
          <nav aria-label="Ajuda" className="grid content-start gap-2.5">
            <p className={headingClass}>Ajuda</p>
            <a href="/#perguntas" className={linkClass}>
              Perguntas frequentes
            </a>
            <a href="/#como-funciona" className={linkClass}>
              Como funciona
            </a>
          </nav>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-s-line pt-6 text-site-meta text-s-text-2">
          <BrandMark className="text-s-text" />
          <p>© {new Date().getFullYear()} Novawebinar</p>
        </div>
      </div>
    </footer>
  );
}
