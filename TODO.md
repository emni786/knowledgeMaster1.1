# KnowledgeMaster TODO

- [x] Part 1: Auth Architecture fix — `client.ts` → PUBLIC, `getDataClient()` routing, JWT verified against PUBLIC, `isPersonalAdmin`/`isAdmin` separate ✅ (code in main)
- [x] Part 2: Admin Settings UI — orange-border section with AI key, model, base URL, public app URL ✅ (code in main)
- [x] Part 3: User Management UI — total count, user table, is_admin toggle, revoke ✅ (code in main)
- [x] Part 4: Supabase Migration — `get_all_users()` RPC + service_role lockdown ✅ (migration exists)
- [x] Part 5: AI Key Resolution — DB `admin_settings` → env → disabled priority ✅ (code in main)
- [x] Part 6: Data Isolation Verification — `getDataClient`, manual scoping, RLS ✅ (code in main)
- [x] Part 7: Vercel Deploy Guide — `VERCEL_DEPLOY.md` + `.env.example` updated ✅ (files exist)
