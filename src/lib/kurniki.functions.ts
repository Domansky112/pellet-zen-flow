import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserScope } from "@/lib/scope";

export const listPoultryFarms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await getUserScope(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, lead_number, name, invoice_company, invoice_nip, street, postal_code, city, phone, status_key, status, quantity, sold_units, payment_amount_gross, cycle_days, created_at, delivered_at, parent_lead_id, assigned_to, deleted_at, notes")
      .eq("is_b2b_kurnik", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    let rows: any[] = data ?? [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const rootOf = (r: any): string => {
      let cur = r; const seen = new Set<string>();
      while (cur.parent_lead_id && byId.has(cur.parent_lead_id) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parent_lead_id); }
      return cur.id;
    };
    const { data: rem } = await context.supabase
      .from("poultry_reminders").select("lead_id, reminder_date, status")
      .in("status", ["do_zadzwonienia", "w_trakcie"]).order("reminder_date");
    const groups = new Map<string, any[]>();
    const norm = (v: any) => String(v ?? "").toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g, "");
    const locKey = (r: any) => {
      const nip = String(r.invoice_nip ?? "").replace(/\D/g, "");
      if (nip.length >= 10) return "n:" + nip;
      if (norm(r.invoice_company)) return "c:" + norm(r.invoice_company);
      const addr = norm(r.street) + "|" + norm(r.postal_code) + "|" + norm(r.city);
      if (norm(r.street) && (norm(r.postal_code) || norm(r.city))) return "a:" + addr;
      return "r:" + rootOf(r);
    };
    const keyRoot = new Map<string, string>();
    for (const r of rows) {
      const root = byId.get(rootOf(r));
      const k = locKey(root);
      if (!keyRoot.has(k)) keyRoot.set(k, root.id);
      const g = keyRoot.get(k)!;
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    let farms = [...groups.entries()].map(([rootId, leads]) => {
      const root = byId.get(rootId);
      const ids = new Set(leads.map((l) => l.id));
      const next = (rem ?? []).find((x: any) => ids.has(x.lead_id));
      const done = leads.filter((l) => l.status_key === "wygrany" || l.status === "wygrany");
      return {
        rootId,
        name: root.invoice_company || root.name,
        nip: root.invoice_nip, city: root.city, phone: root.phone, cycle_days: root.cycle_days,
        assigned: leads.map((l) => l.assigned_to),
        orders: leads.length,
        delivered: done.length,
        tons: done.reduce((s, l) => s + Number(l.quantity ?? 0), 0),
        revenue: done.reduce((s, l) => s + Number(l.payment_amount_gross ?? 0), 0),
        last_delivery: done.map((l) => l.delivered_at).filter(Boolean).sort().pop() ?? null,
        next_reminder: next?.reminder_date ?? null,
        leads: [...leads].reverse(),
      };
    });
    if (scope.salesOnly) farms = farms.filter((f) => f.assigned.includes(scope.userId));
    return farms.sort((a, b) => (a.next_reminder ?? "9999").localeCompare(b.next_reminder ?? "9999"));
  });

import { z } from "zod";

const FarmOrderInput = z.object({
  source_lead_id: z.string().uuid(),
  quantity: z.number().positive().max(10000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  affiliate_partner_id: z.string().uuid().nullable().optional(),
});

/** Nowe zgłoszenie dla fermy: kopiuje dane z ostatniego leada fermy i opcjonalnie przypina afilianta. */
export const createFarmOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FarmOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await getUserScope(context.supabase, context.userId);
    const { data: src, error: se } = await context.supabase
      .from("leads")
      .select("first_name, last_name, name, email, phone, city, postal_code, street, invoice_company, invoice_nip, invoice_address, has_unloading_equipment, cycle_days, product, delivery_window, access_tight, access_tonnage_limit, access_unpaved, assigned_to, pooling_lat, pooling_lng, pooling_km_from_base, notes")
      .eq("id", data.source_lead_id)
      .single();
    if (se || !src) throw new Error(se?.message ?? "Lead źródłowy nie istnieje");
    if (scope.salesOnly && src.assigned_to !== context.userId) throw new Error("Brak dostępu do tej fermy");

    let affiliate: string | null = null;
    if (data.affiliate_partner_id) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (!isAdmin) throw new Error("Tylko administrator może przypisać afilianta.");
      affiliate = data.affiliate_partner_id;
    }

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        ...src,
        assigned_to: scope.salesOnly ? context.userId : src.assigned_to,
        source: "b2b",
        is_b2b_kurnik: true,
        status: "nowy",
        reservation_status: "brak",
        pooling_status: "brak",
        pooling_enabled: false,
        quantity: data.quantity ?? null,
        parent_lead_id: data.source_lead_id,
        affiliate_partner_id: affiliate,
        notes: data.notes?.trim() || src.notes?.trim() || "Nowe zgłoszenie z modułu Kurniki",
      } as any)
      .select("id, lead_number")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
