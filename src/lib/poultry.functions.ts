import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserScope } from "@/lib/scope";

const StatusEnum = z.enum(["do_zadzwonienia", "w_trakcie", "zatwierdzone", "odrzucone"]);

export const listPoultryReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await getUserScope(context.supabase, context.userId);
    let q = context.supabase
      .from("poultry_reminders")
      .select(
        `id, farm_name, tonnage, assigned_to, reminder_date, status, notes,
         lead_id, new_lead_id, created_at,
         leads:lead_id (id, lead_number, name, first_name, last_name, city, phone, email, invoice_company, cycle_days, assigned_to)`,
      )
      .order("reminder_date", { ascending: true })
      .limit(500);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    let rows = data ?? [];
    // Handlowiec widzi wyłącznie wstawienia swoich leadów
    if (scope.salesOnly) {
      rows = rows.filter(
        (r: any) =>
          r.assigned_to === scope.userId || r.leads?.assigned_to === scope.userId,
      );
    }
    return rows;
  });

// Blokuje operację, gdy handlowiec próbuje modyfikować wstawienie cudzego leada.
async function assertReminderInScope(supabase: any, userId: string, id: string) {
  const scope = await getUserScope(supabase, userId);
  if (!scope.salesOnly) return;
  const { data } = await supabase
    .from("poultry_reminders")
    .select("assigned_to, leads:lead_id (assigned_to)")
    .eq("id", id)
    .maybeSingle();
  const owned =
    data && (data.assigned_to === userId || (data.leads as any)?.assigned_to === userId);
  if (!owned) throw new Error("Brak uprawnień do tego wstawienia");
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  status: StatusEnum.optional(),
  reminder_date: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export const updatePoultryReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.reminder_date !== undefined) patch.reminder_date = data.reminder_date;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await context.supabase.from("poultry_reminders").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteInput = z.object({ id: z.string().uuid() });

export const deletePoultryReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("poultry_reminders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const LinkInput = z.object({ id: z.string().uuid(), new_lead_id: z.string().uuid() });

export const linkPoultryReminderNewLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LinkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("poultry_reminders")
      .update({ new_lead_id: data.new_lead_id, status: "zatwierdzone" } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
