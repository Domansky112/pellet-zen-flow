import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const NumLike = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(/\s+/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return v;
}, z.number().nonnegative().max(1_000_000));

const EmployeeInput = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).nullable().optional(),
  position: z.string().trim().max(100).nullable().optional(),
  daily_rate: NumLike.default(0),
  pallet_rate: NumLike.default(0),
  status: z.enum(["aktywny", "nieaktywny"]).default("aktywny"),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const WorkLogInput = z.object({
  employee_id: z.string().uuid(),
  work_date: DateStr,
  entry_type: z.enum(["dniowka", "akord", "wolne", "nieobecnosc"]),
  pallets_count: NumLike.default(0),
  rate: NumLike.default(0),
  status: z.enum(["do_wyplaty", "wyplacone"]).default("do_wyplaty"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Tylko administrator");
}

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("employees")
      .select("*")
      .order("status", { ascending: true })
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EmployeeInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = { ...data, created_by: context.userId } as any;
    const { data: row, error } = data.id
      ? await context.supabase.from("employees").update(payload).eq("id", data.id).select().single()
      : await context.supabase.from("employees").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("employees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Kalendarz pracowniczy ────────────────────────────────────
export const listWorkLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employee_id: z.string().uuid(), from: DateStr, to: DateStr }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("employee_work_logs")
      .select("*")
      .eq("employee_id", data.employee_id)
      .gte("work_date", data.from)
      .lte("work_date", data.to)
      .order("work_date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Przegląd całego zespołu — kto kiedy pracował (bez wybierania pracownika) */
export const listAllWorkLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: DateStr, to: DateStr }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("employee_work_logs")
      .select("id, employee_id, work_date, entry_type, amount, pallets_count, status, employees(full_name)")
      .gte("work_date", data.from)
      .lte("work_date", data.to)
      .order("work_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      ...r,
      full_name: r.employees?.full_name ?? "—",
    }));
  });

/** Podpowiedź z produkcji: przyjęcia palet danego dnia (z magazynu / bota) */
export const getProductionHint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: DateStr }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("stock_events")
      .select("quantity, note, created_at")
      .eq("product", "pellet_paleta")
      .eq("txn_type", "przyjecie")
      .gte("created_at", `${data.date}T00:00:00`)
      .lte("created_at", `${data.date}T23:59:59`);
    if (error) throw new Error(error.message);
    const tons = (rows ?? []).reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0);
    return { tons, entries: (rows ?? []).length };
  });

export const saveWorkLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkLogInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const amount =
      data.entry_type === "akord"
        ? Number((data.pallets_count * data.rate).toFixed(2))
        : data.entry_type === "dniowka"
          ? Number(data.rate.toFixed(2))
          : 0;
    const { data: row, error } = await context.supabase
      .from("employee_work_logs")
      .upsert(
        {
          employee_id: data.employee_id,
          work_date: data.work_date,
          entry_type: data.entry_type,
          pallets_count: data.entry_type === "akord" ? data.pallets_count : 0,
          rate: data.rate,
          amount,
          status: data.status,
          notes: data.notes ?? null,
          created_by: context.userId,
        } as any,
        { onConflict: "employee_id,work_date" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteWorkLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("employee_work_logs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Księguje wynagrodzenie za miesiąc jako koszt (kategoria: wynagrodzenia_robocizna, VAT zw / 0%) */
export const postPayrollToExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employee_id: z.string().uuid(), from: DateStr, to: DateStr }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: emp, error: eErr } = await context.supabase
      .from("employees")
      .select("id, full_name")
      .eq("id", data.employee_id)
      .single();
    if (eErr) throw new Error(eErr.message);

    const { data: logs, error } = await context.supabase
      .from("employee_work_logs")
      .select("id, amount, status, pallets_count, entry_type")
      .eq("employee_id", data.employee_id)
      .gte("work_date", data.from)
      .lte("work_date", data.to)
      .eq("status", "do_wyplaty");
    if (error) throw new Error(error.message);

    const rows = (logs ?? []).filter((l: any) => Number(l.amount) > 0);
    const total = rows.reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
    if (total <= 0) throw new Error("Brak kwot do wypłaty w wybranym okresie");

    const { data: expense, error: xErr } = await context.supabase
      .from("expenses")
      .insert({
        description: `Wynagrodzenie — ${emp.full_name} (${data.from} → ${data.to})`,
        amount: Number(total.toFixed(2)),
        expense_date: data.to,
        category: "wynagrodzenia_robocizna",
        vat_rate: 0,
        employee_id: data.employee_id,
        period_start: data.from,
        period_end: data.to,
        created_by: context.userId,
      } as any)
      .select()
      .single();
    if (xErr) throw new Error(xErr.message);

    await context.supabase
      .from("employee_work_logs")
      .update({ status: "wyplacone", expense_id: expense.id } as any)
      .in("id", rows.map((r: any) => r.id));

    await context.supabase.from("audit_log").insert({
      entity_type: "payroll",
      entity_id: expense.id,
      action: "payroll_posted",
      actor_id: context.userId,
      details: { employee: emp.full_name, amount: total, from: data.from, to: data.to, days: rows.length } as any,
    } as any);

    return { ok: true, amount: total, days: rows.length, expense_id: expense.id };
  });
