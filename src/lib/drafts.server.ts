const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const BASE_ADDRESS = "Witoroża, 21-570 Drelów, Polska";
const DEFAULT_COST_PER_KM = 2.44;


export type DraftRow = {
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
    batch_id: string | null;
    tons: number;
    stop_order: number;
    leads: any;
  }>;
};

export const LEAD_SELECT =
  "id, lead_number, name, city, postal_code, invoice_address, product, quantity, phone, status, status_key, payment_status, reservation_status, pooling_lat, pooling_lng, has_unloading_equipment";

export const DRAFT_SELECT = `id, name, vehicle_class, capacity_tons, scheduled_date, delivery_window, status, transport_id, route_km, route_minutes, route_cost, cost_per_km, notes, created_at,
  transport_draft_items(id, lead_id, batch_id, tons, stop_order, leads(${LEAD_SELECT}))`;

export function leadAddress(l: any): string {
  return (
    (l?.invoice_address as string) ||
    [l?.postal_code, l?.city].filter(Boolean).join(" ") ||
    (l?.city as string) ||
    ""
  );
}

export async function readCostPerKm(supabase: any): Promise<number> {
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

export async function recalc(supabase: any, draftId: string) {
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

