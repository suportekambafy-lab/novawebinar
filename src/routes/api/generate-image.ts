import { createFileRoute } from "@tanstack/react-router";

/**
 * Geração de imagens para capas, oferta e produto, pela camada própria de IA.
 * Devolve os acontecimentos da geração em streaming para o editor mostrar a
 * imagem a formar-se; com `stream: false` devolve apenas o resultado final.
 * Só para utilizadores autenticados: a chave do fornecedor nunca sai do servidor.
 */
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireRouteUser } = await import("@/integrations/supabase/route-auth");
        const auth = await requireRouteUser(request);
        if (!auth.ok) return auth.response;

        let body: { prompt?: unknown; stream?: unknown; organizationId?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Pedido inválido.", { status: 400 });
        }
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        const stream = body.stream !== false;
        if (prompt.length < 3) return new Response("Descrição em falta.", { status: 400 });

        // Quem paga: o espaço de trabalho em que a pessoa está, desde que lhe
        // pertença; o pedido só escolhe entre as organizações de quem pede.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: memberships, error: membershipError } = await supabaseAdmin
          .from("organization_members")
          .select("organization_id, role")
          .eq("user_id", auth.userId)
          .order("created_at", { ascending: true });
        if (membershipError) return new Response("Temporariamente indisponível.", { status: 503 });
        // Pedida uma organização que não é desta pessoa: recusa (antes cobrava em silêncio a primeira).
        const membership = body.organizationId
          ? memberships.find((m) => m.organization_id === body.organizationId)
          : memberships[0];
        if (!membership) return new Response("Sem acesso a esta organização.", { status: 403 });
        // A função «suporte» não gasta créditos da conta.
        if (membership.role === "support") return new Response("Sem permissão para gerar imagens.", { status: 403 });

        const { generateImage } = await import("@/lib/ai/gateway.server");
        const { NoCreditsError, runBilled } = await import("@/lib/ai/billing.server");
        let result;
        try {
          result = await runBilled(
            { organizationId: membership.organization_id, action: "image" },
            () => generateImage({ prompt: prompt.slice(0, 4000), stream }),
          );
        } catch (error) {
          if (error instanceof NoCreditsError) return new Response(error.message, { status: 402 });
          throw error;
        }
        if (!result.ok) {
          console.error(`[generate-image] ${result.code} ${result.status ?? ""} ${result.detail ?? ""}`);
          return new Response(result.reason, { status: result.status ?? 500 });
        }

        return new Response(result.body, {
          headers:
            result.contentType === "text/event-stream"
              ? { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
              : { "Content-Type": "application/json" },
        });
      },
    },
  },
});
