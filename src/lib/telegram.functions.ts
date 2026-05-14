import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";

const TG_API = "https://api.telegram.org";

function publicWebhookUrl(host: string, botId: string): string {
  return `https://${host}/api/public/telegram/webhook/${botId}`;
}

export const listTelegramBots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("telegram_bots" as never)
      .select("id, bot_username, bot_id, active, last_error, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { bots: (data ?? []) as Array<{
      id: string; bot_username: string | null; bot_id: number | null;
      active: boolean; last_error: string | null; created_at: string;
    }> };
  });

export const addTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      bot_token: z.string().trim().regex(/^\d{6,}:[A-Za-z0-9_-]{20,}$/, "Invalid bot token format"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate token via getMe
    const meRes = await fetch(`${TG_API}/bot${data.bot_token}/getMe`);
    const meJson = await meRes.json() as { ok: boolean; result?: { id: number; username?: string }; description?: string };
    if (!meRes.ok || !meJson.ok || !meJson.result) {
      throw new Error(meJson.description || "Telegram rejected the token");
    }

    const { data: row, error } = await supabase
      .from("telegram_bots" as never)
      .insert({
        owner_id: userId,
        bot_token: data.bot_token,
        bot_username: meJson.result.username ?? null,
        bot_id: meJson.result.id,
      } as never)
      .select("id, webhook_secret")
      .single();
    if (error) throw new Error(error.message);
    const created = row as unknown as { id: string; webhook_secret: string };

    // Register webhook with Telegram
    const host = getRequestHost();
    const url = publicWebhookUrl(host, created.id);
    const setRes = await fetch(`${TG_API}/bot${data.bot_token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: created.webhook_secret,
        allowed_updates: ["message", "edited_message", "channel_post"],
      }),
    });
    const setJson = await setRes.json() as { ok: boolean; description?: string };
    if (!setJson.ok) {
      await supabase
        .from("telegram_bots" as never)
        .update({ last_error: setJson.description ?? "setWebhook failed" } as never)
        .eq("id", created.id);
      throw new Error(setJson.description || "Failed to register webhook with Telegram");
    }

    return { id: created.id, username: meJson.result.username, webhookUrl: url };
  });

export const testTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("telegram_bots" as never)
      .select("bot_token, webhook_secret, id")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message || "Bot not found");
    const bot = row as unknown as { bot_token: string; webhook_secret: string; id: string };

    const host = getRequestHost();
    const expectedUrl = publicWebhookUrl(host, bot.id);

    const infoRes = await fetch(`${TG_API}/bot${bot.bot_token}/getWebhookInfo`);
    const infoJson = await infoRes.json() as {
      ok: boolean;
      description?: string;
      result?: {
        url?: string;
        has_custom_certificate?: boolean;
        pending_update_count?: number;
        last_error_date?: number;
        last_error_message?: string;
        last_synchronization_error_date?: number;
        ip_address?: string;
      };
    };
    if (!infoRes.ok || !infoJson.ok || !infoJson.result) {
      const msg = infoJson.description || "Failed to fetch webhook info";
      await supabase.from("telegram_bots" as never).update({ last_error: msg } as never).eq("id", bot.id);
      throw new Error(msg);
    }

    const info = infoJson.result;
    const urlMatches = info.url === expectedUrl;
    let repaired = false;

    if (!urlMatches) {
      const setRes = await fetch(`${TG_API}/bot${bot.bot_token}/setWebhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: expectedUrl,
          secret_token: bot.webhook_secret,
          allowed_updates: ["message", "edited_message", "channel_post"],
        }),
      });
      const setJson = await setRes.json() as { ok: boolean; description?: string };
      if (!setJson.ok) {
        const msg = setJson.description || "Failed to re-register webhook";
        await supabase.from("telegram_bots" as never).update({ last_error: msg } as never).eq("id", bot.id);
        throw new Error(msg);
      }
      repaired = true;
    }

    const lastError = info.last_error_message
      ? `${info.last_error_message}${info.last_error_date ? ` (${new Date(info.last_error_date * 1000).toISOString()})` : ""}`
      : null;

    await supabase
      .from("telegram_bots" as never)
      .update({ last_error: lastError } as never)
      .eq("id", bot.id);

    return {
      ok: true,
      repaired,
      expectedUrl,
      registeredUrl: info.url ?? null,
      pendingUpdates: info.pending_update_count ?? 0,
      lastErrorMessage: info.last_error_message ?? null,
      lastErrorDate: info.last_error_date ?? null,
      ipAddress: info.ip_address ?? null,
    };
  });

export const deleteTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("telegram_bots" as never)
      .select("bot_token")
      .eq("id", data.id)
      .single();
    const token = (row as unknown as { bot_token?: string } | null)?.bot_token;
    if (token) {
      await fetch(`${TG_API}/bot${token}/deleteWebhook`, { method: "POST" }).catch(() => {});
    }
    const { error } = await supabase.from("telegram_bots" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
