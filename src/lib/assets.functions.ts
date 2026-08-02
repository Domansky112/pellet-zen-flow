import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ASSET_CATEGORIES = [
  { value: "pojazdy", label: "Pojazdy" },
  { value: "maszyny", label: "Maszyny i urządzenia" },
  { value: "magazyn", label: "Sprzęt magazynowy" },
  { value: "inne", label: "Inne" },
] as const;

export const ASSET_STATUSES = [
  { value: "sprawny", label: "Sprawny / w użyciu" },
  { value: "serwis", label: "W naprawie / serwis" },
  { value: "wycofany", label: "Zezłomowany / sprzedany" },
] as const;

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const AssetInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  category: z.enum(["pojazdy", "maszyny", "magazyn", "inne"]).default("inne"),
  identifier: z.string().trim().max(100).nullable().optional(),
  purchase_value: z.preprocess((v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "string") {
      const n = Number(v.trim().replace(/\s+/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    return v;
  }, z.number().nonnegative().max(100_000_000).nullable()).optional(),
  purchase_date: DateStr,
  next_service_date: DateStr,
  status: z.enum(["sprawny", "serwis", "wycofany"]).default("sprawny"),
  notes: z.string().trim().max(2000).nullable().optional(),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Brak uprawnień — wymagana rola administratora.");
}

export const listFixedAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ includeArchived: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("fixed_assets")
      .select("*")
      .order("name", { ascending: true })
      .limit(500);
    if (!data.includeArchived) q = q.is("archived_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    const totals: Record<string, number> = {};
    if (ids.length) {
      const { data: exps } = await context.supabase
        .from("expenses")
        .select("fixed_asset_id, amount")
        .in("fixed_asset_id", ids)
        .is("deleted_at", null);
      for (const e of exps ?? []) {
        const k = (e as any).fixed_asset_id as string;
        totals[k] = (totals[k] ?? 0) + Number((e as any).amount ?? 0);
      }
    }
    return (rows ?? []).map((r: any) => ({ ...r, expenses_total: totals[r.id] ?? 0 }));
  });

export const listAssetExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assetId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("expenses")
      .select("id, description, amount, expense_date, category, notes")
      .eq("fixed_asset_id", data.assetId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssetInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = {
      name: data.name,
      category: data.category,
      identifier: data.identifier || null,
      purchase_value: data.purchase_value ?? null,
      purchase_date: data.purchase_date || null,
      next_service_date: data.next_service_date || null,
      status: data.status,
      notes: data.notes || null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("fixed_assets")
        .update(payload as any)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("fixed_assets")
      .insert({ ...payload, created_by: context.userId } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), restore: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("fixed_assets")
      .update({ archived_at: data.restore ? null : new Date().toISOString() } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("fixed_assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
