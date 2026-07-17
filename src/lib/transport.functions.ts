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
  perTonRate: z.number().min(0).max(2000).default(350),
  perDayRate: z.number().min(0).max(2000).default(0),
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
    const tonCost = data.tons * data.perTonRate;
    const dayCost = data.driverDays * data.perDayRate;
    const total = fuelCost + kmCost + tonCost + dayCost;
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
        tons: Math.round(tonCost),
        days: Math.round(dayCost),
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
