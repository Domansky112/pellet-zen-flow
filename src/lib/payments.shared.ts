import { z } from "zod";

export const LEAD_COLS =
  "id, lead_number, name, first_name, last_name, phone, email, city, postal_code, product, quantity, invoice_company, invoice_nip, invoice_address, payment_method, payment_status, payment_amount_gross, invoice_number, receipt_number, payment_reminded_at, driver_settled_at, reservation_status, delivered_at, urgent_no_fuel, sales_vat_rate, transport_cost_gross, transport_vat_rate";

export const PaymentStatusEnum = z.enum([
  "nieoplacone",
  "czeka_przelew",
  "oplacone_gotowka",
  "oplacone_przelew",
  "zaliczka",
]);

export const AmountLike = z.preprocess((v) => {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/\s+/g, "").replace(",", ".");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number().nonnegative().max(10_000_000).nullable());

export const UpdatePaymentInput = z.object({
  leadId: z.string().uuid(),
  payment_status: PaymentStatusEnum.optional(),
  payment_method: z.string().max(50).optional(),
  invoice_number: z.string().max(64).nullable().optional(),
  receipt_number: z.string().max(64).nullable().optional(),
  payment_amount_gross: AmountLike.optional(),
});

export const SettleInput = z.object({ transportId: z.string().uuid() });

export const ReminderInput = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["email", "sms"]),
});

export const ExpenseInput = z.object({
  description: z.string().trim().min(1).max(500),
  amount: AmountLike.transform((v) => (v ?? 0) as number).pipe(z.number().nonnegative().max(10_000_000)),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(60).default("inne"),
  vat_rate: z.coerce.number().refine((v) => [0, 8, 23].includes(v), "Dozwolone stawki VAT: 0, 8, 23").default(23),
  notes: z.string().trim().max(2000).optional().nullable(),
  fixed_asset_id: z.string().uuid().nullable().optional(),
});

export const RangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const DeleteExpenseInput = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export async function assertStaff(context: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isSales }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "sales" }),
  ]);
  if (!isAdmin && !isSales) throw new Error("Brak uprawnień — wymagana rola admin/sales.");
}
