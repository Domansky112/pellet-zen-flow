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
    // Keep leads in sync so the CRM "Z rezerwacją" tab matches the warehouse
    const { data: lead } = await context.supabase
      .from("leads")
      .select("product, quantity")
      .eq("id", data.lead_id)
      .maybeSingle();
    await context.supabase
      .from("leads")
      .update({
        reservation_status: "zarezerwowany",
        product: lead?.product ?? data.product,
        quantity: lead?.quantity ?? data.quantity,
      })
      .eq("id", data.lead_id);
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
    // If net reservation for this lead is now 0, mark lead as released
    const { data: evs } = await context.supabase
      .from("stock_events")
      .select("txn_type, quantity")
      .eq("lead_id", data.lead_id);
    const net = (evs ?? []).reduce((s, e) => {
      if (e.txn_type === "rezerwacja") return s + Number(e.quantity);
      if (e.txn_type === "zwolnienie_rez") return s - Number(e.quantity);
      return s;
    }, 0);
    if (net <= 0) {
      await context.supabase
        .from("leads")
        .update({ reservation_status: "zwolniony" })
        .eq("id", data.lead_id);
    }
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

export const deleteStockEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      reason: z.string().trim().max(500).optional().or(z.literal("")),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Role check: admin / warehouse
    const [{ data: isAdmin }, { data: isWarehouse }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "warehouse" }),
    ]);
    if (!isAdmin && !isWarehouse) {
      throw new Error("Brak uprawnień — wymagana rola admin lub magazynier.");
    }

    // Load event before delete for audit + downstream lead sync
    const { data: ev, error: le } = await context.supabase
      .from("stock_events")
      .select("id, product, txn_type, quantity, lead_id, reference, note, created_at")
      .eq("id", data.id)
      .single();
    if (le || !ev) throw new Error(le?.message ?? "Zdarzenie nie istnieje");

    const { error: de } = await context.supabase
      .from("stock_events")
      .delete()
      .eq("id", data.id);
    if (de) throw new Error(de.message);

    // Audit log
    await context.supabase.from("audit_log").insert({
      actor_id: context.userId,
      action: "stock_event.delete",
      entity_type: "stock_event",
      entity_id: ev.id,
      details: {
        product: ev.product,
        txn_type: ev.txn_type,
        quantity: Number(ev.quantity),
        lead_id: ev.lead_id,
        reference: ev.reference,
        note: ev.note,
        original_created_at: ev.created_at,
        reason: data.reason || null,
      },
    } as any);

    // Recompute reservation_status for the linked lead
    if (ev.lead_id) {
      const { data: evs } = await context.supabase
        .from("stock_events")
        .select("txn_type, quantity")
        .eq("lead_id", ev.lead_id);
      const net = (evs ?? []).reduce((s, e: any) => {
        if (e.txn_type === "rezerwacja") return s + Number(e.quantity);
        if (e.txn_type === "zwolnienie_rez") return s - Number(e.quantity);
        return s;
      }, 0);
      const hasWydanie = (evs ?? []).some((e: any) => e.txn_type === "wydanie");
      const newStatus = hasWydanie ? "wydany" : net > 0 ? "zarezerwowany" : "zwolniony";
      await context.supabase
        .from("leads")
        .update({ reservation_status: newStatus })
        .eq("id", ev.lead_id);
    }

    return { ok: true };
  });
