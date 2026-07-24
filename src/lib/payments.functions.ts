import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEAD_COLS =
  "id, lead_number, name, first_name, last_name, phone, email, city, postal_code, product, quantity, invoice_company, invoice_nip, invoice_address, payment_method, payment_status, payment_amount_gross, invoice_number, receipt_number, payment_reminded_at, driver_settled_at, reservation_status, delivered_at, urgent_no_fuel";

// ─────────────────────────────────────────────────────────────
// Nadchodzące transporty (planowane) — z leadami do pobrania
// ─────────────────────────────────────────────────────────────
export const listUpcomingPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transports")
      .select(
        `id, scheduled_date, city, postal_code, destination_address, driver, vehicle, status, pool_id,
         transport_items(id, product, quantity, leads(${LEAD_COLS}))`,
      )
      .in("status", ["planowany", "potwierdzony", "w_trasie"])
      .order("scheduled_date", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ─────────────────────────────────────────────────────────────
// Zrealizowane transporty i rozliczenia
// ─────────────────────────────────────────────────────────────
export const listCompletedPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transports")
      .select(
        `id, scheduled_date, city, postal_code, destination_address, driver, vehicle, status, pool_id,
         transport_items(id, product, quantity, leads(${LEAD_COLS}))`,
      )
      .eq("status", "dostarczony")
      .order("scheduled_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Fallback: leady wydane bez powiązania z transportem
export const listDeliveredLeadsWithoutTransport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(LEAD_COLS)
      .eq("reservation_status", "wydany")
      .is("deleted_at", null)
      .order("delivered_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ─────────────────────────────────────────────────────────────
// Update statusu / numerów płatności
// ─────────────────────────────────────────────────────────────
const PaymentStatusEnum = z.enum([
  "nieoplacone",
  "czeka_przelew",
  "oplacone_gotowka",
  "oplacone_przelew",
  "zaliczka",
]);

const UpdatePaymentInput = z.object({
  leadId: z.string().uuid(),
  payment_status: PaymentStatusEnum.optional(),
  payment_method: z.string().optional(),
  invoice_number: z.string().max(64).nullable().optional(),
  receipt_number: z.string().max(64).nullable().optional(),
  payment_amount_gross: z.number().nonnegative().nullable().optional(),
});

export const updateLeadPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdatePaymentInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.payment_status !== undefined) patch.payment_status = data.payment_status;
    if (data.payment_method !== undefined) patch.payment_method = data.payment_method;
    if (data.invoice_number !== undefined) patch.invoice_number = data.invoice_number;
    if (data.receipt_number !== undefined) patch.receipt_number = data.receipt_number;
    if (data.payment_amount_gross !== undefined) patch.payment_amount_gross = data.payment_amount_gross;

    const { error } = await context.supabase.from("leads").update(patch as any).eq("id", data.leadId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      entity_type: "payment",
      entity_id: data.leadId,
      action: "payment_update",
      actor_id: context.userId,
      details: patch as any,
    } as any);

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// Rozliczenie trasy z kierowcą (oznacza gotówkowe płatności jako przyjęte do kasy)
// ─────────────────────────────────────────────────────────────
const SettleInput = z.object({ transportId: z.string().uuid() });

export const settleTransportWithDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettleInput.parse(d))
  .handler(async ({ data, context }) => {
    // pobierz leadów z tego transportu opłaconych gotówką
    const { data: items, error } = await context.supabase
      .from("transport_items")
      .select("leads(id, payment_status)")
      .eq("transport_id", data.transportId);
    if (error) throw new Error(error.message);

    const leadIds = (items ?? [])
      .map((i: any) => i.leads)
      .filter((l: any) => l && l.payment_status === "oplacone_gotowka")
      .map((l: any) => l.id);

    if (leadIds.length === 0) return { settled: 0 };

    const { error: upErr } = await context.supabase
      .from("leads")
      .update({ driver_settled_at: new Date().toISOString(), driver_settled_by: context.userId } as any)
      .in("id", leadIds);
    if (upErr) throw new Error(upErr.message);
    return { settled: leadIds.length };
  });

// ─────────────────────────────────────────────────────────────
// Przypomnienie o płatności (znacznik + zwrot linku mailto/sms)
// ─────────────────────────────────────────────────────────────
const ReminderInput = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["email", "sms"]),
});

export const markPaymentReminderSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReminderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ payment_reminded_at: new Date().toISOString() } as any)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    // audit note
    await context.supabase.from("lead_notes").insert({
      lead_id: data.leadId,
      body: `📨 Wysłano przypomnienie o płatności (${data.channel.toUpperCase()})`,
      author_id: context.userId,
    });
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// KOSZTY (expenses)
// ─────────────────────────────────────────────────────────────
const ExpenseInput = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().nonnegative().max(10_000_000),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(60).default("inne"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const RangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(500);
    if (data.from) q = q.gte("expense_date", data.from);
    if (data.to) q = q.lte("expense_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExpenseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("expenses")
      .insert({ ...data, created_by: context.userId } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      entity_type: "expense",
      entity_id: row.id,
      action: "expense_added",
      actor_id: context.userId,
      details: { amount: data.amount, description: data.description, category: data.category } as any,
    } as any);
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      entity_type: "expense",
      entity_id: data.id,
      action: "expense_deleted",
      actor_id: context.userId,
    } as any);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// Podsumowanie finansowe w zakresie dat
// ─────────────────────────────────────────────────────────────
export const getFinancialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let leadsQ = context.supabase
      .from("leads")
      .select("id, lead_number, name, first_name, last_name, invoice_company, quantity, city, payment_amount_gross, payment_method, payment_status, delivered_at, reservation_status")
      .eq("reservation_status", "wydany")
      .is("deleted_at", null)
      .order("delivered_at", { ascending: false })
      .limit(1000);
    if (data.from) leadsQ = leadsQ.gte("delivered_at", `${data.from}T00:00:00`);
    if (data.to) leadsQ = leadsQ.lte("delivered_at", `${data.to}T23:59:59`);
    const { data: leads, error: le } = await leadsQ;
    if (le) throw new Error(le.message);

    let expQ = context.supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(1000);
    if (data.from) expQ = expQ.gte("expense_date", data.from);
    if (data.to) expQ = expQ.lte("expense_date", data.to);
    const { data: expenses, error: ee } = await expQ;
    if (ee) throw new Error(ee.message);

    let income = 0, cash = 0, transfer = 0, pending = 0;
    for (const l of leads ?? []) {
      const amt = Number(l.payment_amount_gross ?? 0);
      income += amt;
      if (l.payment_status === "oplacone_gotowka") cash += amt;
      else if (l.payment_status === "oplacone_przelew") transfer += amt;
      else pending += amt;
    }
    const totalCosts = (expenses ?? []).reduce((s, e: any) => s + Number(e.amount ?? 0), 0);

    return {
      income, cash, transfer, pending,
      totalCosts,
      balance: income - totalCosts,
      leads: leads ?? [],
      expenses: expenses ?? [],
    };
  });

// ─────────────────────────────────────────────────────────────
// Audit log — dziennik zdarzeń finansowych
// ─────────────────────────────────────────────────────────────
export const listPaymentAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("audit_log")
      .select("*")
      .in("entity_type", ["payment", "expense"])
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // enrich with lead numbers + names
    const leadIds = Array.from(new Set((rows ?? []).filter((r: any) => r.entity_type === "payment" && r.entity_id).map((r: any) => r.entity_id)));
    let leadMap: Record<string, any> = {};
    if (leadIds.length) {
      const { data: leads } = await context.supabase
        .from("leads")
        .select("id, lead_number, name, first_name, last_name, invoice_company")
        .in("id", leadIds);
      leadMap = Object.fromEntries((leads ?? []).map((l: any) => [l.id, l]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, lead: r.entity_type === "payment" ? leadMap[r.entity_id] ?? null : null }));
  });
