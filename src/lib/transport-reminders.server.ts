import { sendTelegramMessage } from "@/lib/telegram.server";

type Offset = 7 | 4;
const statusLabel: Record<string, string> = {
  planowany: "planowany",
  potwierdzony: "potwierdzony",
  w_trasie: "w trasie",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", weekday: "long" });
}

function renderMsg(offset: Offset, t: any) {
  const emoji = offset === 7 ? "📅" : "🚚";
  const lines = [
    `${emoji} <b>Transport za ${offset} dni</b> — ${fmtDate(t.scheduled_date)}`,
    `Strefa: <b>${t.zone ?? "—"}</b> · ${t.city ?? "—"}${t.postal_code ? " " + t.postal_code : ""}`,
    t.driver ? `Kierowca: ${t.driver}` : null,
    t.vehicle ? `Pojazd: ${t.vehicle}` : null,
    t.capacity_kg ? `Ładunek: ${t.capacity_kg} kg` : null,
    `Status: ${statusLabel[t.status] ?? t.status}`,
    t.notes ? `\n${t.notes}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function runTransportReminders(now: Date = new Date()) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const target = (offset: Offset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const d7 = target(7);
  const d4 = target(4);

  const { data: transports, error } = await supabaseAdmin
    .from("transports")
    .select("id, scheduled_date, zone, city, postal_code, driver, vehicle, capacity_kg, status, notes, telegram_t7_sent_at, telegram_t4_sent_at")
    .in("scheduled_date", [d7, d4])
    .in("status", ["planowany", "potwierdzony", "w_trasie"]);
  if (error) throw new Error(error.message);

  const { data: chats, error: chatsErr } = await supabaseAdmin
    .from("telegram_chats")
    .select("chat_id")
    .eq("is_whitelisted", true);
  if (chatsErr) throw new Error(chatsErr.message);
  const chatIds = (chats ?? []).map((c) => c.chat_id);

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const t of transports ?? []) {
    const offset: Offset = t.scheduled_date === d7 ? 7 : 4;
    const stampField = offset === 7 ? "telegram_t7_sent_at" : "telegram_t4_sent_at";
    if ((t as any)[stampField]) { skipped++; continue; }
    if (chatIds.length === 0) { skipped++; continue; }

    const text = renderMsg(offset, t);
    const results = await Promise.allSettled(chatIds.map((cid) => sendTelegramMessage(cid, text)));
    const okCount = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const f of failed) errors.push(String(f.reason?.message ?? f.reason));

    if (okCount > 0) {
      sent += okCount;
      await supabaseAdmin
        .from("transports")
        .update({ [stampField]: new Date().toISOString() })
        .eq("id", t.id);
    }
  }

  return {
    checked: transports?.length ?? 0,
    chatCount: chatIds.length,
    sent,
    skipped,
    errors: errors.slice(0, 5),
  };
}
