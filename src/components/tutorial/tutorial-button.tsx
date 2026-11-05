/**
 * O botão «Tutorial» das páginas principais e o diálogo onde o tutorial animado corre. Na primeira
 * visita a cada página com tutorial, abre sozinho (uma vez por browser). O leitor e as capturas só
 * se descarregam quando o diálogo abre.
 */
import { GraduationCap } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { TutorialId } from "@/components/tutorial/tutorial-routes";

const TutorialPlayer = lazy(() => import("@/components/tutorial/tutorial-player"));

const seenKey = (id: TutorialId) => `nw-tutorial-${id}`;

export function TutorialButton({ id, compact = false }: { id: TutorialId; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(seenKey(id)) === "1";
    } catch {
      // Sem acesso ao armazenamento: não abre sozinho.
    }
    if (seen) return;
    const timer = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(timer);
  }, [id]);

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) {
      try {
        localStorage.setItem(seenKey(id), "1");
      } catch {
        // Fica por marcar: volta a abrir na próxima visita.
      }
    }
  };

  return (
    <>
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "default"}
        className={compact ? "size-8 shrink-0" : undefined}
        onClick={() => setOpen(true)}
        aria-label="Ver o tutorial desta página"
        title="Tutorial"
      >
        <GraduationCap />
        {compact ? null : "Tutorial"}
      </Button>
      <Dialog open={open} onOpenChange={change}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-[880px] gap-0 overflow-y-auto p-0 sm:p-0">
          {open && (
            <Suspense fallback={<div className="showreel-stage aspect-[16/10] w-full" />}>
              <TutorialPlayer id={id} onDone={() => change(false)} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
