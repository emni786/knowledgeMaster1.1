// Dual-database client routing.
//
// Architecture:
//   - PUBLIC Supabase = single auth source + storage for all non-admin users.
//     Also hosts shared "auth-source" tables (profiles, api_tokens,
//     telegram_bots, admin_settings) regardless of which user owns the row.
//   - PERSONAL Supabase = admin's private data store. No auth happens here;
//     access is purely via the service-role key, with queries manually scoped
//     by owner_id (the admin's PUBLIC Supabase user id).
//
// At runtime, every authenticated server function gets two clients:
//   * publicAdminClient — used for auth-source tables (always PUBLIC)
//   * dataClient — used for user data (links/collections/insights/...).
//     Resolves to PERSONAL service-role client for the admin, or the
//     user-JWT-bound PUBLIC client (RLS enforced) for everyone else.
//
// Single-Supabase mode: if PERSONAL_* env vars are not set, the admin's data
// also lives on PUBLIC — `getPersonalAdminClient()` returns null and the
// auth middleware falls back to the user's RLS-bound PUBLIC client for the
// admin too. This is the "1 URL, 1 Supabase" mode.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createServiceRoleClient(url: string, key: string): SupabaseClient<Database> {
  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _publicAdmin: SupabaseClient<Database> | undefined;
let _personalAdmin: SupabaseClient<Database> | undefined | null;

function getPublicAdminClient(): SupabaseClient<Database> {
  if (_publicAdmin) return _publicAdmin;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    const message = `Missing PUBLIC Supabase env var(s): ${missing.join(", ")}. See SETUP.md.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  _publicAdmin = createServiceRoleClient(url, key);
  return _publicAdmin;
}

/**
 * Returns the PERSONAL Supabase service-role client if PERSONAL_* env vars
 * are configured, otherwise null (single-Supabase mode).
 */
function getPersonalAdminClient(): SupabaseClient<Database> | null {
  if (_personalAdmin !== undefined) return _personalAdmin;

  const url = process.env.PERSONAL_SUPABASE_URL;
  const key = process.env.PERSONAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    _personalAdmin = null;
    return null;
  }
  _personalAdmin = createServiceRoleClient(url, key);
  return _personalAdmin;
}

/**
 * Lazy proxy for the PUBLIC service-role client. Use for auth-source tables
 * (profiles, api_tokens, telegram_bots, admin_settings) regardless of user.
 */
export const publicAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    return Reflect.get(getPublicAdminClient(), prop, receiver);
  },
});

/**
 * True iff dual-DB routing is enabled (PERSONAL_* env vars set).
 */
export function isPersonalRoutingEnabled(): boolean {
  return getPersonalAdminClient() !== null;
}

/**
 * Check whether the given email is the configured admin.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const user = email?.trim().toLowerCase();
  return Boolean(admin && user && admin === user);
}

export interface DataClientContext {
  /** User-JWT-bound PUBLIC client (RLS enforced). Always present. */
  publicClient: SupabaseClient<Database>;
  /** True when caller is the ADMIN_EMAIL user. */
  isAdmin: boolean;
}

/**
 * Returns the right Supabase client for user data tables (links, collections,
 * insights, etc.).
 *
 * - If caller is admin AND PERSONAL_* env vars are configured: returns the
 *   PERSONAL service-role client. Queries MUST manually scope by owner_id —
 *   service-role bypasses RLS.
 * - Otherwise: returns the user-JWT-bound PUBLIC client. RLS will enforce
 *   owner_id automatically.
 */
export function getDataClient(ctx: DataClientContext): SupabaseClient<Database> {
  if (ctx.isAdmin) {
    const personal = getPersonalAdminClient();
    if (personal) return personal;
  }
  return ctx.publicClient;
}

/**
 * True when the resolved data client is service-role (admin on PERSONAL).
 * Server functions use this to know whether they must add a manual
 * `.eq("owner_id", userId)` filter.
 */
export function dataClientNeedsManualScoping(ctx: DataClientContext): boolean {
  return ctx.isAdmin && getPersonalAdminClient() !== null;
}

/**
 * For public (no-JWT) API routes — given a known owner user id from a lookup
 * on an auth-source table (api_tokens / telegram_bots, both on PUBLIC), pick
 * the right data client for that owner's data writes/reads.
 *
 * Returns PERSONAL service-role client when the owner is the configured
 * ADMIN_EMAIL user and PERSONAL_* env vars are set; otherwise returns the
 * PUBLIC service-role client (since these public routes have no JWT, RLS
 * cannot be used; queries already pass owner_id explicitly).
 */
export async function getDataClientForOwnerId(ownerId: string): Promise<SupabaseClient<Database>> {
  if (!isPersonalRoutingEnabled()) return getPublicAdminClient();
  try {
    const { data, error } = await getPublicAdminClient().auth.admin.getUserById(ownerId);
    if (error || !data?.user) return getPublicAdminClient();
    if (isAdminEmail(data.user.email)) {
      const personal = getPersonalAdminClient();
      if (personal) return personal;
    }
  } catch {
    /* fall through to public */
  }
  return getPublicAdminClient();
}
