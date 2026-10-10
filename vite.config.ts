// Configuração Vite própria do Novawebinar:
// Tailwind, tsconfig paths, TanStack Start (entrada SSR em src/server.ts),
// Nitro só no build, React, alias "@", VITE_* como constantes e dev server na porta 8080.
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  // VITE_* do .env como constantes de compilação, no cliente e no servidor.
  const define = Object.fromEntries(
    Object.entries(loadEnv(mode, process.cwd(), "VITE_")).map(([key, value]) => [
      `import.meta.env.${key}`,
      JSON.stringify(value),
    ]),
  );

  return {
    define,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
      ignoreOutdatedRequests: true,
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Entrada SSR própria (src/server.ts) que embrulha os erros catastróficos.
        server: { entry: "server" },
      }),
      // Nitro só no build, como antes: em dev o TanStack Start serve directamente.
      // No Vercel (VERCEL=1 no build) sai no formato dele; fora dele, servidor Node.
      ...(command === "build" ? [nitro({ preset: process.env["VERCEL"] ? "vercel" : "node-server" })] : []),
      viteReact(),
    ],
  };
});
