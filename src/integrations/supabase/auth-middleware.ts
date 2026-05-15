import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./client.server";
import type { Database } from "./types";

// In-process cache keyed by user id so we don't hit the DB to re-sync the
// admin flag on every authenticated request. Re-checked every 5 minutes,
// which is plenty to pick up an ADMIN_EMAIL env change after a redeploy.
const adminSyncCache = new Map<string, number>();
const ADMIN_SYNC_INTERVAL_MS = 5 * 60_000;

async function syncAdminFlag(userId: string, email: string | undefined | null): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = email?.trim().toLowerCase();
  const shouldBeAdmin = Boolean(adminEmail && userEmail && adminEmail === userEmail);

  const lastSync = adminSyncCache.get(userId);
  if (lastSync && Date.now() - lastSync < ADMIN_SYNC_INTERVAL_MS) {
    return shouldBeAdmin;
  }

  try {
    await supabaseAdmin
      .from("profiles" as never)
      .update({ is_admin: shouldBeAdmin } as never)
      .eq("id", userId);
    adminSyncCache.set(userId, Date.now());
  } catch (err) {
    console.error("[auth] admin flag sync failed:", err);
  }

  return shouldBeAdmin;
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

    const supabase = createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
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
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Error("Unauthorized: Invalid token");
    }

    if (!data.claims.sub) {
      throw new Error("Unauthorized: No user ID found in token");
    }

    const userId = data.claims.sub;
    const email = typeof data.claims.email === "string" ? data.claims.email : null;
    const isAdmin = await syncAdminFlag(userId, email);

    return next({
      context: {
        supabase,
        userId,
        claims: data.claims,
        isAdmin,
      },
    });
  },
);
