import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  publicAdmin,
  getDataClient,
  dataClientNeedsManualScoping,
  isAdminEmail,
} from "./dual-client.server";
import type { Database } from "./types";

// In-process cache keyed by user id so we don't re-read the profile row on
// every authenticated request. Re-checked every 30 seconds so admin grant/
// revoke toggles propagate quickly.
const adminCheckCache = new Map<string, { isAdmin: boolean; at: number }>();
const ADMIN_CHECK_INTERVAL_MS = 30_000;

/**
 * Resolve the caller's admin UI-access flag from the `profiles.is_admin`
 * column on PUBLIC Supabase. The configured `ADMIN_EMAIL` user is always
 * admin (we self-heal the flag here if it's somehow missing); other users
 * are admin only if a current admin has granted them via the User
 * Management UI.
 *
 * Returns:
 *   isPersonalAdmin — email matches ADMIN_EMAIL (routes data to PERSONAL)
 *   isAdmin         — has admin UI access (personal admin OR granted admin)
 */
async function resolveAdminFlags(
  userId: string,
  email: string | undefined | null,
): Promise<{ isPersonalAdmin: boolean; isAdmin: boolean }> {
  const isPersonalAdmin = isAdminEmail(email);

  const cached = adminCheckCache.get(userId);
  if (cached && Date.now() - cached.at < ADMIN_CHECK_INTERVAL_MS) {
    return { isPersonalAdmin, isAdmin: cached.isAdmin };
  }

  let isAdmin = isPersonalAdmin;
  try {
    // profiles lives on PUBLIC Supabase regardless of which user owns the row.
    const { data: profile } = await publicAdmin
      .from("profiles" as never)
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    const profileIsAdmin = (profile as { is_admin?: boolean } | null)?.is_admin === true;
    isAdmin = isPersonalAdmin || profileIsAdmin;

    // Self-heal: ensure the ADMIN_EMAIL user always has is_admin = true
    // (the trigger creates rows without this flag set, and the env can
    // change after a redeploy). Never auto-flip granted admins off.
    if (isPersonalAdmin && !profileIsAdmin) {
      await publicAdmin
        .from("profiles" as never)
        .update({ is_admin: true } as never)
        .eq("id", userId);
    }
    adminCheckCache.set(userId, { isAdmin, at: Date.now() });
  } catch (err) {
    console.error("[auth] admin flag resolve failed:", err);
  }

  return { isPersonalAdmin, isAdmin };
}

/** Invalidate the cached admin flag for a user (call after grant/revoke). */
export function invalidateAdminFlagCache(userId?: string): void {
  if (userId) adminCheckCache.delete(userId);
  else adminCheckCache.clear();
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. See SETUP.md to configure your Supabase project.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    // PUBLIC Supabase is the single auth source. The user's JWT is verified
    // against PUBLIC, and `publicClient` is bound to the user's JWT so
    // PUBLIC-RLS queries are auto-scoped to them.
    const publicClient: SupabaseClient<Database> = createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data, error } = await publicClient.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Error("Unauthorized: Invalid token");
    }

    if (!data.claims.sub) {
      throw new Error("Unauthorized: No user ID found in token");
    }

    const userId = data.claims.sub;
    const email = typeof data.claims.email === "string" ? data.claims.email : null;
    const { isPersonalAdmin, isAdmin } = await resolveAdminFlags(userId, email);

    // Resolve the data client based on personal-admin status + PERSONAL_* env.
    // Only the configured ADMIN_EMAIL user routes data to PERSONAL — granted
    // admins (is_admin=true with a different email) still use PUBLIC.
    const dataClient = getDataClient({ publicClient, isPersonalAdmin });
    const dataNeedsScoping = dataClientNeedsManualScoping({ publicClient, isPersonalAdmin });

    return next({
      context: {
        // Back-compat alias: `supabase` is the data client (personal admin →
        // PERSONAL service-role; everyone else → PUBLIC + user JWT with RLS).
        supabase: dataClient,
        // Auth-source client: PUBLIC + user JWT (RLS-bound). Use this for
        // profiles, api_tokens, telegram_bots, admin_settings reads. Writes
        // to these tables that require service-role should use `publicAdmin`
        // imported directly.
        publicClient,
        userId,
        email,
        claims: data.claims,
        /**
         * Has admin UI access. True for the ADMIN_EMAIL user AND any user
         * granted admin via the in-app User Management UI
         * (profiles.is_admin = true).
         */
        isAdmin,
        /**
         * Email matches the ADMIN_EMAIL env var. Only this user's data is
         * routed to PERSONAL Supabase. Granted admins (is_admin=true with
         * a different email) are false here.
         */
        isPersonalAdmin,
        /**
         * True when `supabase` is a service-role client (personal admin on
         * PERSONAL). Server functions MUST add `.eq("owner_id", userId)`
         * to all user-data queries when this is true, since RLS is bypassed.
         */
        dataNeedsScoping,
      },
    });
  },
);
