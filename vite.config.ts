import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
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
      server: { entry: "server" },
    }),
    viteReact(),
    // The Cloudflare plugin is only needed for production builds targeting Workers.
    // Skip on Vercel (VERCEL env var is set by Vercel during build).
    ...(command === "build" && !process.env.VERCEL ? [cloudflare()] : []),
  ],
}));
