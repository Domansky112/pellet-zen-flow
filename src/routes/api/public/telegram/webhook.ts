import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type InlineKeyboard = { text: string; callback_data: string }[][];

async function tg(method: string, body: Record<string, unknown>) {
  const lovable = process.env.LOVABLE_API_KEY;
  const telegram = process.env.TELEGRAM_API_KEY;
  if (!lovable || !telegram) return;
  await fetch(`https://connector-gateway.lovable.dev/telegram/${method}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function replyToChat(chatId: number | string, text: string, opts?: { keyboard?: InlineKeyboard }) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (opts?.keyboard) body.reply_markup = { inline_keyboard: opts.keyboard };
  await tg("sendMessage", body);
}

async function answerCallback(id: string, text?: string) {
  await tg("answerCallbackQuery", { callback_query_id: id, text: text ?? "" });
}

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Pellet (paleta)",
  pellet_bigbag: "Pellet (big bag)",
  inne: "Inne",
};

async function getBalance(admin: any) {
  const { data } = await admin.from("stock_balance").select("product, physical, reserved");
  const map: Record<string, { physical: number; reserved: number; available: number }> = {};
  for (const r of data ?? []) {
    const physical = Number(r.physical ?? 0);
    const reserved = Number(r.reserved ?? 0);
    map[r.product] = { physical, reserved, available: physical - reserved };
  }
  return map;
}

async function renderStockSummary(admin: any) {
  const bal = await getBalance(admin);
  const products = Object.keys(bal);
  if (products.length === 0) return "📦 Magazyn pusty.";
  const lines = ["📦 <b>Stan magazynu</b>"];
  for (const p of products) {
    const b = bal[p];
    lines.push(
      `• <b>${PRODUCT_LABEL[p] ?? p}</b>: ${b.available.toFixed(1)} t dost. (fiz. ${b.physical.toFixed(1)} / rez. ${b.reserved.toFixed(1)})`,
    );
  }
  return lines.join("\n");
}

function plToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
}

function addDays(ymdStr: string, n: number) {
  const d = new Date(`${ymdStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Poniedziałek–niedziela tygodnia zawierającego `base` (czas PL). */
function weekRange(base: string, weekOffset = 0) {
  const dow = new Date(`${base}T12:00:00Z`).getUTCDay(); // 0=nd
  const monday = addDays(base, (dow === 0 ? -6 : 1 - dow) + weekOffset * 7);
  return { start: monday, end: addDays(monday, 6) };
}

const fmtShort = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });

async function renderUpcomingTransports(admin: any) {
  const today = plToday();
  const end = addDays(today, 7);
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
    const d = new Date(`${t.scheduled_date}T12:00:00Z`).toLocaleDateString("pl-PL", { weekday: "short", day: "2-digit", month: "2-digit" });
    const tons = t.capacity_kg != null ? ` · ${Number(t.capacity_kg).toFixed(1)} t` : "";
    lines.push(`• <b>${d}</b> · ${t.zone ?? "—"} · ${t.city ?? "—"}${t.postal_code ? " " + t.postal_code : ""}${tons}${t.driver ? ` · ${t.driver}` : ""}`);
  }
  return lines.join("\n");
}

/** Zbiorcze zestawienie transportów na tydzień (Pn–Nd, czas PL). */
export async function renderWeekSummary(admin: any, weekOffset = 0) {
  const { start, end } = weekRange(plToday(), weekOffset);
  const { data, error } = await admin
    .from("transports")
    .select("scheduled_date, zone, city, postal_code, driver, vehicle, capacity_kg, status")
    .gte("scheduled_date", start).lte("scheduled_date", end)
    .in("status", ["planowany", "potwierdzony", "w_trasie", "zrealizowany"])
    .order("scheduled_date", { ascending: true });
  const header = `📊 <b>ZBIORCZE ZESTAWIENIE TRANSPORTÓW</b>\n<b>Tydzień:</b> ${fmtShort(start)} – ${fmtShort(end)}`;
  if (error) return `${header}\n\n❌ Błąd: ${error.message}`;
  if (!data || data.length === 0) return `${header}\n\nℹ️ Brak zaplanowanych transportów na ten tydzień.`;

  const byDay = new Map<string, any[]>();
  for (const t of data) {
    const arr = byDay.get(t.scheduled_date) ?? [];
    arr.push(t);
    byDay.set(t.scheduled_date, arr);
  }
  const lines = [header, ""];
  let totalTons = 0;
  for (const [day, items] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dayLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString("pl-PL", { weekday: "long", day: "2-digit", month: "2-digit" });
    lines.push(`<b>${dayLabel}</b>`);
    for (const t of items) {
      const tons = t.capacity_kg != null ? Number(t.capacity_kg) : 0;
      totalTons += tons;
      lines.push(
        `• ${t.city ?? "—"}${t.postal_code ? " " + t.postal_code : ""} · ${t.zone ?? "—"}${tons ? ` · ${tons.toFixed(1)} t` : ""}${t.driver ? ` · ${t.driver}` : ""} · ${t.status}`,
      );
    }
    lines.push("");
  }
  lines.push(`<b>Razem:</b> ${data.length} transport(ów) · ${totalTons.toFixed(1)} t`);
  return lines.join("\n");
}


// ============ /dodaj_palete flow ============

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getFlow(admin: any, chatId: string) {
  const { data } = await admin
    .from("telegram_flow_state")
    .select("flow, step, payload")
    .eq("chat_id", chatId)
    .maybeSingle();
  return data as { flow: string; step: string; payload: any } | null;
}

async function setFlow(admin: any, chatId: string, flow: string, step: string, payload: any) {
  await admin.from("telegram_flow_state").upsert({
    chat_id: chatId,
    flow,
    step,
    payload,
    updated_at: new Date().toISOString(),
  });
}

async function clearFlow(admin: any, chatId: string) {
  await admin.from("telegram_flow_state").delete().eq("chat_id", chatId);
}

async function startDodajPalete(admin: any, chatId: string) {
  await setFlow(admin, chatId, "dodaj_palete", "await_qty", {});
  await replyToChat(
    chatId,
    "📦 <b>Dodawanie palet (przepakowanie z big bag)</b>\n\n" +
      "Przelicznik: <b>1 paleta = 1 big bag = 1 t</b>.\n\n" +
      "Podaj ilość palet dodanych/spakowanych na magazyn (np. <code>5</code>):",
    { keyboard: [[{ text: "❌ Anuluj", callback_data: "dp:cancel" }]] },
  );
}

async function askForDate(admin: any, chatId: string, qty: number) {
  await setFlow(admin, chatId, "dodaj_palete", "await_date", { qty });
  await replyToChat(chatId, `Ilość: <b>${qty}</b> palet.\n\nZ jakiego dnia jest to produkcja?`, {
    keyboard: [
      [
        { text: "📅 Dzisiaj", callback_data: "dp:date:today" },
        { text: "📅 Wczoraj", callback_data: "dp:date:yesterday" },
      ],
      [{ text: "✍️ Podaj datę (YYYY-MM-DD)", callback_data: "dp:date:custom" }],
      [{ text: "❌ Anuluj", callback_data: "dp:cancel" }],
    ],
  });
}

async function executeRepack(admin: any, chatId: string, qty: number, dateIso: string) {
  const createdAt = new Date(`${dateIso}T12:00:00Z`).toISOString();
  const ref = `REPACK:${dateIso}`;
  const note = `Przepakowanie ${qty} t: big bag → paleta (${dateIso})`;

  const { error: e1 } = await admin.from("stock_events").insert({
    product: "pellet_paleta",
    txn_type: "przyjecie",
    quantity: qty,
    reference: ref,
    note,
    created_at: createdAt,
  });
  if (e1) {
    await replyToChat(chatId, `❌ Błąd zapisu (paleta): ${e1.message}`);
    return;
  }
  const { error: e2 } = await admin.from("stock_events").insert({
    product: "pellet_bigbag",
    txn_type: "wydanie",
    quantity: qty,
    reference: ref,
    note,
    created_at: createdAt,
  });
  if (e2) {
    // rollback the first insert
    await admin.from("stock_events").delete().eq("reference", ref).eq("product", "pellet_paleta");
    await replyToChat(chatId, `❌ Błąd zapisu (big bag), operacja wycofana: ${e2.message}`);
    return;
  }

  const bal = await getBalance(admin);
  const p = bal["pellet_paleta"] ?? { physical: 0, reserved: 0, available: 0 };
  const bb = bal["pellet_bigbag"] ?? { physical: 0, reserved: 0, available: 0 };
  await replyToChat(
    chatId,
    `✅ <b>Przepakowanie zapisane</b>\n` +
      `Data: <b>${dateIso}</b> · Ilość: <b>${qty} t</b>\n\n` +
      `📦 <b>Nowy stan magazynu:</b>\n` +
      `• Palety: <b>${p.available.toFixed(1)} t</b> dost. (fiz. ${p.physical.toFixed(1)})\n` +
      `• Big bagi: <b>${bb.available.toFixed(1)} t</b> dost. (fiz. ${bb.physical.toFixed(1)})`,
  );
}

async function handleDodajPaleteText(admin: any, chatId: string, text: string, flow: { step: string; payload: any }) {
  if (flow.step === "await_qty") {
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      await replyToChat(chatId, "❌ Podaj poprawną liczbę palet (np. <code>5</code>).");
      return;
    }
    const bal = await getBalance(admin);
    const bb = bal["pellet_bigbag"]?.available ?? 0;
    if (n > bb) {
      await setFlow(admin, chatId, "dodaj_palete", "await_negative_confirm", { qty: n });
      await replyToChat(
        chatId,
        `⚠️ <b>Ostrzeżenie:</b> dodajesz <b>${n}</b> palet, ale w stanie big bagów jest tylko <b>${bb.toFixed(1)} t</b>. Stan big bagów spadnie poniżej zera.\n\nCzy na pewno kontynuować?`,
        {
          keyboard: [[
            { text: "✅ Tak, zatwierdź", callback_data: "dp:neg:yes" },
            { text: "❌ Anuluj", callback_data: "dp:cancel" },
          ]],
        },
      );
      return;
    }
    await askForDate(admin, chatId, n);
    return;
  }
  if (flow.step === "await_date_custom") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      await replyToChat(chatId, "❌ Zły format. Podaj datę jako <code>YYYY-MM-DD</code> (np. <code>2026-07-20</code>).");
      return;
    }
    const qty = Number(flow.payload?.qty);
    await clearFlow(admin, chatId);
    await executeRepack(admin, chatId, qty, text);
    return;
  }
}

async function handleDodajPaleteCallback(admin: any, chatId: string, data: string, callbackId: string, flow: { step: string; payload: any } | null) {
  if (data === "dp:cancel") {
    await clearFlow(admin, chatId);
    await answerCallback(callbackId, "Anulowano");
    await replyToChat(chatId, "❌ Anulowano dodawanie palet.");
    return;
  }
  if (!flow) {
    await answerCallback(callbackId, "Sesja wygasła");
    return;
  }
  if (data === "dp:neg:yes" && flow.step === "await_negative_confirm") {
    await answerCallback(callbackId, "OK");
    await askForDate(admin, chatId, Number(flow.payload?.qty));
    return;
  }
  if (data.startsWith("dp:date:") && flow.step === "await_date") {
    const which = data.slice("dp:date:".length);
    const qty = Number(flow.payload?.qty);
    if (which === "today") {
      await clearFlow(admin, chatId);
      await answerCallback(callbackId, "Dzisiaj");
      await executeRepack(admin, chatId, qty, ymd(new Date()));
      return;
    }
    if (which === "yesterday") {
      const d = new Date(); d.setDate(d.getDate() - 1);
      await clearFlow(admin, chatId);
      await answerCallback(callbackId, "Wczoraj");
      await executeRepack(admin, chatId, qty, ymd(d));
      return;
    }
    if (which === "custom") {
      await setFlow(admin, chatId, "dodaj_palete", "await_date_custom", { qty });
      await answerCallback(callbackId, "Podaj datę");
      await replyToChat(chatId, "✍️ Wpisz datę produkcji w formacie <code>YYYY-MM-DD</code>:");
      return;
    }
  }
  await answerCallback(callbackId);
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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Callback query (inline keyboard button)
        const cb = update?.callback_query;
        if (cb?.message?.chat?.id && typeof cb.data === "string") {
          const chatIdStr = String(cb.message.chat.id);
          const flow = await getFlow(supabaseAdmin, chatIdStr);
          if (cb.data.startsWith("dp:")) {
            await handleDodajPaleteCallback(supabaseAdmin, chatIdStr, cb.data, String(cb.id), flow);
          } else {
            await answerCallback(String(cb.id));
          }
          return Response.json({ ok: true });
        }

        const message = update?.message ?? update?.edited_message;
        const chat = message?.chat;
        if (!chat?.id) return Response.json({ ok: true, ignored: true });

        const chatIdStr = String(chat.id);
        const label = [chat.title, chat.username, [chat.first_name, chat.last_name].filter(Boolean).join(" ")]
          .filter(Boolean)[0] ?? `chat ${chatIdStr}`;
        const text: string = (message.text ?? "").trim();

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

        const whitelisted = isStart || (existing?.is_whitelisted && !isStop);
        const cmd = text.match(/^\/([a-z_]+)/i)?.[1]?.toLowerCase();

        // Multi-step flow input (non-command text while flow is active)
        const flow = await getFlow(supabaseAdmin, chatIdStr);
        if (flow?.flow === "dodaj_palete" && !cmd) {
          if (!whitelisted) {
            await replyToChat(chatIdStr, "⛔ Ten czat nie jest aktywny. Wpisz /start.");
            return Response.json({ ok: true });
          }
          await handleDodajPaleteText(supabaseAdmin, chatIdStr, text, flow);
          return Response.json({ ok: true });
        }

        if (isStart) {
          await replyToChat(chatIdStr, "✅ Pellet OS: czat aktywny.\n\nKomendy:\n/stan — magazyn\n/transport — najbliższe 7 dni\n/dodaj_palete — przepakowanie big bag → paleta\n/id — pokaż chat_id\n/stop — wypisz się");
        } else if (isStop) {
          await clearFlow(supabaseAdmin, chatIdStr);
          await replyToChat(chatIdStr, "🔕 Wypisano. Wpisz /start żeby wrócić.");
        } else if (cmd === "id") {
          await replyToChat(chatIdStr, `chat_id: <code>${chatIdStr}</code>`);
        } else if (cmd === "help" || cmd === "menu") {
          await replyToChat(chatIdStr, "Komendy:\n/stan — magazyn\n/transport — najbliższe 7 dni\n/dodaj_palete — przepakowanie big bag → paleta\n/id — chat_id\n/start /stop — alerty");
        } else if (cmd === "stan" || cmd === "magazyn") {
          if (!whitelisted) await replyToChat(chatIdStr, "⛔ Ten czat nie jest aktywny. Wpisz /start.");
          else await replyToChat(chatIdStr, await renderStockSummary(supabaseAdmin));
        } else if (cmd === "transport" || cmd === "transporty") {
          if (!whitelisted) await replyToChat(chatIdStr, "⛔ Ten czat nie jest aktywny. Wpisz /start.");
          else await replyToChat(chatIdStr, await renderUpcomingTransports(supabaseAdmin));
        } else if (cmd === "tydzien" || cmd === "tydzień" || cmd === "zestawienie") {
          if (!whitelisted) await replyToChat(chatIdStr, "⛔ Ten czat nie jest aktywny. Wpisz /start.");
          else await replyToChat(chatIdStr, await renderWeekSummary(supabaseAdmin, 0));
        } else if (cmd === "tydzien_next" || cmd === "przyszly_tydzien") {
          if (!whitelisted) await replyToChat(chatIdStr, "⛔ Ten czat nie jest aktywny. Wpisz /start.");
          else await replyToChat(chatIdStr, await renderWeekSummary(supabaseAdmin, 1));
        } else if (cmd === "dodaj_palete" || cmd === "dodajpalete") {
          if (!whitelisted) await replyToChat(chatIdStr, "⛔ Ten czat nie jest aktywny. Wpisz /start.");
          else await startDodajPalete(supabaseAdmin, chatIdStr);
        } else if (cmd === "anuluj" || cmd === "cancel") {
          await clearFlow(supabaseAdmin, chatIdStr);
          await replyToChat(chatIdStr, "❌ Anulowano bieżącą operację.");
        }

        return Response.json({ ok: true });
      },
    },
  },
});
