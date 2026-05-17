// Server-side Supabase client. Re-exports `publicAdmin` from dual-client for
// backward compatibility — historically this exported a single service-role
// client. With dual-DB routing, `publicAdmin` is the PUBLIC Supabase
// service-role client (used for auth-source tables: profiles, api_tokens,
// telegram_bots, admin_settings, plus JWT verification helpers).
//
// For user data tables (links/collections/insights/...) use the routed
// `getDataClient(...)` helper from dual-client.server.ts instead.

import { publicAdmin } from "./dual-client.server";

/**
 * @deprecated Use `publicAdmin` from `dual-client.server` for auth-source
 * tables, or `getDataClient(ctx)` for user data tables. This alias is kept
 * so existing imports keep compiling during the dual-DB migration.
 */
export const supabaseAdmin = publicAdmin;
