import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productEnum = z.enum(["pellet_paleta", "pellet_bigbag", "inne"]);
const txnEnum = z.enum(["przyjecie", "wydanie", "rezerwacja", "zwolnienie_rez", "korekta"]);

export const listStockBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("stock_balance")
      .select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listStockEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("stock_events")
      .select("id, product, txn_type, quantity, reference, note, lead_id, created_at, created_by, leads(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addStockEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      product: productEnum,
      txn_type: txnEnum,
      quantity: z.number().positive(),
      reference: z.string().max(120).optional().nullable(),
      note: z.string().max(500).optional().nullable(),
      lead_id: z.string().uuid().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("stock_events")
      .insert({
        product: data.product,
        txn_type: data.txn_type,
        quantity: data.quantity,
        reference: data.reference ?? null,
        note: data.note ?? null,
        lead_id: data.lead_id ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const reserveForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      lead_id: z.string().uuid(),
      product: productEnum,
      quantity: z.number().positive(),
      note: z.string().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Check available (physical - reserved)
    const { data: bal } = await context.supabase
      .from("stock_balance")
      .select("physical, reserved")
      .eq("product", data.product)
      .maybeSingle();
    const physical = Number(bal?.physical ?? 0);
    const reserved = Number(bal?.reserved ?? 0);
    const available = physical - reserved;
    if (data.quantity > available) {
      throw new Error(`Za mało dostępnego stanu: ${available} < ${data.quantity}`);
    }
    const { data: row, error } = await context.supabase
      .from("stock_events")
      .insert({
        product: data.product,
        txn_type: "rezerwacja",
        quantity: data.quantity,
        lead_id: data.lead_id,
        note: data.note ?? null,
        reference: `LEAD:${data.lead_id.slice(0, 8)}`,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const releaseReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      lead_id: z.string().uuid(),
      product: productEnum,
      quantity: z.number().positive(),
      note: z.string().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("stock_events")
      .insert({
        product: data.product,
        txn_type: "zwolnienie_rez",
        quantity: data.quantity,
        lead_id: data.lead_id,
        note: data.note ?? null,
        reference: `LEAD:${data.lead_id.slice(0, 8)}`,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listOpenLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, name, city, product, quantity, status")
      .in("status", ["nowy", "w_kontakcie", "oferta"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
