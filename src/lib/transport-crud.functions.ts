import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productEnum = z.enum(["pellet_paleta", "pellet_bigbag", "inne"]);

export const listTransports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transports")
      .select(
        "id, scheduled_date, city, postal_code, destination_address, driver, vehicle, status, notes, capacity_kg, telegram_t7_sent_at, telegram_t4_sent_at, transport_items(id, product, quantity, lead_id, address, leads(name))",
      )
      .order("scheduled_date", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTransport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data w formacie YYYY-MM-DD"),
        city: z.string().min(1).max(120),
        postal_code: z.string().max(20).optional().nullable(),
        destination_address: z.string().min(3).max(300),
        driver: z.string().max(120).optional().nullable(),
        vehicle: z.string().max(120).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
        product: productEnum,
        quantity: z.number().positive().max(100),
        lead_id: z.string().uuid().optional().nullable(),
        reserve_stock: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Optional: verify stock is available before creating (only if reserving)
    if (data.reserve_stock) {
      const { data: bal } = await context.supabase
        .from("stock_balance")
        .select("physical, reserved")
        .eq("product", data.product)
        .maybeSingle();
      const available = Number(bal?.physical ?? 0) - Number(bal?.reserved ?? 0);
      if (data.quantity > available) {
        throw new Error(
          `Za mało dostępnego stanu (${available} t) — potrzeba ${data.quantity} t. Odznacz rezerwację lub uzupełnij magazyn.`,
        );
      }
    }

    // 1. Insert transport
    const { data: transport, error: tErr } = await context.supabase
      .from("transports")
      .insert({
        scheduled_date: data.scheduled_date,
        city: data.city,
        postal_code: data.postal_code ?? null,
        destination_address: data.destination_address,
        driver: data.driver ?? null,
        vehicle: data.vehicle ?? null,
        notes: data.notes ?? null,
        capacity_kg: data.quantity * 1000,
        status: "planowany",
      })
      .select()
      .single();
    if (tErr) throw new Error(tErr.message);

    // 2. Insert transport_item
    const { error: iErr } = await context.supabase.from("transport_items").insert({
      transport_id: transport.id,
      lead_id: data.lead_id ?? null,
      product: data.product,
      quantity: data.quantity,
      address: data.destination_address,
    });
    if (iErr) throw new Error(iErr.message);

    // 3. Reserve stock (rezerwacja event)
    if (data.reserve_stock) {
      const { error: sErr } = await context.supabase.from("stock_events").insert({
        product: data.product,
        txn_type: "rezerwacja",
        quantity: data.quantity,
        lead_id: data.lead_id ?? null,
        reference: `TRANSPORT:${transport.id.slice(0, 8)}`,
        note: `Rezerwacja pod transport ${data.scheduled_date} → ${data.city}`,
        created_by: context.userId,
      });
      if (sErr) throw new Error(sErr.message);
    }

    return transport;
  });

export const deleteTransport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("transports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTransportById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await context.supabase
      .from("transports")
      .select(
        "id, scheduled_date, city, postal_code, destination_address, driver, vehicle, status, notes, capacity_kg, pool_id, transport_items(id, product, quantity, address, lead_id, leads(id, name, first_name, last_name, phone, city, postal_code))",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return t;
  });

/**
 * Auto-create transport from a lead with safety check on stock reservation.
 * - Reuses existing reservation if lead already has matching net reserved qty
 * - Otherwise checks available stock and creates a 100% reservation
 * - Blocks scheduling when stock is insufficient
 */
export const scheduleTransportForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        destination_address: z.string().min(3).max(300).optional().nullable(),
        driver: z.string().max(120).optional().nullable(),
        vehicle: z.string().max(120).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .select("id, name, first_name, last_name, city, postal_code, invoice_address, product, quantity, reservation_status")
      .eq("id", data.lead_id)
      .single();
    if (lErr || !lead) throw new Error(lErr?.message ?? "Lead nie istnieje");
    if (!lead.product || !lead.quantity || Number(lead.quantity) <= 0) {
      throw new Error("Lead nie ma określonego produktu lub tonażu — uzupełnij dane leada.");
    }
    const product = lead.product as "pellet_paleta" | "pellet_bigbag" | "inne";
    const qty = Number(lead.quantity);

    const { data: evs } = await context.supabase
      .from("stock_events")
      .select("txn_type, quantity")
      .eq("lead_id", lead.id);
    const netReserved = (evs ?? []).reduce((s, e: { txn_type: string; quantity: number }) => {
      if (e.txn_type === "rezerwacja") return s + Number(e.quantity);
      if (e.txn_type === "zwolnienie_rez") return s - Number(e.quantity);
      return s;
    }, 0);
    const missing = Math.max(0, qty - netReserved);
    const needsReservation = missing > 0;

    if (needsReservation) {
      const { data: bal } = await context.supabase
        .from("stock_balance")
        .select("physical, reserved")
        .eq("product", product)
        .maybeSingle();
      const available = Number(bal?.physical ?? 0) - Number(bal?.reserved ?? 0);
      if (missing > available) {
        throw new Error(
          `Brak wystarczającego tonażu w magazynie do zaplanowania tego transportu (dostępne: ${available} t, potrzebne: ${missing} t).`,
        );
      }
    }

    const destination =
      data.destination_address?.trim() ||
      lead.invoice_address ||
      [lead.postal_code, lead.city].filter(Boolean).join(" ") ||
      lead.city ||
      "—";
    const city = lead.city || destination.split(",").pop()?.trim() || "—";

    const { data: transport, error: tErr } = await context.supabase
      .from("transports")
      .insert({
        scheduled_date: data.scheduled_date,
        city,
        postal_code: lead.postal_code ?? null,
        destination_address: destination,
        driver: data.driver ?? null,
        vehicle: data.vehicle ?? null,
        notes: data.notes ?? null,
        capacity_kg: qty * 1000,
        status: "planowany",
      })
      .select()
      .single();
    if (tErr) throw new Error(tErr.message);

    const { error: iErr } = await context.supabase.from("transport_items").insert({
      transport_id: transport.id,
      lead_id: lead.id,
      product,
      quantity: qty,
      address: destination,
    });
    if (iErr) throw new Error(iErr.message);

    if (needsReservation) {
      const { error: sErr } = await context.supabase.from("stock_events").insert({
        product,
        txn_type: "rezerwacja",
        quantity: missing,
        lead_id: lead.id,
        reference: `TRANSPORT:${transport.id.slice(0, 8)}`,
        note: `Auto-rezerwacja pod transport ${data.scheduled_date}`,
        created_by: context.userId,
      });
      if (sErr) throw new Error(sErr.message);
    }
    if (lead.reservation_status !== "zarezerwowany" && lead.reservation_status !== "wydany") {
      await context.supabase
        .from("leads")
        .update({ reservation_status: "zarezerwowany" })
        .eq("id", lead.id);
    }

    return { transport_id: transport.id, reused_reservation: !needsReservation };
  });

/**
 * Reschedule a transport (drag & drop / date change).
 * Keeps existing reservation intact; only shifts the date.
 */
export const rescheduleTransport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transports")
      .update({ scheduled_date: data.scheduled_date })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

