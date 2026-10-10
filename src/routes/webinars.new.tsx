import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/page-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidate, useWorkspace } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/webinars/new")({
  head: () => ({
    meta: [
      { title: "Criar webinar | Novawebinar" },
      { name: "description", content: "Configure um novo webinar no estúdio Novawebinar." },
      { property: "og:title", content: "Criar webinar | Novawebinar" },
      { property: "og:description", content: "Crie uma nova experiência de webinar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewWebinar,
});

/**
 * A criação abre diretamente o estúdio completo (o mesmo do editar),
 * para que a experiência seja sempre idêntica: criamos um rascunho
 * e redirecionamos para o editor com todos os passos disponíveis.
 */
function NewWebinar() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: workspace } = useWorkspace();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !workspace) return;
    started.current = true;

    const create = async () => {
      try {
        const base = "novo-webinar";
        const { data: webinar, error } = await supabase
          .from("webinars")
          .insert({
            organization_id: workspace.organizationId,
            created_by: workspace.userId,
            internal_name: "Novo webinar",
            // Começa do zero: a pré-visualização mostra só o que se vai preenchendo.
            public_title: "",
            slug: `${base}-${Math.random().toString(36).slice(2, 7)}`,
            status: "draft",
            // A sala segue o tema de quem vê, até o apresentador escolher outro.
            room_theme_system: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        invalidate(["webinars"]);
        await navigate({
          to: "/webinars/$webinarId/edit",
          params: { webinarId: webinar.id },
          replace: true,
        });
      } catch (error) {
        started.current = false;
        toast.error(friendlyError(error, "Não foi possível criar o webinar."));
      }
    };

    void create();
  }, [workspace, navigate, invalidate]);

  return (
    <AppShell
      title="Criar novo webinar"
      description="Estúdio de configuração do webinar."
      action={false}
      compact
    >
      <PageSkeleton variant="editor" className="min-h-[50vh]" />
    </AppShell>
  );
}
