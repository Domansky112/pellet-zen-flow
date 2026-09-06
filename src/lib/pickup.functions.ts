import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const BASE_ADDRESS = "Witoroża, 21-570 Drelów, Polska";
const DEFAULT_CONSUMPTION = 30; // l/100 km
const DEFAULT_FUEL = 6.8;
const SUGGESTED_DISCOUNT_PLN = 0.1;

export type PickupLocation = {
  id: string;
  name: string;
  address: string;
  default_km: number | null;
  notes: string | null;
  is_active: boolean;
};

async function routeKm(destination: string): Promise<number | null> {
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

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Brak uprawnień — wymagana rola administratora.");
}

export const listPickupLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("pickup_locations")
      .select("id, name, address, default_km, notes, is_active")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as PickupLocation[];
  });

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(3).max(300),
  default_km: z.number().min(0).max(5000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const upsertPickupLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = {
      name: data.name,
      address: data.address,
      default_km: data.default_km ?? null,
      notes: data.notes ?? null,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("pickup_locations")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("pickup_locations")
      .insert({ ...payload, created_by: context.userId } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id as string };
  });

export const deletePickupLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("pickup_locations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const EstimateInput = z.object({
  pickup_location_id: z.string().uuid().optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  consumption: z.number().positive().max(100).default(DEFAULT_CONSUMPTION),
});

/**
 * Szacuje koszt SAMEGO PALIWA dla przyjazdu towaru na magazyn (tam i z powrotem).
 * Bez kosztu kierowcy i bez stawek za km.
 */
export const estimateInboundFuelCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EstimateInput.parse(d))
  .handler(async ({ data, context }) => {
    let address = (data.address ?? "").trim();
    let defaultKm: number | null = null;

    if (data.pickup_location_id) {
      const { data: loc } = await context.supabase
        .from("pickup_locations")
        .select("address, default_km")
        .eq("id", data.pickup_location_id)
        .maybeSingle();
      if (loc) {
        address = (loc as any).address ?? address;
        defaultKm = (loc as any).default_km != null ? Number((loc as any).default_km) : null;
      }
    }

    const { data: fuel } = await context.supabase
      .from("fuel_prices")
      .select("price_per_liter")
      .eq("fuel_type", "ON")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const retail = Number((fuel as any)?.price_per_liter ?? DEFAULT_FUEL) || DEFAULT_FUEL;
    const fuelPrice = Math.round((retail - SUGGESTED_DISCOUNT_PLN) * 1000) / 1000;

    let oneWay = defaultKm;
    let source: "settings" | "maps" | "none" = defaultKm != null ? "settings" : "none";
    if (oneWay == null && address.length >= 3) {
      const km = await routeKm(address);
      if (km != null) {
        oneWay = km;
        source = "maps";
      }
    }
    if (oneWay == null) {
      return { km: null, oneWayKm: null, fuelPrice, consumption: data.consumption, cost: null, source };
    }

    const km = Math.round(oneWay * 2);
    const cost = Math.round(((km / 100) * data.consumption * fuelPrice) * 100) / 100;
    return {
      km,
      oneWayKm: Math.round(oneWay),
      fuelPrice,
      consumption: data.consumption,
      cost,
      source,
    };
  });
