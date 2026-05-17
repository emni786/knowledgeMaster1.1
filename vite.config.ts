import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { nitro } from "nitro/vite";

// Dual build target:
// - Cloudflare Workers (default): @cloudflare/vite-plugin + src/server.cloudflare.ts entry.
// - Vercel (when VERCEL env var is set during build): nitro/vite plugin produces
//   .vercel/output/ which Vercel deploys as a serverless function + static assets.
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
    tanstackStart({
      // Use custom SSR error wrapper for Cloudflare Workers; default Nitro entry on Vercel.
      server: process.env.VERCEL ? undefined : { entry: "server.cloudflare" },
    }),
    viteReact(),
    // Production build plugins, chosen by target:
    ...(command === "build" && !process.env.VERCEL ? [cloudflare()] : []),
    ...(command === "build" && process.env.VERCEL ? [nitro()] : []),
  ],
}));
