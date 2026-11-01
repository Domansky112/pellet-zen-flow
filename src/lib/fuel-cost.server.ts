/**
 * Koszt samego paliwa dla leadów rozliczonych z kosztem transportu 0 zł.
 * Trasa: zapisany szkic trasy (route_km) albo odległość z bazy w obie strony.
 * Cena ON: notowanie Orlen z dnia transportu (lub ostatnie wcześniejsze).
 * Trasy łączone dzielone proporcjonalnie do tonażu leadów.
 */
type AnyClient = any;

const CONSUMPTION_L_PER_100KM = 30;
const DEFAULT_FUEL = 6.8;
const BASE_ADDRESS = "Witoroża, 21-570 Drelów, Polska";

async function routeKmFromBase(destination: string): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) return null;
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": apiKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { address: BASE_ADDRESS },
        destination: { address: destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        units: "METRIC",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { routes?: Array<{ distanceMeters?: number }> };
    const m = json.routes?.[0]?.distanceMeters;
    return m ? m / 1000 : null;
  } catch {
    return null;
  }
}
export const FUEL_VAT_RATE = 23;

/** Zwraca mapę lead_id → koszt paliwa brutto (tylko dla podanych leadów). */
export async function fuelCostForLeads(supabase: AnyClient, leadIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!leadIds.length) return out;

  const { data: myItems } = await supabase
    .from("transport_items")
    .select("transport_id")
    .in("lead_id", leadIds);
  const tIds = Array.from(new Set((myItems ?? []).map((i: any) => i.transport_id))) as string[];
  if (!tIds.length) return out;

  const [{ data: transports }, { data: items }, { data: drafts }] = await Promise.all([
    supabase.from("transports").select("id, scheduled_date, status, destination_address, postal_code, city").in("id", tIds),
    supabase
      .from("transport_items")
      .select("transport_id, lead_id, quantity, leads(pooling_km_from_base)")
      .in("transport_id", tIds),
    supabase.from("transport_drafts").select("transport_id, route_km").in("transport_id", tIds),
  ]);

  const { data: fuel } = await supabase
    .from("fuel_prices")
    .select("price_per_liter, fetched_at")
    .order("fetched_at", { ascending: true })
    .limit(5000);
  const prices = (fuel ?? []).map((f: any) => ({ t: String(f.fetched_at).slice(0, 10), p: Number(f.price_per_liter) }));
  const priceOn = (date: string) => {
    let p: number | null = null;
    for (const r of prices) {
      if (r.t <= date) p = r.p;
      else break;
    }
    return p ?? prices[0]?.p ?? DEFAULT_FUEL;
  };

  const draftKm = new Map<string, number>();
  for (const d of drafts ?? []) if (Number(d.route_km) > 0) draftKm.set(d.transport_id, Number(d.route_km));

  // Brak zapisanej trasy → odległość z mapy (w obie strony), liczona równolegle.
  const kmByAddr = new Map<string, number | null>();
  const needAddr = new Set<string>();
  for (const t of transports ?? []) {
    if (draftKm.has(t.id)) continue;
    const addr = (t.destination_address || [t.postal_code, t.city].filter(Boolean).join(" ")).trim();
    if (addr.length >= 3) needAddr.add(addr);
  }
  await Promise.all(
    Array.from(needAddr).map(async (a) => kmByAddr.set(a, await routeKmFromBase(`${a}, Polska`))),
  );

  const leadSet = new Set(leadIds);
  for (const t of transports ?? []) {
    if (t.status === "anulowany") continue;
    const its = (items ?? []).filter((i: any) => i.transport_id === t.id);
    if (!its.length) continue;
    let km = draftKm.get(t.id) ?? 0;
    if (!km) {
      const maxBase = Math.max(0, ...its.map((i: any) => Number(i.leads?.pooling_km_from_base ?? 0)));
      km = maxBase * 2;
    }
    if (!km) {
      const addr = (t.destination_address || [t.postal_code, t.city].filter(Boolean).join(" ")).trim();
      km = (kmByAddr.get(addr) ?? 0) * 2;
    }
    if (!km) continue;
    const cost = (km / 100) * CONSUMPTION_L_PER_100KM * priceOn(String(t.scheduled_date));
    const totalTons = its.reduce((s: number, i: any) => s + Number(i.quantity ?? 0), 0);
    for (const i of its) {
      if (!i.lead_id || !leadSet.has(i.lead_id)) continue;
      const share = totalTons > 0 ? Number(i.quantity ?? 0) / totalTons : 1 / its.length;
      out.set(i.lead_id, (out.get(i.lead_id) ?? 0) + cost * share);
    }
  }
  return out;
}

/** Leady z kosztem transportu 0/puste → koszt paliwa; pozostałe pomijamy. */
export async function fuelCostForZeroTransportLeads(supabase: AnyClient, leads: any[]) {
  const ids = (leads ?? [])
    .filter((l: any) => !(Number(l.transport_cost_gross ?? 0) > 0))
    .map((l: any) => l.id);
  return fuelCostForLeads(supabase, ids);
}
