import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

const StatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["nowy", "w_kontakcie", "oferta", "wygrany", "przegrany"]),
});

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AssignInput = z.object({ id: z.string().uuid() });

export const assignToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ assigned_to: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CreateInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postal_code: z.string().trim().max(12).optional().or(z.literal("")),
  source: z.enum(["www", "email", "b2b", "telefon", "inne"]).default("inne"),
  product: z.enum(["pellet_paleta", "pellet_bigbag", "inne"]).optional().nullable(),
  quantity: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().or(z.literal("")),
  priority: z.number().int().min(0).max(5).default(0),
  pooling_enabled: z.boolean().default(false),
  pooling_wait_until: z.string().optional().nullable(),
});

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      city: data.city || null,
      postal_code: data.postal_code || null,
      source: data.source,
      product: data.product ?? null,
      quantity: data.quantity ?? null,
      notes: data.notes || null,
      priority: data.priority,
      pooling_enabled: data.pooling_enabled,
      pooling_wait_until: data.pooling_wait_until || null,
      pooling_status: data.pooling_enabled ? "poczekalnia" : "brak",
      status: "nowy",
    };
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert(payload as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
