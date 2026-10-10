import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/auth-screen";
export const Route = createFileRoute("/auth/login")({
  head: () => ({
    meta: [
      { title: "Entrar | Novawebinar" },
      { name: "description", content: "Entre na sua conta Novawebinar." },
      { property: "og:title", content: "Entrar | Novawebinar" },
      { property: "og:description", content: "Aceda à sua conta Novawebinar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AuthScreen mode="login" />,
});
