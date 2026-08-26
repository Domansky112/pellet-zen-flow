import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AFFILIATE_METHODS = [
  { value: "przelew", label: "Przelew bankowy" },
  { value: "gotowka", label: "Gotówka" },
  { value: "kompensata", label: "Kompensata / rabat" },
] as const;

const Amount = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(/\s+/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return v;
}, z.number().nonnegative().max(10_000_000).nullable());

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const PartnerInput = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  nip: z.string().trim().max(20).nullable().optional(),
  bank_account: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["aktywny", "nieaktywny"]).default("aktywny"),
});

const CommissionInput = z.object({
  id: z.string().uuid().optional(),
  partner_id: z.string().uuid(),
  lead_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(300),
  amount: Amount.transform((v) => (v ?? 0) as number).pipe(z.number().nonnegative()),
  tons: Amount.nullable().optional(),
  rate_per_ton: Amount.nullable().optional(),
  commission_date: DateStr,
  notes: z.string().trim().max(1000).nullable().optional(),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Brak uprawnień — wymagana rola administratora.");
}

export type AffiliatePartnerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  nip: string | null;
  bank_account: string | null;
  notes: string | null;
  status: string;
  pending_total: number;
  pending_count: number;
  paid_total: number;
};

export const listAffiliatePartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [{ data: partners, error }, { data: comms, error: e2 }] = await Promise.all([
      context.supabase
        .from("affiliate_partners")
        .select("id, full_name, phone, email, nip, bank_account, notes, status")
        .order("full_name", { ascending: true })
        .limit(500),
      context.supabase.from("affiliate_commissions").select("partner_id, amount, status").limit(5000),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);

    const rows: AffiliatePartnerRow[] = (partners ?? []).map((p: any) => {
      const mine = (comms ?? []).filter((c: any) => c.partner_id === p.id);
      const pending = mine.filter((c: any) => c.status === "nierozliczona");
      return {
        ...p,
        pending_total: pending.reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0),
        pending_count: pending.length,
        paid_total: mine
          .filter((c: any) => c.status === "wyplacona")
          .reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0),
      };
    });
    return { partners: rows };
  });

export const upsertAffiliatePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PartnerInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...rest } = data;
    const payload = id ? { id, ...rest } : { ...rest, created_by: context.userId };
    const { error } = await context.supabase.from("affiliate_partners").upsert(payload as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAffiliatePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("affiliate_partners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAffiliateCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partner_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [{ data: rows, error }, { data: settlements, error: e2 }] = await Promise.all([
      context.supabase
        .from("affiliate_commissions")
        .select("id, lead_id, description, amount, tons, rate_per_ton, commission_date, status, settlement_id, notes, leads(lead_number, name)")
        .eq("partner_id", data.partner_id)
        .order("commission_date", { ascending: false })
        .limit(1000),
      context.supabase
        .from("affiliate_settlements")
        .select("id, total_amount, paid_at, method, notes")
        .eq("partner_id", data.partner_id)
        .order("paid_at", { ascending: false })
        .limit(200),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);
    return { commissions: rows ?? [], settlements: settlements ?? [] };
  });

export const upsertAffiliateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommissionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...rest } = data;
    const payload = id ? { id, ...rest } : { ...rest, created_by: context.userId };
    const { error } = await context.supabase.from("affiliate_commissions").upsert(payload as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAffiliateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase
      .from("affiliate_commissions")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.status === "wyplacona") throw new Error("Nie można usunąć rozliczonej pozycji.");
    const { error } = await context.supabase.from("affiliate_commissions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const settleAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        partner_id: z.string().uuid(),
        commission_ids: z.array(z.string().uuid()).nullable().optional(),
        paid_at: DateStr,
        method: z.enum(["przelew", "gotowka", "kompensata"]).default("przelew"),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("settle_affiliate_commissions", {
      _partner_id: data.partner_id,
      _commission_ids: data.commission_ids ?? null,
      _paid_at: data.paid_at,
      _method: data.method,
      _notes: data.notes ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return res as { ok: boolean; total: number; count: number };
  });

export const searchLeadsForAffiliate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.q) return { leads: [] };
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("id, lead_number, name, city")
      .is("deleted_at", null)
      .or(`name.ilike.%${data.q}%,lead_number.ilike.%${data.q}%`)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return { leads: rows ?? [] };
  });
