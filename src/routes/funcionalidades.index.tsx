import { useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { landingFeatures } from "@/lib/landing-features";

export const Route = createFileRoute("/funcionalidades/")({
  head: () => ({
    meta: [
      { title: "Funcionalidades — Novawebinar" },
      { name: "description", content: "Sessões recorrentes, chat programado, oferta na sala, notificações de venda, replay, assistente no suporte e análise de retenção." },
      { property: "og:title", content: "Funcionalidades — Novawebinar" },
      { property: "og:description", content: "Tudo o que o Novawebinar faz: agenda, chat programado, oferta, vendas, replay, assistência e análise." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeaturesIndex,
});

function FeaturesIndex() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("a");
    const step = card ? card.offsetWidth + 16 : 320;
    track.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  };

  return (
    <div data-site data-surface="base" className="nova-landing">
      <SiteHeader />
      <main className="lp-feature-page">
        <section className="lp-feature-hero">
          <div className="lp-feature-inner">
            <p className="lp-eyebrow">A PLATAFORMA, PARTE A PARTE</p>
            <h1>Tudo o que acontece antes, durante e depois da sessão.</h1>
            <p className="lp-feature-intro">Cada funcionalidade tem uma página própria com a explicação e uma demonstração da interface real do Novawebinar.</p>
            <div className="lp-hero-actions">
              <Link to="/auth/register" className="site-btn site-btn-primary">Criar conta <ArrowRight aria-hidden="true" /></Link>
            </div>
          </div>
        </section>

        <section className="lp-feature-more">
          <div className="lp-feature-inner">
            <div className="lp-carousel-head">
              <p>{landingFeatures.length} funcionalidades</p>
              <div className="lp-carousel-nav">
                <button type="button" aria-label="Ver funcionalidades anteriores" onClick={() => scrollBy(-1)}><ChevronLeft /></button>
                <button type="button" aria-label="Ver funcionalidades seguintes" onClick={() => scrollBy(1)}><ChevronRight /></button>
              </div>
            </div>
            <div className="lp-carousel-track" ref={trackRef}>
              {landingFeatures.map((feature) => (
                <Link key={feature.slug} to="/funcionalidades/$slug" params={{ slug: feature.slug }} className="lp-feature-card">
                  <strong>{feature.menuTitle}</strong>
                  <span>{feature.menuCopy}</span>
                  <ul>{feature.highlights.slice(0, 3).map((item) => <li key={item}><Check aria-hidden="true" /><span>{item}</span></li>)}</ul>
                  <em>Saber mais <ArrowRight aria-hidden="true" /></em>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
