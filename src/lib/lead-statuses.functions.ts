import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LeadStatus = {
  key: string;
  label: string;
  color: string;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
};

export const listLeadStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lead_statuses")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LeadStatus[];
  });

const KeyRe = /^[a-z0-9_]{2,40}$/;
const UpsertInput = z.object({
  key: z.string().trim().regex(KeyRe, "Klucz: małe litery, cyfry, _"),
  label: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Kolor HEX np. #ea580c"),
  sort_order: z.number().int().min(0).max(9999).default(100),
  is_active: z.boolean().default(true),
});

export const upsertLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Tylko administrator");
    const { error } = await context.supabase
      .from("lead_statuses")
      .upsert({ ...data } as any, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Tylko administrator");
    const { data: row } = await context.supabase
      .from("lead_statuses")
      .select("is_system")
      .eq("key", data.key)
      .single();
    if ((row as any)?.is_system) throw new Error("Statusu systemowego nie można usunąć");
    const { error } = await context.supabase.from("lead_statuses").delete().eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Map custom status_key to underlying enum where possible; leaves enum unchanged otherwise.
const ENUM_VALUES = new Set(["nowy", "w_kontakcie", "oferta", "wygrany", "przegrany"]);

export const setLeadStatusKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status_key: z.string().min(1).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status_key: data.status_key };
    if (ENUM_VALUES.has(data.status_key)) patch.status = data.status_key;
    const { error } = await context.supabase
      .from("leads")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
