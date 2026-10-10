import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/auth-screen";
export const Route = createFileRoute("/auth/reset")({
  head: () => ({
    meta: [
      { title: "Recuperar acesso | Novawebinar" },
      { name: "description", content: "Recupere o acesso à Novawebinar." },
      { property: "og:title", content: "Recuperar acesso | Novawebinar" },
      { property: "og:description", content: "Recupere a sua palavra-passe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AuthScreen mode="reset" />,
});
