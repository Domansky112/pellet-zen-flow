import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productEnum = z.enum(["pellet_paleta", "pellet_bigbag", "brykiet", "inne"]);

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
