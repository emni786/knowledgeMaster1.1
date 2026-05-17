import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash, randomBytes } from "crypto";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const listApiTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // api_tokens is auth-source — always on PUBLIC Supabase. RLS scopes
    // results to the current user via the JWT-bound publicClient.
    const { publicClient } = context;
    const { data, error } = await publicClient
      .from("api_tokens")
      .select("id, label, token_prefix, last_used_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tokens: data ?? [] };
  });

export const createApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ label: z.string().min(1).max(60).default("Browser extension") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // api_tokens is auth-source — always on PUBLIC Supabase.
    const { publicClient, userId } = context;
    const raw = "km_" + randomBytes(24).toString("hex");
    const token_hash = hashToken(raw);
    const token_prefix = raw.slice(0, 10);
    const { error } = await publicClient
      .from("api_tokens")
      .insert({ owner_id: userId, token_hash, token_prefix, label: data.label });
    if (error) throw new Error(error.message);
    return { token: raw, token_prefix };
  });

export const revokeApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // api_tokens is auth-source — always on PUBLIC Supabase.
    const { publicClient } = context;
    const { error } = await publicClient.from("api_tokens").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
