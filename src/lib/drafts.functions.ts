import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const BASE_ADDRESS = "Witoroża, 21-570 Drelów, Polska";
const DEFAULT_COST_PER_KM = 2.44;

export const VEHICLE_CLASSES = [
  { key: "male", label: "Małe auto (3,5 t)", capacity: 3.5 },
  { key: "srednie", label: "Średnie auto (12 t)", capacity: 12 },
  { key: "duzy", label: "Duży zestaw (24 t)", capacity: 24 },
] as const;

type DraftRow = {
  id: string;
  name: string;
  vehicle_class: string;
  capacity_tons: number;
  scheduled_date: string | null;
  delivery_window: string | null;
  status: string;
  transport_id: string | null;
  route_km: number | null;
  route_minutes: number | null;
  route_cost: number | null;
  cost_per_km: number | null;
  notes: string | null;
  created_at: string;
  transport_draft_items: Array<{
    id: string;
    lead_id: string;
    tons: number;
    stop_order: number;
    leads: any;
  }>;
};

const LEAD_SELECT =
  "id, lead_number, name, city, postal_code, invoice_address, product, quantity, phone, status, status_key, payment_status, reservation_status, pooling_lat, pooling_lng, has_unloading_equipment";

const DRAFT_SELECT = `id, name, vehicle_class, capacity_tons, scheduled_date, delivery_window, status, transport_id, route_km, route_minutes, route_cost, cost_per_km, notes, created_at,
  transport_draft_items(id, lead_id, tons, stop_order, leads(${LEAD_SELECT}))`;

function leadAddress(l: any): string {
  return (
    (l?.invoice_address as string) ||
    [l?.postal_code, l?.city].filter(Boolean).join(" ") ||
    (l?.city as string) ||
    ""
  );
}

async function readCostPerKm(supabase: any): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "transport_cost_per_km")
    .maybeSingle();
  const v = Number(data?.value?.pln_per_km);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_COST_PER_KM;
}

/** Optimized round-trip from base through all stops (Google Routes API). */
async function computeRoute(addresses: string[]) {
  if (addresses.length === 0) return { km: 0, minutes: 0, order: [] as number[] };
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey || !lovableKey) throw new Error("Brak konfiguracji Google Maps");

  const intermediates = addresses.slice(0, -1).map((a) => ({ address: a }));
  const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex",
    },
    body: JSON.stringify({
      origin: { address: BASE_ADDRESS },
      // Round trip: last stop is the final destination, then back to base is
      // approximated by requesting base as destination with all stops as
      // intermediates (optimized order).
      destination: { address: BASE_ADDRESS },
      intermediates: [...intermediates, { address: addresses[addresses.length - 1]! }],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      optimizeWaypointOrder: true,
      units: "METRIC",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Maps [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      optimizedIntermediateWaypointIndex?: number[];
    }>;
  };
  const route = json.routes?.[0];
  if (!route?.distanceMeters) throw new Error("Nie udało się wyznaczyć trasy dla podanych adresów");
  return {
    km: route.distanceMeters / 1000,
    minutes: route.duration ? Number(route.duration.replace("s", "")) / 60 : 0,
    order: route.optimizedIntermediateWaypointIndex ?? addresses.map((_, i) => i),
  };
}

async function recalc(supabase: any, draftId: string) {
  const { data: draft, error } = await supabase
    .from("transport_drafts")
    .select(DRAFT_SELECT)
    .eq("id", draftId)
    .single();
  if (error) throw new Error(error.message);

  const items = [...((draft as DraftRow).transport_draft_items ?? [])].sort(
    (a, b) => a.stop_order - b.stop_order,
  );
  const costPerKm = await readCostPerKm(supabase);

  if (items.length === 0) {
    await supabase
      .from("transport_drafts")
      .update({ route_km: 0, route_minutes: 0, route_cost: 0, cost_per_km: costPerKm })
      .eq("id", draftId);
    return;
  }

  const addresses = items.map((i) => leadAddress(i.leads)).filter(Boolean);
  if (addresses.length !== items.length) {
    // Missing addresses — keep tonnage but skip routing
    await supabase
      .from("transport_drafts")
      .update({ cost_per_km: costPerKm })
      .eq("id", draftId);
    return;
  }

  const { km, minutes, order } = await computeRoute(addresses);

  // Persist optimized stop order
  for (let pos = 0; pos < order.length; pos++) {
    const item = items[order[pos]!];
    if (item && item.stop_order !== pos) {
      await supabase.from("transport_draft_items").update({ stop_order: pos }).eq("id", item.id);
    }
  }

  await supabase
    .from("transport_drafts")
    .update({
      route_km: Math.round(km),
      route_minutes: Math.round(minutes),
      route_cost: Math.round(km * costPerKm),
      cost_per_km: costPerKm,
    })
    .eq("id", draftId);
}

export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transport_drafts")
      .select(DRAFT_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as DraftRow[];
  });

export const createDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(2).max(120),
        vehicle_class: z.enum(["male", "srednie", "duzy"]),
        capacity_tons: z.number().positive().max(60),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const costPerKm = await readCostPerKm(context.supabase);
    const { data: row, error } = await context.supabase
      .from("transport_drafts")
      .insert({
        name: data.name,
        vehicle_class: data.vehicle_class,
        capacity_tons: data.capacity_tons,
        notes: data.notes ?? null,
        cost_per_km: costPerKm,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(2).max(120).optional(),
        vehicle_class: z.enum(["male", "srednie", "duzy"]).optional(),
        capacity_tons: z.number().positive().max(60).optional(),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("transport_drafts")
      .update(patch)
      .eq("id", id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transport_drafts")
      .delete()
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addLeadToDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ draft_id: z.string().uuid(), lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: draft, error: dErr } = await context.supabase
      .from("transport_drafts")
      .select("id, status, capacity_tons, transport_draft_items(tons)")
      .eq("id", data.draft_id)
      .single();
    if (dErr || !draft) throw new Error(dErr?.message ?? "Wersja robocza nie istnieje");
    if (draft.status !== "draft") throw new Error("Ta wersja została już zatwierdzona");

    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .select("id, quantity, deleted_at")
      .eq("id", data.lead_id)
      .single();
    if (lErr || !lead) throw new Error("Lead nie istnieje");
    if (lead.deleted_at) throw new Error("Lead został anulowany");

    const tons = Number(lead.quantity ?? 0);
    const loaded = ((draft as any).transport_draft_items ?? []).reduce(
      (s: number, i: any) => s + Number(i.tons ?? 0),
      0,
    );
    if (loaded + tons > Number(draft.capacity_tons) + 0.001) {
      throw new Error(
        `Przekroczona ładowność: ${(loaded + tons).toFixed(1)} t / ${Number(draft.capacity_tons)} t. Wybierz większe auto lub inny lead.`,
      );
    }

    const { error } = await context.supabase.from("transport_draft_items").insert({
      draft_id: data.draft_id,
      lead_id: data.lead_id,
      tons,
      stop_order: ((draft as any).transport_draft_items ?? []).length,
    });
    if (error) throw new Error(error.message);

    let routeError: string | null = null;
    try {
      await recalc(context.supabase, data.draft_id);
    } catch (e: any) {
      routeError = e?.message ?? "Nie udało się przeliczyć trasy";
    }
    return { ok: true, routeError };
  });

export const removeLeadFromDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ draft_id: z.string().uuid(), item_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transport_draft_items")
      .delete()
      .eq("id", data.item_id)
      .eq("draft_id", data.draft_id);
    if (error) throw new Error(error.message);
    let routeError: string | null = null;
    try {
      await recalc(context.supabase, data.draft_id);
    } catch (e: any) {
      routeError = e?.message ?? "Nie udało się przeliczyć trasy";
    }
    return { ok: true, routeError };
  });

export const recalcDraftRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ draft_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await recalc(context.supabase, data.draft_id);
    return { ok: true };
  });

/** Leads available to be loaded onto a draft (open, with tonnage, not cancelled). */
export const listDraftCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(LEAD_SELECT)
      .is("deleted_at", null)
      .not("quantity", "is", null)
      .in("status", ["nowy", "w_kontakcie", "oferta"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Confirm draft → real transport booked in the calendar. */
export const confirmDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        draft_id: z.string().uuid(),
        scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data w formacie YYYY-MM-DD"),
        delivery_window: z.string().max(60).optional().nullable(),
        driver: z.string().max(120).optional().nullable(),
        vehicle: z.string().max(120).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: draft, error: dErr } = await context.supabase
      .from("transport_drafts")
      .select(DRAFT_SELECT)
      .eq("id", data.draft_id)
      .single();
    if (dErr || !draft) throw new Error(dErr?.message ?? "Wersja robocza nie istnieje");
    const d = draft as unknown as DraftRow;
    if (d.status !== "draft") throw new Error("Ta wersja została już zatwierdzona");

    const items = [...(d.transport_draft_items ?? [])].sort((a, b) => a.stop_order - b.stop_order);
    if (items.length === 0) throw new Error("Dodaj przynajmniej jednego leada do wersji roboczej");

    const first = items[0]!.leads;
    const city = (first?.city as string) || "—";
    const destination = leadAddress(first) || city;

    // Transport number: #T-YYYY/MM/NNN
    const dt = new Date(data.scheduled_date);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const monthStart = `${yyyy}-${mm}-01`;
    const nextMonth = new Date(yyyy, dt.getMonth() + 1, 1);
    const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const { count } = await context.supabase
      .from("transports")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_date", monthStart)
      .lt("scheduled_date", monthEnd);
    const seq = String((count ?? 0) + 1).padStart(3, "0");
    const transportNo = `#T-${yyyy}/${mm}/${seq}`;

    const totalTons = items.reduce((s, i) => s + Number(i.tons ?? 0), 0);
    const noteLines = [
      `${transportNo} · ${d.name}`,
      d.route_km ? `Trasa: ${d.route_km} km · ${Math.round((d.route_minutes ?? 0) / 60)}h ${(d.route_minutes ?? 0) % 60}m · ${d.route_cost ?? 0} zł` : null,
      data.delivery_window ? `Okno dostawy: ${data.delivery_window}` : null,
      d.notes,
    ].filter(Boolean);

    const { data: transport, error: tErr } = await context.supabase
      .from("transports")
      .insert({
        scheduled_date: data.scheduled_date,
        city,
        postal_code: (first?.postal_code as string) ?? null,
        destination_address: destination,
        driver: data.driver ?? null,
        vehicle: data.vehicle ?? null,
        capacity_kg: Number(d.capacity_tons) * 1000,
        status: "planowany",
        notes: noteLines.join(" · "),
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    for (const it of items) {
      const lead = it.leads;
      const product = (lead?.product as string) ?? "inne";
      const qty = Number(it.tons ?? 0);

      const { error: iErr } = await context.supabase.from("transport_items").insert({
        transport_id: transport.id,
        lead_id: it.lead_id,
        product: product as "pellet_paleta" | "pellet_bigbag" | "inne",
        quantity: qty,
        address: leadAddress(lead) || destination,
      });
      if (iErr) throw new Error(iErr.message);

      // Idempotent reservation: only the missing delta for this lead+product
      const { data: evs } = await context.supabase
        .from("stock_events")
        .select("txn_type, quantity, product")
        .eq("lead_id", it.lead_id);
      const netReserved = (evs ?? [])
        .filter((e: any) => e.product === product)
        .reduce((s: number, e: any) => {
          if (e.txn_type === "rezerwacja") return s + Number(e.quantity);
          if (e.txn_type === "zwolnienie_rez") return s - Number(e.quantity);
          return s;
        }, 0);
      const missing = Math.max(0, qty - netReserved);
      if (missing > 0) {
        await context.supabase.from("stock_events").insert({
          product: product as "pellet_paleta" | "pellet_bigbag" | "inne",
          txn_type: "rezerwacja",
          quantity: missing,
          lead_id: it.lead_id,
          reference: `TRANSPORT:${String(transport.id).slice(0, 8)}`,
          note: `Rezerwacja pod ${transportNo} (${data.scheduled_date})`,
          created_by: context.userId,
        });
      }

      await context.supabase
        .from("leads")
        .update({ reservation_status: "zarezerwowany" })
        .eq("id", it.lead_id)
        .neq("reservation_status", "wydany");
    }

    const { error: uErr } = await context.supabase
      .from("transport_drafts")
      .update({
        status: "confirmed",
        transport_id: transport.id,
        scheduled_date: data.scheduled_date,
        delivery_window: data.delivery_window ?? null,
      })
      .eq("id", d.id);
    if (uErr) throw new Error(uErr.message);

    return { transport_id: transport.id as string, transport_no: transportNo, total_tons: totalTons };
  });
