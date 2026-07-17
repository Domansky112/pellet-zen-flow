import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function replyToChat(chatId: number | string, text: string) {
  const lovable = process.env.LOVABLE_API_KEY;
  const telegram = process.env.TELEGRAM_API_KEY;
  if (!lovable || !telegram) return;
  await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telegramKey = process.env.TELEGRAM_API_KEY;
        if (!telegramKey) return new Response("Not configured", { status: 500 });

        const expected = createHash("sha256").update(`telegram-webhook:${telegramKey}`).digest("base64url");
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json().catch(() => null) as any;
        const message = update?.message ?? update?.edited_message;
        const chat = message?.chat;
        if (!chat?.id) return Response.json({ ok: true, ignored: true });

        const chatIdStr = String(chat.id);
        const label = [chat.title, chat.username, [chat.first_name, chat.last_name].filter(Boolean).join(" ")]
          .filter(Boolean)[0] ?? `chat ${chatIdStr}`;
        const text: string = (message.text ?? "").trim();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Upsert chat; /start auto-whitelists, /stop removes whitelist.
        const isStart = /^\/start\b/i.test(text);
        const isStop = /^\/stop\b/i.test(text);

        const { data: existing } = await supabaseAdmin
          .from("telegram_chats")
          .select("id, is_whitelisted")
          .eq("chat_id", chatIdStr)
          .maybeSingle();

        if (!existing) {
          await supabaseAdmin.from("telegram_chats").insert({
            chat_id: chatIdStr,
            label,
            is_whitelisted: isStart,
          });
        } else if (isStart && !existing.is_whitelisted) {
          await supabaseAdmin.from("telegram_chats").update({ is_whitelisted: true, label }).eq("id", existing.id);
        } else if (isStop && existing.is_whitelisted) {
          await supabaseAdmin.from("telegram_chats").update({ is_whitelisted: false }).eq("id", existing.id);
        }

        if (isStart) {
          await replyToChat(chat.id, "✅ Pellet OS: czat aktywny. Dostaniesz alerty T-7 i T-4 przed transportem. Wpisz /stop aby wypisać.");
        } else if (isStop) {
          await replyToChat(chat.id, "🔕 Wypisano. Wpisz /start żeby wrócić.");
        } else if (/^\/id\b/i.test(text)) {
          await replyToChat(chat.id, `chat_id: ${chatIdStr}`);
        } else if (/^\/(help|menu)\b/i.test(text)) {
          await replyToChat(chat.id, "Komendy:\n/start — dołącz do alertów\n/stop — wypisz się\n/id — pokaż chat_id");
        }

        return Response.json({ ok: true });
      },
    },
  },
});
