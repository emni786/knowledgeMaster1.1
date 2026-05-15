// Runtime configuration helpers.
//
// Values can be set in two places, in order of precedence:
//   1. `admin_settings` row in the database (edited via the in-app admin UI)
//   2. process.env (fallback — useful for first boot before the admin has
//      logged in and saved anything via the UI)
//
// All reads bypass RLS by using the service-role client. That's safe because
// these helpers run only on the server and never expose the raw values to
// browsers — they're used internally to make AI calls and build Telegram
// webhook URLs.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface AdminSettings {
  google_ai_api_key: string | null;
  ai_base_url: string | null;
  ai_model: string | null;
  public_app_url: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

let cached: { value: AdminSettings; at: number } | null = null;
const CACHE_TTL_MS = 5_000;

/**
 * Read the singleton admin_settings row. Cached for a few seconds to avoid
 * hammering the DB on every AI / webhook call.
 */
export async function readAdminSettings(force = false): Promise<AdminSettings> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const { data, error } = await supabaseAdmin
    .from("admin_settings" as never)
    .select("google_ai_api_key, ai_base_url, ai_model, public_app_url, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[admin_settings] read failed:", error.message);
  }

  const value: AdminSettings = (data as AdminSettings | null) ?? {
    google_ai_api_key: null,
    ai_base_url: null,
    ai_model: null,
    public_app_url: null,
    updated_at: null,
    updated_by: null,
  };
  cached = { value, at: Date.now() };
  return value;
}

/** Invalidate the in-process cache; call after an admin UI save. */
export function invalidateAdminSettingsCache(): void {
  cached = null;
}

/** Pick the first non-empty value (string or null) — DB wins, env loses. */
function pick(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

export interface ResolvedConfig {
  googleAiApiKey: string | null;
  aiBaseUrl: string | null;
  aiModel: string | null;
  publicAppUrl: string | null;
}

/** DB-first, env-fallback view of all runtime-configurable values. */
export async function resolveRuntimeConfig(): Promise<ResolvedConfig> {
  const s = await readAdminSettings();
  return {
    googleAiApiKey: pick(s.google_ai_api_key, process.env.GOOGLE_AI_API_KEY),
    aiBaseUrl: pick(s.ai_base_url, process.env.AI_BASE_URL),
    aiModel: pick(s.ai_model, process.env.AI_MODEL),
    publicAppUrl: pick(s.public_app_url, process.env.PUBLIC_APP_URL),
  };
}
