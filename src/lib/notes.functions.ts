import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdInput = z.object({ lead_id: z.string().uuid() });

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_notes")
      .select("id, lead_id, author_id, body, edited, created_at, updated_at")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listLeadIdsWithNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("lead_notes").select("lead_id");
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const r of data ?? []) if ((r as any).lead_id) set.add((r as any).lead_id as string);
    return Array.from(set);
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      lead_id: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lead_notes")
      .insert({ lead_id: data.lead_id, body: data.body, author_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_notes")
      .update({ body: data.body })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
