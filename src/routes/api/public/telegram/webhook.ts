import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function replyToChat(chatId: number | string, text: string, html = true) {
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
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: html ? "HTML" : undefined, disable_web_page_preview: true }),
  });
}

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Pellet (paleta)",
  pellet_bigbag: "Pellet (big bag)",
  brykiet: "Brykiet",
};

async function renderStockSummary(admin: any) {
  const { data, error } = await admin.from("stock_balance").select("product, physical_kg, reserved_kg, available_kg");
  if (error) return `❌ Błąd magazynu: ${error.message}`;
  if (!data || data.length === 0) return "📦 Magazyn pusty.";
  const lines = ["📦 <b>Stan magazynu</b>"];
  for (const r of data) {
    lines.push(`• <b>${PRODUCT_LABEL[r.product] ?? r.product}</b>: ${r.available_kg} kg dost. (fiz. ${r.physical_kg} / rez. ${r.reserved_kg})`);
  }
  return lines.join("\n");
}

async function renderUpcomingTransports(admin: any) {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const end = in7.toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("transports")
    .select("scheduled_date, zone, city, postal_code, driver, vehicle, capacity_kg, status")
    .gte("scheduled_date", today).lte("scheduled_date", end)
    .in("status", ["planowany", "potwierdzony", "w_trasie"])
    .order("scheduled_date", { ascending: true });
  if (error) return `❌ Błąd: ${error.message}`;
  if (!data || data.length === 0) return "🚚 Brak transportów na najbliższe 7 dni.";
  const lines = ["🚚 <b>Transporty (7 dni)</b>"];
  for (const t of data) {
    const d = new Date(t.scheduled_date).toLocaleDateString("pl-PL", { weekday: "short", day: "2-digit", month: "2-digit" });
    lines.push(`• <b>${d}</b> · ${t.zone ?? "—"} · ${t.city ?? "—"}${t.postal_code ? " " + t.postal_code : ""}${t.capacity_kg ? ` · ${t.capacity_kg} kg` : ""}${t.driver ? ` · ${t.driver}` : ""}`);
  }
  return lines.join("\n");
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
