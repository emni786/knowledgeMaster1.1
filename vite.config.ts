import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Single build target: Vercel via Nitro. Cloudflare Workers support was
// intentionally removed — the Workers deploy was being served as a static
// app (no SSR / no server functions) which broke the auth + AI flows. All
// production traffic goes through Vercel now.
export default defineConfig(({ command }) => ({
  server: {
    host: true,
    port: 8080,
    strictPort: false,
  },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-start",
      "@tanstack/react-query",
    ],
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    ...(command === "build" ? [nitro()] : []),
  ],
}));
