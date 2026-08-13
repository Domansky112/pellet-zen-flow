import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const BASE_ADDRESS = "Witoroża, 21-570 Drelów, Polska";

const CalcInput = z.object({
  destination: z.string().min(2).max(200),
  tons: z.number().positive().max(100).default(24),
  driverDays: z.number().min(0).max(30).default(1),
  fuelPrice: z.number().positive().max(20).default(6.8),
  consumption: z.number().positive().max(100).default(30), // l/100km
  perKmRate: z.number().min(0).max(20).default(0.4),
  driverDayRate: z.number().min(0).max(2000).default(350),
  roundTrip: z.boolean().default(true),
});

export const calculateTransport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CalcInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!apiKey || !lovableKey) throw new Error("Brak konfiguracji Google Maps");

    const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": apiKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { address: BASE_ADDRESS },
        destination: { address: data.destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        units: "METRIC",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Maps [${res.status}]: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      routes?: Array<{ distanceMeters?: number; duration?: string }>;
    };
    const route = json.routes?.[0];
    if (!route?.distanceMeters) {
      throw new Error("Nie znaleziono trasy do podanego adresu");
    }

    const oneWayKm = route.distanceMeters / 1000;
    const km = data.roundTrip ? oneWayKm * 2 : oneWayKm;
    const durationSec = route.duration ? Number(route.duration.replace("s", "")) : 0;

    const fuelCost = (km / 100) * data.consumption * data.fuelPrice;
    const kmCost = km * data.perKmRate;
    const driverCost = data.driverDays * data.driverDayRate;
    const total = fuelCost + kmCost + driverCost;
    const perTon = data.tons > 0 ? total / data.tons : 0;

    return {
      base: BASE_ADDRESS,
      destination: data.destination,
      oneWayKm: Math.round(oneWayKm),
      km: Math.round(km),
      durationMin: Math.round(durationSec / 60),
      breakdown: {
        fuel: Math.round(fuelCost),
        km: Math.round(kmCost),
        driver: Math.round(driverCost),
      },
      total: Math.round(total),
      perTon: Math.round(perTon),
    };
  });

// Consolidation: group open leads (status=nowy|w_kontakcie|oferta) with city set
export const suggestConsolidation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, name, city, quantity, status, priority, product")
      .in("status", ["nowy", "w_kontakcie", "oferta"])
      .not("city", "is", null);
    if (error) throw new Error(error.message);

    type LeadRow = NonNullable<typeof data>[number];
    const groups = new Map<
      string,
      { city: string; leads: LeadRow[]; totalTons: number }
    >();
    for (const lead of data ?? []) {
      const key = (lead.city ?? "").trim().toLowerCase();
      if (!key) continue;
      const bucket = groups.get(key) ?? {
        city: lead.city as string,
        leads: [] as LeadRow[],
        totalTons: 0,
      };
      bucket.leads.push(lead);
      bucket.totalTons += Number(lead.quantity ?? 0);
      groups.set(key, bucket);
    }
    return Array.from(groups.values())
      .filter((g) => g.leads.length >= 2 || g.totalTons >= 20)
      .sort((a, b) => b.totalTons - a.totalTons);
  });

// ─────────────────────────────────────────────────────────────
// Propozycja kosztu transportu na podstawie kodu pocztowego leada
// ─────────────────────────────────────────────────────────────
const DEFAULT_CONSUMPTION = 30; // l/100 km
const DEFAULT_PER_KM = 0.4;
const DEFAULT_DRIVER_DAY = 350;
const DEFAULT_FUEL = 6.8;

async function routeKmFromBase(destination: string): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) return null;
  try {
    const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
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

function costFromKm(km: number, fuelPrice: number) {
  const roundKm = km * 2;
  const fuel = (roundKm / 100) * DEFAULT_CONSUMPTION * fuelPrice;
  const perKm = roundKm * DEFAULT_PER_KM;
  return { km: roundKm, cost: fuel + perKm + DEFAULT_DRIVER_DAY };
}

const SuggestInput = z.object({
  postal_code: z.string().trim().max(12).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  tons: z.number().min(0).max(100).default(0),
});

/** Zwraca proponowany koszt transportu (brutto) — do wstępnego wypełnienia modala rozliczenia. */
export const suggestTransportCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SuggestInput.parse(d))
  .handler(async ({ data, context }) => {
    const dest = [data.postal_code, data.city].filter(Boolean).join(" ").trim();

    const { data: fuel } = await context.supabase
      .from("fuel_prices")
      .select("price_per_liter")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fuelPrice = Number((fuel as any)?.price_per_liter ?? DEFAULT_FUEL) || DEFAULT_FUEL;

    const km = dest.length >= 3 ? await routeKmFromBase(`${dest}, Polska`) : null;
    if (km != null) {
      const r = costFromKm(km, fuelPrice);
      return { cost: Math.round(r.cost), km: Math.round(r.km), source: "maps" as const };
    }

    // Fallback — stawka za tonę z Ustawień
    const { data: setting } = await context.supabase
      .from("system_settings")
      .select("value")
      .eq("key", "transport_default_rate_per_ton")
      .maybeSingle();
    const perTon = Number((setting?.value as any)?.pln_per_ton ?? 60) || 60;
    return { cost: Math.round(Math.max(150, data.tons * perTon)), km: null, source: "ryczalt" as const };
  });

/** Migracja/uzupełnienie: przelicza koszt transportu wg kodu pocztowego dla starych rozliczeń. */
export const backfillTransportCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(100).default(40) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Tylko administrator");

    const { data: leads, error } = await context.supabase
      .from("leads")
      .select("id, postal_code, city, quantity, transport_cost_gross")
      .is("deleted_at", null)
      .gt("payment_amount_gross", 0)
      .not("postal_code", "is", null)
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const { data: fuel } = await context.supabase
      .from("fuel_prices")
      .select("price_per_liter")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fuelPrice = Number((fuel as any)?.price_per_liter ?? DEFAULT_FUEL) || DEFAULT_FUEL;

    let updated = 0;
    for (const l of leads ?? []) {
      const dest = [(l as any).postal_code, (l as any).city].filter(Boolean).join(" ").trim();
      if (dest.length < 3) continue;
      const km = await routeKmFromBase(`${dest}, Polska`);
      if (km == null) continue;
      const { cost } = costFromKm(km, fuelPrice);
      const { error: upErr } = await context.supabase
        .from("leads")
        .update({ transport_cost_gross: Math.round(cost) } as any)
        .eq("id", (l as any).id);
      if (!upErr) updated += 1;
    }
    return { updated, scanned: (leads ?? []).length };
  });
