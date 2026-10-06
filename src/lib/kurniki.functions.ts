import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserScope } from "@/lib/scope";

export const listPoultryFarms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await getUserScope(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, lead_number, name, invoice_company, city, phone, status_key, status, quantity, sold_units, payment_amount_gross, cycle_days, created_at, delivered_at, parent_lead_id, assigned_to, deleted_at")
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
    for (const r of rows) { const k = rootOf(r); groups.set(k, [...(groups.get(k) ?? []), r]); }
    let farms = [...groups.entries()].map(([rootId, leads]) => {
      const root = byId.get(rootId);
      const ids = new Set(leads.map((l) => l.id));
      const next = (rem ?? []).find((x: any) => ids.has(x.lead_id));
      const done = leads.filter((l) => l.status_key === "wygrany" || l.status === "wygrany");
      return {
        rootId,
        name: root.invoice_company || root.name,
        city: root.city, phone: root.phone, cycle_days: root.cycle_days,
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
