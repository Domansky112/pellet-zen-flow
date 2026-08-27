import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Partie dostaw leada ("rozbicie na partie").
 * Jedna partia = jeden fizyczny kurs (własna pozycja w poczekalni, własny transport, własna WZ).
 */

const BATCH_SELECT =
  "id, lead_id, batch_no, tons, status, transport_id, notes, delivered_at, created_at";

export const listLeadBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_batches")
      .select(BATCH_SELECT)
      .eq("lead_id", data.lead_id)
      .order("batch_no", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Zapisuje pełną listę partii leada. Partie już zaplanowane (z transportem)
 * są nietykalne — nadpisujemy tylko te, które jeszcze czekają.
 */
export const saveLeadBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        tons: z.array(z.number().positive().max(60)).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: eErr } = await context.supabase
      .from("lead_batches")
      .select("id, batch_no, transport_id, status")
      .eq("lead_id", data.lead_id)
      .order("batch_no", { ascending: true });
    if (eErr) throw new Error(eErr.message);

    const locked = (existing ?? []).filter((b: any) => b.transport_id || b.status === "zrealizowana");
    const removable = (existing ?? []).filter((b: any) => !b.transport_id && b.status !== "zrealizowana");

    if (removable.length) {
      const { error } = await context.supabase
        .from("lead_batches")
        .delete()
        .in(
          "id",
          removable.map((b: any) => b.id),
        );
      if (error) throw new Error(error.message);
    }

    let nextNo = locked.reduce((m: number, b: any) => Math.max(m, Number(b.batch_no)), 0);
    const rows = data.tons.map((t) => ({
      lead_id: data.lead_id,
      batch_no: ++nextNo,
      tons: t,
      status: "oczekuje",
      created_by: context.userId,
    }));

    if (rows.length) {
      const { error } = await context.supabase.from("lead_batches").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { ok: true, locked: locked.length, created: rows.length };
  });

export const deleteLeadBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: batch, error: bErr } = await context.supabase
      .from("lead_batches")
      .select("id, transport_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!batch) throw new Error("Partia nie istnieje");
    if (batch.transport_id) throw new Error("Partia jest już przypisana do transportu");
    if (batch.status === "zrealizowana") throw new Error("Partia została już zrealizowana");

    const { error } = await context.supabase.from("lead_batches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
