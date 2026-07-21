import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("offer_templates")
      .select("id, name, product, subject, body, channel, is_active")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAllTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Brak uprawnień");
    const { data, error } = await context.supabase
      .from("offer_templates")
      .select("id, name, product, subject, body, channel, is_active, created_at, updated_at")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  product: z.string().trim().max(80).nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(20000),
  channel: z.enum(["email", "sms"]).default("email"),
  is_active: z.boolean().default(true),
});

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => upsertSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Brak uprawnień");
    const payload = {
      name: data.name,
      product: data.product ?? null,
      subject: data.subject ?? null,
      body: data.body,
      channel: data.channel,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("offer_templates")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("offer_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Brak uprawnień");
    const { error } = await context.supabase
      .from("offer_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const TEMPLATE_VARIABLES: { key: string; description: string }[] = [
  { key: "imie_klienta", description: "Imię klienta" },
  { key: "nazwisko", description: "Nazwisko klienta" },
  { key: "pelna_nazwa", description: "Pełna nazwa / firma" },
  { key: "tonaz", description: "Tonaż zamówienia (t)" },
  { key: "rodzaj_pelletu", description: "Rodzaj produktu / pelletu" },
  { key: "cena_jedn_netto", description: "Cena jednostkowa netto (zł/t)" },
  { key: "stawka_vat", description: "Stawka VAT (%)" },
  { key: "towar_netto", description: "Wartość towaru netto (zł)" },
  { key: "towar_vat", description: "Kwota VAT od towaru (zł)" },
  { key: "towar_brutto", description: "Wartość towaru brutto (zł)" },
  { key: "transport_netto", description: "Koszt transportu netto (zł)" },
  { key: "transport_vat", description: "VAT od transportu (zł)" },
  { key: "transport_brutto", description: "Koszt transportu brutto (zł)" },
  { key: "suma_netto", description: "Suma netto (towar + transport)" },
  { key: "suma_vat", description: "Suma VAT (towar + transport)" },
  { key: "suma_brutto", description: "Suma brutto (do zapłaty)" },
  { key: "cena_transportu", description: "Cena transportu brutto (alias)" },
  { key: "adres_dostawy", description: "Adres dostawy" },
  { key: "miasto", description: "Miasto klienta" },
  { key: "telefon", description: "Telefon klienta" },
  { key: "email", description: "E-mail klienta" },
  { key: "imie_handlowca", description: "Imię/e-mail handlowca" },
  { key: "data", description: "Dzisiejsza data" },
];

export function renderTemplateBody(
  body: string,
  vars: Record<string, string | number | null | undefined>,
) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}
