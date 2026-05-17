// Server functions for admin-managed runtime settings.
//
// All mutations check `context.isAdmin` (set by the auth middleware based on
// the ADMIN_EMAIL env var) and use the service-role client to bypass RLS for
// the actual write. RLS on `admin_settings` still protects against direct API
// access from non-admin clients.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicAdmin } from "@/integrations/supabase/dual-client.server";
import { invalidateAdminSettingsCache, readAdminSettings } from "@/lib/runtime-config";

// Sentinel returned for sensitive fields (e.g. the AI key) so the client never
// sees the raw stored secret. The presence of the sentinel still tells the UI
// "a value is configured" so it can render a placeholder.
const MASK = "********";

export interface AdminStatus {
  isAdmin: boolean;
  adminEmailConfigured: boolean;
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => {
    return {
      isAdmin: context.isAdmin,
      adminEmailConfigured: Boolean(process.env.ADMIN_EMAIL?.trim()),
    } satisfies AdminStatus;
  });

export interface AdminSettingsView {
  has_google_ai_api_key: boolean;
  ai_base_url: string | null;
  ai_model: string | null;
  public_app_url: string | null;
  updated_at: string | null;
}

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.isAdmin) {
      throw new Error("Forbidden: admin access required");
    }
    const s = await readAdminSettings(true);
    return {
      has_google_ai_api_key: Boolean(s.google_ai_api_key && s.google_ai_api_key.length > 0),
      ai_base_url: s.ai_base_url,
      ai_model: s.ai_model,
      public_app_url: s.public_app_url,
      updated_at: s.updated_at,
    } satisfies AdminSettingsView;
  });

const UpdateInput = z
  .object({
    // Optional fields — `undefined` = leave alone, `""` = clear it, otherwise update.
    google_ai_api_key: z.string().trim().max(500).optional(),
    ai_base_url: z.string().trim().max(500).optional(),
    ai_model: z.string().trim().max(200).optional(),
    public_app_url: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateAdminSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) {
      throw new Error("Forbidden: admin access required");
    }

    // Build a patch where:
    //  - undefined fields are omitted (no change)
    //  - empty strings clear the value (null)
    //  - the sentinel mask for the AI key means "don't touch" (UI sends MASK when
    //    user didn't enter a new key)
    const patch: Record<string, string | null> = {};
    const set = (key: string, value: string | undefined, allowMask = false) => {
      if (value === undefined) return;
      if (allowMask && value === MASK) return;
      patch[key] = value === "" ? null : value;
    };
    set("google_ai_api_key", data.google_ai_api_key, true);
    set("ai_base_url", data.ai_base_url);
    set("ai_model", data.ai_model);
    set("public_app_url", data.public_app_url);

    if (Object.keys(patch).length === 0) {
      return { ok: true, updated: 0 };
    }

    // admin_settings is shared (auth-source) — always on PUBLIC Supabase
    // regardless of which user is editing it.
    const { error } = await publicAdmin
      .from("admin_settings" as never)
      .update({ ...patch, updated_by: context.userId } as never)
      .eq("id", 1);

    if (error) throw new Error(error.message);

    invalidateAdminSettingsCache();
    return { ok: true, updated: Object.keys(patch).length };
  });
