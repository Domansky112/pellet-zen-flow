import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LeadStatus = {
  key: string;
  label: string;
  color: string;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
};

export const listLeadStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lead_statuses")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LeadStatus[];
  });

const KeyRe = /^[a-z0-9_]{2,40}$/;
const UpsertInput = z.object({
  key: z.string().trim().regex(KeyRe, "Klucz: małe litery, cyfry, _"),
  label: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Kolor HEX np. #ea580c"),
  sort_order: z.number().int().min(0).max(9999).default(100),
  is_active: z.boolean().default(true),
});

export const upsertLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Tylko administrator");
    const { error } = await context.supabase
      .from("lead_statuses")
      .upsert({ ...data } as any, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Tylko administrator");
    const { data: row } = await context.supabase
      .from("lead_statuses")
      .select("is_system")
      .eq("key", data.key)
      .single();
    if ((row as any)?.is_system) throw new Error("Statusu systemowego nie można usunąć");
    const { error } = await context.supabase.from("lead_statuses").delete().eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Cofnięcie operacji zrealizowanego leada:
// - usuwa wydanie z magazynu (partie zużyte metodą FIFO wracają na stan),
// - kasuje rozliczenie płatności (kwota, status, faktura/pokwitowanie, data dostawy),
// - przelicza status rezerwacji na podstawie pozostałych zdarzeń.
// Wykonane z uprawnieniami serwisowymi, bo usuwanie zdarzeń magazynowych
// jest zastrzeżone dla admina/magazyniera, a lead może zmieniać też handlowiec.
async function rollbackRealization(
  context: { supabase: any; userId: string },
  leadId: string,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: evs, error: fe } = await supabaseAdmin
    .from("stock_events")
    .select("id, txn_type, quantity")
    .eq("lead_id", leadId);
  if (fe) throw new Error(fe.message);

  const wydania = (evs ?? []).filter((e: any) => e.txn_type === "wydanie");
  let reservationStatus: string | null = null;
  if (wydania.length) {
    const { error: de } = await supabaseAdmin
      .from("stock_events")
      .delete()
      .in("id", wydania.map((e: any) => e.id));
    if (de) throw new Error(de.message);
    // Saldo rezerwacji po usunięciu wydań (wydanie nie wpływa na saldo rezerwacji)
    const net = (evs ?? []).reduce((s, e: any) => {
      if (e.txn_type === "rezerwacja") return s + Number(e.quantity);
      if (e.txn_type === "zwolnienie_rez") return s - Number(e.quantity);
      return s;
    }, 0);
    reservationStatus = net > 0 ? "zarezerwowany" : "zwolniony";
  }

  const { error: pe } = await supabaseAdmin
    .from("leads")
    .update({
      payment_status: null,
      payment_amount_gross: null,
      payment_method: null,
      invoice_number: null,
      receipt_number: null,
      delivered_at: null,
      ...(reservationStatus ? { reservation_status: reservationStatus } : {}),
    } as any)
    .eq("id", leadId);
  if (pe) throw new Error(pe.message);

  await supabaseAdmin.from("audit_log").insert({
    actor_id: context.userId,
    action: "lead.rollback_realization",
    entity_type: "lead",
    entity_id: leadId,
    details: { wydania_removed: wydania.length },
  } as any);

  return wydania.length;
}

// Duplikat leada = powtórne zamówienie z danymi klienta (spójne z duplicateLead).
async function createLeadDuplicate(
  context: { supabase: any },
  leadId: string,
): Promise<{ id: string } | null> {
  const { data: src, error: se } = await context.supabase
    .from("leads")
    .select("first_name, last_name, name, email, phone, city, postal_code, street, invoice_company, invoice_nip, invoice_address, source, has_unloading_equipment, is_b2b_kurnik, cycle_days, product, delivery_window, access_tight, access_tonnage_limit, access_unpaved, assigned_to")
    .eq("id", leadId)
    .single();
  if (se || !src) throw new Error(se?.message ?? "Lead źródłowy nie istnieje");

  const { data: row, error } = await context.supabase
    .from("leads")
    .insert({
      first_name: src.first_name,
      last_name: src.last_name,
      name: src.name,
      email: src.email,
      phone: src.phone,
      city: src.city,
      postal_code: src.postal_code,
      street: (src as any).street ?? null,
      invoice_company: src.invoice_company,
      invoice_nip: src.invoice_nip,
      invoice_address: src.invoice_address,
      source: src.source ?? "inne",
      has_unloading_equipment: !!src.has_unloading_equipment,
      is_b2b_kurnik: !!(src as any).is_b2b_kurnik,
      cycle_days: (src as any).cycle_days ?? null,
      delivery_window: (src as any).delivery_window ?? null,
      access_tight: !!(src as any).access_tight,
      access_tonnage_limit: (src as any).access_tonnage_limit ?? null,
      access_unpaved: !!(src as any).access_unpaved,
      assigned_to: (src as any).assigned_to ?? null,
      status: "nowy",
      reservation_status: "brak",
      pooling_status: "brak",
      pooling_enabled: false,
      product: (src as any).product ?? null,
      quantity: null,
      notes: `Powtórne zamówienie (duplikat leada ${leadId.slice(0, 8)})`,
    } as any)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (row as any) ?? null;
}

// Map custom status_key to underlying enum where possible; leaves enum unchanged otherwise.
const ENUM_VALUES = new Set(["nowy", "w_kontakcie", "oferta", "wygrany", "przegrany"]);

export const setLeadStatusKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status_key: z.string().min(1).max(40),
      decision: z.enum(["rollback", "duplicate"]).optional().nullable(),
      reason: z.string().max(1000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Opuścień stanu "Zrealizowany": decyzja użytkownika z popupu.
    // rollback = cofnij operacje (magazyn + płatność); duplicate = powtórne zamówienie.
    let rolledBack: number | null = null;
    let duplicateId: string | null = null;
    if (data.decision === "rollback") {
      rolledBack = await rollbackRealization(context as any, data.id);
    }
    if (data.decision === "duplicate") {
      const dup = await createLeadDuplicate(context, data.id);
      duplicateId = dup?.id ?? null;
    }

    // Anulowanie statusem = pełne anulowanie leada (zwolnienie rezerwacji,
    // odpięcie z transportów, trafia do zakładki „Anulowane").
    if (data.status_key === "przegrany") {
      const reason = data.reason?.trim();
      const { error: ce } = await context.supabase.rpc("cancel_lead", {
        _lead_id: data.id,
        _reason: reason || "Zmiana statusu na Anulowany",
      } as any);
      if (ce) throw new Error(ce.message);
      if (reason) {
        await context.supabase.from("lead_notes").insert({
          lead_id: data.id,
          author_id: context.userId,
          body: `Anulowano: ${reason}`,
        } as any);
      }
      const { error: ue } = await context.supabase
        .from("leads")
        .update({ status_key: "przegrany", status_changed_at: new Date().toISOString() } as any)
        .eq("id", data.id);
      if (ue) throw new Error(ue.message);
      return { ok: true, cancelled: true, stock: null, rolled_back: rolledBack, duplicate_id: duplicateId };
    }

    const patch: Record<string, unknown> = { status_key: data.status_key, status_changed_at: new Date().toISOString() };
    if (ENUM_VALUES.has(data.status_key)) patch.status = data.status_key;
    // Powrót z anulowania — lead wraca do aktywnej pracy.
    patch.deleted_at = null;
    patch.deleted_by = null;
    patch.deleted_reason = null;
    const { error } = await context.supabase
      .from("leads")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);


    // Lead zrealizowany = towar wydany. Wydanie zapisuje się automatycznie,
    // bez drugiego kliknięcia. Idempotentne — nie zdubluje istniejącego wydania.
    let stock: any = null;
    if (data.status_key === "wygrany") {
      const { data: res, error: se } = await context.supabase.rpc("fulfill_lead_stock" as any, {
        _lead_id: data.id,
      } as any);
      if (se) {
        return { ok: true, stock_error: se.message, rolled_back: rolledBack, duplicate_id: duplicateId };
      }
      stock = res ?? null;
    }
    return { ok: true, stock, rolled_back: rolledBack, duplicate_id: duplicateId };
  });
