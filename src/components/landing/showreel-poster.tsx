/**
 * A capa da apresentação do hero (landing/showreel.tsx): o painel em perspectiva. Vem num ficheiro à
 * parte para a página a mostrar logo, sem carregar a apresentação, que chega depois.
 */
import { Play } from "lucide-react";
import painel from "@/assets/landing/painel.webp";

/** O evento que o botão «Ver apresentação» envia para recomeçar do início. */
export const SHOWREEL_PLAY_EVENT = "novawebinar:showreel-play";

/** A capa: o painel em perspectiva, enquanto a apresentação carrega (também serve sem JavaScript). */
export function ShowreelPoster({ onPlay }: { onPlay?: (() => void) | undefined }) {
  return (
    <div className="showreel-stage absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-[12%] top-[20%]" style={{ perspective: 1600 }}>
        <div style={{ transform: "rotateX(22deg) translateY(12%) scale(.92)", transformOrigin: "50% 0" }}>
          <figure className="site-browser">
            <div className="site-browser-bar" aria-hidden="true">
              <span />
              <span />
              <span />
              <i>app.novawebinar.com</i>
            </div>
            <img src={painel} alt="" width={1600} height={1000} decoding="async" />
          </figure>
        </div>
      </div>
      <p className="absolute inset-x-0 top-[7%] px-4 text-center text-[clamp(1rem,3.2vw,2.2rem)] font-semibold text-[#0d0d0f]">
        Transforma apresentações em resultados.
      </p>
      {onPlay && (
        <button
          type="button"
          onClick={onPlay}
          className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#111] shadow-[0_20px_50px_-20px_rgba(0,0,0,.5)] ring-1 ring-black/5"
          aria-label="Ver apresentação"
        >
          <Play className="size-6 translate-x-0.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
