# Knowledgemaster

Your AI-powered personal knowledge library. Save links from anywhere (web, browser extension, Telegram bot), let AI auto-title / summarize / tag them, and rediscover them later with search, filters, and a 3D topic graph.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, TanStack Router + Start
- **UI:** Tailwind CSS v4, shadcn/ui (Radix), Lucide icons
- **3D visualization:** three.js, react-force-graph-3d
- **Backend:** Supabase (Postgres + Auth + Row-Level Security)
- **AI:** Google Gemini via the OpenAI-compatible endpoint (swappable to any
  OpenAI-compatible provider via `AI_BASE_URL`)
- **Package manager:** Bun

## Self-hosted setup

This project is fully self-hosted: you bring your own Supabase project and your
own Google AI Studio API key. There is no external SaaS dependency.

See **[SETUP.md](./SETUP.md)** for a step-by-step Bangla guide. Quick version:

```bash
# 1. Install dependencies
bun install

# 2. Copy the env template and fill in your own keys
cp .env.example .env
$EDITOR .env

# 3. Apply database migrations to your Supabase project
#    (Supabase Dashboard → SQL editor → paste each file in supabase/migrations/)

# 4. Run the dev server
bun run dev
```

## Saving links

Three input methods, all backed by the same database:

1. **Web UI** — paste a URL on the Library page.
2. **Browser extension** — load `extension/` as an unpacked Chrome extension,
   configure your app URL and API token in the popup, then click to save the
   current tab.
3. **Telegram bot** — create a bot via @BotFather, paste the token into
   Settings, and forward links to the bot.

## License

MIT
