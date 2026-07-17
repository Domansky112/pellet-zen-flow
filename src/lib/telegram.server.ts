// Server-only Telegram helpers (blocked from client bundles by *.server.ts extension).
const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function requireKeys() {
  const lovable = process.env.LOVABLE_API_KEY;
  const telegram = process.env.TELEGRAM_API_KEY;
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!telegram) throw new Error("TELEGRAM_API_KEY is not configured");
  return { lovable, telegram };
}

export async function tgFetch(path: string, init?: RequestInit) {
  const { lovable, telegram } = requireKeys();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  if (!res.ok || (body && typeof body === "object" && body.ok === false)) {
    throw new Error(`Telegram gateway ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

export async function sendTelegramMessage(chatId: string | number, text: string) {
  return tgFetch("/sendMessage", {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export async function broadcastToWhitelisted(text: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: chats, error } = await supabaseAdmin
    .from("telegram_chats")
    .select("chat_id, label")
    .eq("is_whitelisted", true);
  if (error) throw new Error(error.message);
  const results = await Promise.allSettled(
    (chats ?? []).map((c) => sendTelegramMessage(c.chat_id, text)),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  return { sent, failed, total: results.length };
}

// Derived, deterministic webhook secret so setWebhook and route both compute it from TELEGRAM_API_KEY.
import { createHash } from "crypto";
export function deriveTelegramWebhookSecret(): string {
  const { telegram } = requireKeys();
  return createHash("sha256").update(`telegram-webhook:${telegram}`).digest("base64url");
}
