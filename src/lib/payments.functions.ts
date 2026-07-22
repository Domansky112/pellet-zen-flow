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

    const { error } = await context.supabase.from("leads").update(patch).eq("id", data.leadId);
    if (error) throw new Error(error.message);
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
      .update({ driver_settled_at: new Date().toISOString(), driver_settled_by: context.userId })
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
      .update({ payment_reminded_at: new Date().toISOString() })
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
