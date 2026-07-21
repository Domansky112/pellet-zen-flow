import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

export const listReservedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("reservation_status", "zarezerwowany")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const StatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["nowy", "w_kontakcie", "oferta", "wygrany", "przegrany"]),
});

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AssignInput = z.object({ id: z.string().uuid() });

export const assignToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ assigned_to: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CreateInput = z.object({
  first_name: z.string().trim().max(120).optional().or(z.literal("")),
  last_name: z.string().trim().max(120).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postal_code: z.string().trim().max(12).optional().or(z.literal("")),
  source: z.enum(["www", "email", "b2b", "telefon", "inne"]).default("inne"),
  product: z.enum(["pellet_paleta", "pellet_bigbag", "inne"]).optional().nullable(),
  quantity: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().or(z.literal("")),
  priority: z.number().int().min(0).max(5).default(0),
  pooling_enabled: z.boolean().default(false),
  pooling_wait_until: z.string().optional().nullable(),
});

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      city: data.city || null,
      postal_code: data.postal_code || null,
      source: data.source,
      product: data.product ?? null,
      quantity: data.quantity ?? null,
      notes: data.notes || null,
      priority: data.priority,
      pooling_enabled: data.pooling_enabled,
      pooling_wait_until: data.pooling_wait_until || null,
      pooling_status: data.pooling_enabled ? "poczekalnia" : "brak",
      status: "nowy",
    };
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert(payload as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Auto-rezerwacja: pooling + produkt + ilość
    if (data.pooling_enabled && data.product && data.quantity && data.quantity > 0) {
      const { error: rpcErr } = await context.supabase.rpc("reserve_stock_for_lead", {
        _lead_id: row.id,
      });
      if (rpcErr) {
        // Nie usuwamy leada — zwracamy z ostrzeżeniem
        return { ...row, _reservation_error: rpcErr.message };
      }
    }
    return row;
  });

const LeadIdInput = z.object({ lead_id: z.string().uuid() });

export const reserveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeadIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reserve_stock_for_lead", {
      _lead_id: data.lead_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmWydanie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeadIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("release_reservation_as_wydanie", {
      _lead_id: data.lead_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateLeadInput = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().max(120).nullable().optional(),
  last_name: z.string().trim().max(120).nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(255).nullable().or(z.literal("")).optional(),
  phone: z.string().trim().max(50).nullable().or(z.literal("")).optional(),
  city: z.string().trim().max(120).nullable().or(z.literal("")).optional(),
  postal_code: z.string().trim().max(12).nullable().or(z.literal("")).optional(),
  invoice_company: z.string().trim().max(200).nullable().or(z.literal("")).optional(),
  invoice_nip: z.string().trim().max(20).nullable().or(z.literal("")).optional(),
  invoice_address: z.string().trim().max(500).nullable().or(z.literal("")).optional(),
  product: z.enum(["pellet_paleta", "pellet_bigbag", "inne"]).nullable().optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  pooling_enabled: z.boolean().optional(),
});

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateLeadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      patch[k] = v === "" ? null : v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("leads")
      .update(patch as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ReleaseInput = z.object({ lead_id: z.string().uuid() });

export const releaseReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReleaseInput.parse(d))
  .handler(async ({ data, context }) => {
    // Zwolnienie rezerwacji bez wydania: sumujemy netto i wystawiamy zwolnienie_rez
    const { data: lead, error: le } = await context.supabase
      .from("leads")
      .select("id, product, reservation_status")
      .eq("id", data.lead_id)
      .single();
    if (le) throw new Error(le.message);
    if (!lead?.product) throw new Error("Lead nie ma produktu");
    const { data: evs, error: ee } = await context.supabase
      .from("stock_events")
      .select("txn_type, quantity")
      .eq("lead_id", data.lead_id)
      .eq("product", lead.product);
    if (ee) throw new Error(ee.message);
    const net = (evs ?? []).reduce((s, e: any) => {
      if (e.txn_type === "rezerwacja") return s + Number(e.quantity);
      if (e.txn_type === "zwolnienie_rez") return s - Number(e.quantity);
      return s;
    }, 0);
    if (net <= 0) throw new Error("Brak aktywnej rezerwacji");
    const { error: ie } = await context.supabase.from("stock_events").insert({
      product: lead.product,
      txn_type: "zwolnienie_rez",
      quantity: net,
      lead_id: data.lead_id,
      reference: `LEAD:${data.lead_id.slice(0, 8)}`,
      note: "Ręczne zwolnienie rezerwacji",
      created_by: context.userId,
    } as any);
    if (ie) throw new Error(ie.message);
    const { error: ue } = await context.supabase
      .from("leads")
      .update({ reservation_status: "zwolniony" })
      .eq("id", data.lead_id);
    if (ue) throw new Error(ue.message);
    return { ok: true };
  });
