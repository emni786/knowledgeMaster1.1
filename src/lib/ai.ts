// Centralized AI client used by server functions and public API routes.
//
// Uses Google AI Studio's OpenAI-compatible endpoint by default so the existing
// chat/completions JSON payloads keep working. Override AI_BASE_URL / AI_MODEL
// in either `admin_settings` (via the in-app admin UI) or in process.env if you
// want to point at another OpenAI-compatible provider (OpenAI, OpenRouter, a
// local LLM, etc.) without touching call sites.
//
// Configuration sources (DB wins, env loses):
//   admin_settings.google_ai_api_key  →  process.env.GOOGLE_AI_API_KEY
//   admin_settings.ai_base_url        →  process.env.AI_BASE_URL
//   admin_settings.ai_model           →  process.env.AI_MODEL

import { resolveRuntimeConfig } from "@/lib/runtime-config";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  /** Force a JSON object response. Most callers want this. */
  jsonResponse?: boolean;
  /** Optional per-call overrides. */
  model?: string;
  signal?: AbortSignal;
}

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export async function getAIConfig(): Promise<AIConfig | null> {
  const cfg = await resolveRuntimeConfig();
  if (!cfg.googleAiApiKey) return null;
  return {
    apiKey: cfg.googleAiApiKey,
    baseUrl: (cfg.aiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: cfg.aiModel ?? DEFAULT_MODEL,
  };
}

export async function requireAIConfig(): Promise<AIConfig> {
  const config = await getAIConfig();
  if (!config) {
    throw new Error(
      "AI is not configured. Set GOOGLE_AI_API_KEY (env) or save it from the in-app admin Settings page.",
    );
  }
  return config;
}

/**
 * Call a chat-completion compatible AI endpoint and return the raw assistant
 * message content. Throws if the request fails; callers handle JSON parsing.
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  const config = await requireAIConfig();
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? config.model,
      messages: options.messages,
      ...(options.jsonResponse ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "{}";
}
