
# Xenonowledge — Full MVP Build Plan

A clean, technical, slightly futuristic AI link librarian. TanStack Start + Lovable Cloud, emerald/teal palette, Poppins + JetBrains Mono, full light/dark.

## 1. Backend (Lovable Cloud / Supabase)

Enable Lovable Cloud, then provision schema via migration:

- `profiles` — id (FK auth.users), username (unique), email, avatar_url, created_at
- `collections` — id, owner_id, name, slug, description, is_public, share_token, created_at
- `links` — id, owner_id, url, normalized_url, domain, title, summary, content_type (article|video|repo|docs|tool|thread|other), status (pending|ready|failed), tags text[], pinned bool, source (manual|telegram|import), error_message, fetched_at, created_at, updated_at, deleted_at (nullable)
- `collection_links` — collection_id, link_id, added_at (composite PK)
- `analytics_events` — id, owner_id, event, payload jsonb, created_at

RLS: every table scoped to `auth.uid() = owner_id` (collections also allow public read where `is_public = true`). Trigger to auto-create `profiles` row on signup. Realtime enabled on `links` and `collections`.

Auth: email/password + Google (via Lovable broker). `/reset-password` route handles recovery flow.

## 2. Routing (TanStack file routes)

```
src/routes/
  __root.tsx              shell + ThemeProvider + QueryClient + Sonner + auth listener
  index.tsx               redirects to /library
  auth.tsx                sign in / sign up tabs, Google button
  reset-password.tsx
  _authenticated.tsx      beforeLoad gate -> /auth if no session
  _authenticated/library.tsx
  _authenticated/dashboard.tsx
  _authenticated/discover.tsx
  _authenticated/knowledge.tsx
  _authenticated/analytics.tsx
  _authenticated/digest.tsx
  _authenticated/settings.tsx
  profile.$username.tsx   public profile
  shared.$collectionId.tsx public shared collection
```

Each route gets its own `head()` (title, description, og:title/description, canonical). 404 via root `notFoundComponent`.

## 3. Design System

`src/styles.css` — replace tokens with HSL variables matching spec:

```
:root {
  --background: 0 0% 98%;
  --foreground: 220 13% 15%;
  --card: 0 0% 100%;
  --primary: 160 84% 32%;
  --border: 220 10% 88%;
  /* + popover, muted, accent, ring, secondary, destructive */
  --radius: 1rem;
  --font-sans: 'Poppins', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
.dark { background 220 13% 9%; foreground 210 17% 90%; card 220 13% 12%; primary 160 84% 39%; border 220 10% 20%; }
```

Animations (keyframes in styles.css): `fade-in`, `scale-in`, `slide-up`, `slide-in-right`, `shimmer`, `float`, `pulse-glow`, `gradient-shift`.

Global: glassy sticky headers (`backdrop-blur` + `bg-background/70`), `rounded-2xl` cards (1rem), `border-border/50`, hover elevation, h-9 inputs, mono labels, compact icon buttons with `hover:bg-primary/10 hover:text-primary`.

`next-themes` via custom ThemeProvider; `ThemeToggle` component.

## 4. Library Page (the centerpiece)

Desktop 3-panel grid (`lg:grid-cols-[260px_1fr_420px]`), mobile single-column with right panel as `Sheet`.

### Left sidebar (`FilterSidebar` + `CollectionManager`)
- Logo wordmark + user email
- Nav: Library, Dashboard, Discover, Knowledge, Analytics, Digest, Settings
- Collection selector (CollectionManager: create, rename, delete, share, move-to-all, re-analyze)
- Stats cards grid (2 cols): All, Pending, Ready, Failed, Duplicates, Deleted — counts from React Query
- Filters: content type, status, sort, pinned-only switch
- Bottom row: refresh, theme toggle, settings, sign out
- Collapsible — `useLocalStorage('xn:sidebar-collapsed')`

### Center panel
- Sticky toolbar (glassy):
  - `AddLinkInput` (single or newline-separated multi)
  - Search input mono, placeholder `Search links... (press /)`, 300ms debounce
  - Toggle list/grid (`useLocalStorage('xn:view')`)
  - Show/hide numbers (`useLocalStorage('xn:numbers')`)
  - Buttons: Select mode, Smart search, Discover, Knowledge, Health check, Refresh
- `LinkSection` × 3: Ready / Pending / Failed (collapsible, count badges)
- Cards: `LinkCard` (list) / `LinkGridCard` (grid) — favicon, title, domain, summary preview, tag chips, pinned star, status pill, timestamps, hover actions
- Empty state: floating low-opacity logo (`animate-float`), "No links yet" + helper copy
- Skeleton shimmer while loading

### Right panel (`LinkDetailPanel` wraps `LinkDetail`)
- Slides in (`animate-slide-in-right`), full link metadata, edit tags inline, retry analysis, pin, delete, "similar links" via `SimilarLinks`
- Mobile: opens as `Sheet` from right

### Bulk + recycle bin
- Select mode: checkbox per card, action bar (delete, add tag, add to collection)
- `RecycleBinView` modal: restore / permanent delete / empty trash
- `FailedLinkReviewDialog`, `ImportDialog`, `ExportDialog`, `SmartSearchDialog`, `KeyboardShortcutsHelp`, `AddToCollectionMenu`

### Keyboard shortcuts (`useKeyboardShortcuts` hook)
`/` focus search · ↑/↓ navigate · Enter open · Esc close · `g` toggle grid · `?` shortcuts help

### Realtime
Subscribe to `links` channel in `useEffect`; on insert/update/delete invalidate query and toast via sonner.

## 5. Other Routes (functional, not stubs)

- **/dashboard** — overview cards (counts, recent activity, weekly trend)
- **/discover** — trending domains/tags from user's library + suggested links
- **/knowledge** — `KnowledgeGraph` (2D, react-force-graph-2d) + `KnowledgeReport` summary; `KnowledgeGraph3D` lazy-loaded with toggle (uses react-force-graph-3d)
- **/analytics** — recharts: links over time, by content type, by domain, top tags
- **/digest** — weekly/monthly digest list with summaries
- **/settings** — profile, theme, telegram channel hint, danger zone
- **/profile/:username** — public profile + public collections
- **/shared/:collectionId** — public read-only collection view (no auth)

## 6. Data Layer (`src/lib/api/`)

`links.ts`, `collections.ts`, `profiles.ts`, `analytics.ts` — all wrapped as `createServerFn` with `requireSupabaseAuth` (or admin/public for shared routes). Query keys: `['links', filters]`, `['collections-list']`, `['collection-links', id]`, `['deleted-links']`. Mutations invalidate relevant keys; optimistic for pin/delete.

Default library query: `source = 'manual' AND deleted_at IS NULL`. Selecting a collection switches to `collection_links` join including all sources.

Add link: insert with `status='pending'`. (AI analysis hook stubbed — flips to `ready` with mocked title/summary/tags after fetch via Lovable AI Gateway in a follow-up; UI fully handles all three statuses today.)

## 7. Components index

`src/components/`
- `library/` — AddLinkInput, LinkCard, LinkGridCard, LinkSection, LinkDetail, LinkDetailPanel, FilterSidebar, CollectionManager, AddToCollectionMenu, ImportDialog, ExportDialog, FailedLinkReviewDialog, RecycleBinView, KeyboardShortcutsHelp, SmartSearchDialog, SimilarLinks, HealthStatusIndicator
- `knowledge/` — KnowledgeGraph, KnowledgeGraph3D (lazy), KnowledgeReport
- `theme/ThemeToggle`, `theme/ThemeProvider`
- `Seo.tsx` (route-level head helper used inside `head()` factory)

## 8. Dependencies to install

`next-themes`, `recharts`, `react-force-graph-2d`, `react-force-graph-3d`, `three`, `date-fns`, `cmdk` (already via shadcn), `@tanstack/react-query` (present).

## 9. SEO

Each route's `head()` returns title + description + og + canonical. Library: "Library — Xenonowledge" / spec description. Root: site-wide og:type=website, JSON-LD WebSite/Organization.

## 10. Sequencing inside the build

1. Enable Lovable Cloud + migration + RLS + trigger
2. Tokens, fonts, animations, ThemeProvider
3. Auth + `_authenticated` gate + reset-password
4. API layer (server fns)
5. Library page (sidebar → center → detail panel → realtime → shortcuts → bulk → recycle bin → dialogs)
6. Other routes
7. SEO + 404 polish + responsive QA in preview at desktop + mobile widths

## Technical notes

- Use TanStack Router `<Link>` everywhere; no react-router-dom.
- Wrap `<Outlet/>` in QueryClientProvider + ThemeProvider + Sonner Toaster in `__root.tsx`.
- `attachSupabaseAuth` middleware in `src/start.ts` so protected server fns get the bearer token.
- `_authenticated.tsx` `beforeLoad` calls `supabase.auth.getUser()` and redirects to `/auth` if missing — prevents loader 401s.
- Realtime subscription lives once at the library route component, cleaned up on unmount.
- Force-graph 3D imported via dynamic `import()` to keep the main bundle slim.
- LocalStorage keys namespaced `xn:*`.

This is large. Expect the first pass to ship the full library experience polished, with the auxiliary routes (dashboard/discover/knowledge/analytics/digest) functional but lighter; iterate on those after you see it live.
