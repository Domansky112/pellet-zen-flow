import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const BASE_ADDRESS = "Witoroża, 21-570 Drelów, Polska";
const BASE_LAT = 51.9861;
const BASE_LNG = 22.9575;

// ---------- helpers ----------
function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const b = (Math.atan2(y, x) * 180) / Math.PI;
  return (b + 360) % 360;
}

async function geocodeAddress(address: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) throw new Error("Brak konfiguracji Google Maps");
  const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=pl`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Geocoding [${res.status}]: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    status: string;
    results?: Array<{ geometry: { location: { lat: number; lng: number } } }>;
  };
  const loc = j.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng };
}

// ---------- geocode pending leads ----------
export const geocodePendingLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: pending } = await context.supabase
      .from("leads")
      .select("id, city, postal_code")
      .eq("pooling_enabled", true)
      .is("pooling_lat", null)
      .limit(20);

    let done = 0;
    let failed = 0;
    for (const lead of pending ?? []) {
      const addr = [lead.postal_code, lead.city, "Polska"].filter(Boolean).join(", ");
      if (!addr || addr === "Polska") continue;
      try {
        const geo = await geocodeAddress(addr);
        if (!geo) {
          failed++;
          continue;
        }
        const km = haversineKm(BASE_LAT, BASE_LNG, geo.lat, geo.lng);
        await context.supabase
          .from("leads")
          .update({
            pooling_lat: geo.lat,
            pooling_lng: geo.lng,
            pooling_km_from_base: Math.round(km),
          })
          .eq("id", lead.id);
        done++;
      } catch (e) {
        console.error("[geocode]", lead.id, e);
        failed++;
      }
    }
    return { done, failed, total: pending?.length ?? 0 };
  });

// ---------- list waitlist ----------
export const listWaitlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(
        "id, name, phone, email, city, postal_code, product, quantity, pooling_wait_until, pooling_status, pooling_lat, pooling_lng, pooling_km_from_base, priority, created_at",
      )
      .eq("pooling_enabled", true)
      .eq("pooling_status", "poczekalnia")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- suggestions ----------
const SuggestInput = z.object({
  maxDetourKm: z.number().min(0).max(300).default(75),
  capacityTons: z.number().min(1).max(40).default(24),
  minFillTons: z.number().min(1).max(40).default(20),
  bearingBucketDeg: z.number().min(10).max(180).default(30),
});

type Lead = {
  id: string;
  name: string;
  city: string | null;
  quantity: number | null;
  pooling_lat: number | null;
  pooling_lng: number | null;
  pooling_km_from_base: number | null;
  pooling_wait_until: string | null;
};

export const findPoolSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SuggestInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: leads } = await context.supabase
      .from("leads")
      .select(
        "id, name, city, quantity, pooling_lat, pooling_lng, pooling_km_from_base, pooling_wait_until",
      )
      .eq("pooling_enabled", true)
      .eq("pooling_status", "poczekalnia")
      .not("pooling_lat", "is", null)
      .not("quantity", "is", null)
      .or(`pooling_wait_until.is.null,pooling_wait_until.gte.${today}`);

    const list = (leads as Lead[] | null) ?? [];
    if (list.length === 0) return [];

    // Bucket by bearing from base
    type Buckets = Record<string, Lead[]>;
    const buckets: Buckets = {};
    for (const l of list) {
      if (l.pooling_lat == null || l.pooling_lng == null) continue;
      const b = bearingDeg(BASE_LAT, BASE_LNG, l.pooling_lat, l.pooling_lng);
      const key = String(Math.floor(b / data.bearingBucketDeg));
      (buckets[key] ??= []).push(l);
    }

    // Also merge adjacent bucket (looser grouping)
    const suggestions: Array<{
      key: string;
      route_to: string;
      total_tons: number;
      max_km: number;
      leads: Array<{
        id: string;
        name: string;
        city: string | null;
        tons: number;
        km_from_base: number;
        detour_km: number;
        lat: number;
        lng: number;
      }>;
    }> = [];

    const usedIds = new Set<string>();

    // Try each bucket + its neighbor
    const keys = Object.keys(buckets)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    for (const k of keys) {
      const candidates = [...(buckets[String(k)] ?? []), ...(buckets[String(k + 1)] ?? [])]
        .filter((l) => !usedIds.has(l.id))
        // farthest first — the farthest lead defines the trip
        .sort((a, b) => (b.pooling_km_from_base ?? 0) - (a.pooling_km_from_base ?? 0));

      if (candidates.length === 0) continue;
      const anchor = candidates[0];
      if ((anchor.pooling_km_from_base ?? 0) < 30) continue; // pomijamy bardzo bliskie (nie warto konsolidować)

      const picked: typeof candidates = [anchor];
      let sumTons = Number(anchor.quantity ?? 0);

      for (const c of candidates.slice(1)) {
        if (sumTons >= data.capacityTons) break;
        const tons = Number(c.quantity ?? 0);
        if (tons <= 0) continue;
        if (sumTons + tons > data.capacityTons + 0.01) continue;
        // detour = odległość od trasy anchor→base (uproszczenie: odległość punktu od anchor)
        const detour = haversineKm(
          anchor.pooling_lat!,
          anchor.pooling_lng!,
          c.pooling_lat!,
          c.pooling_lng!,
        );
        if (detour > data.maxDetourKm) continue;
        picked.push(c);
        sumTons += tons;
      }

      if (sumTons < data.minFillTons) continue;

      picked.forEach((p) => usedIds.add(p.id));

      const maxKm = anchor.pooling_km_from_base ?? 0;
      const total_tons = Math.round(sumTons * 100) / 100;

      const enriched = picked.map((p) => {
        const detour =
          p.id === anchor.id
            ? 0
            : haversineKm(anchor.pooling_lat!, anchor.pooling_lng!, p.pooling_lat!, p.pooling_lng!);
        return {
          id: p.id,
          name: p.name,
          city: p.city,
          tons: Number(p.quantity ?? 0),
          km_from_base: Math.round(p.pooling_km_from_base ?? 0),
          detour_km: Math.round(detour),
          lat: p.pooling_lat!,
          lng: p.pooling_lng!,
        };
      });

      suggestions.push({
        key: `bucket-${k}`,
        route_to: `${anchor.city ?? "?"} + ${picked.length - 1}`,
        total_tons,
        max_km: Math.round(maxKm),
        leads: enriched,
      });
    }

    // Cost estimate (round trip + naive detour)
    const FUEL_PRICE = 6.8;
    const CONSUMPTION = 30;
    const PER_KM = 0.4;
    const DRIVER_DAY = 350;

    return suggestions.map((s) => {
      const detourSum = s.leads.reduce((sum, l) => sum + l.detour_km, 0);
      const estKm = Math.round(s.max_km * 2 + detourSum * 2);
      const fuel = (estKm / 100) * CONSUMPTION * FUEL_PRICE;
      const km = estKm * PER_KM;
      const driver = DRIVER_DAY * (estKm > 600 ? 2 : 1);
      const total = Math.round(fuel + km + driver);
      const perTon = Math.round(total / s.total_tons);
      // podział kosztu proporcjonalnie do (tons × (km_from_base + detour_km))
      const weights = s.leads.map((l) => l.tons * (l.km_from_base + l.detour_km));
      const wSum = weights.reduce((a, b) => a + b, 0) || 1;
      const leadsWithShare = s.leads.map((l, i) => ({
        ...l,
        share_cost: Math.round((weights[i] / wSum) * total),
      }));
      return {
        ...s,
        estimated_km: estKm,
        estimated_cost: total,
        cost_per_ton: perTon,
        leads: leadsWithShare,
      };
    });
  });

// ---------- create draft pool ----------
const CreatePoolInput = z.object({
  name: z.string().min(1).max(120),
  route_to: z.string().min(1).max(200),
  capacity_tons: z.number().min(1).max(40).default(24),
  estimated_km: z.number().min(0).max(10000).optional(),
  estimated_cost: z.number().min(0).max(1000000).optional(),
  cost_per_ton: z.number().min(0).max(100000).optional(),
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        lead_id: z.string().uuid(),
        tons: z.number().positive(),
        detour_km: z.number().min(0).optional(),
        share_cost: z.number().min(0).optional(),
        stop_order: z.number().int().optional(),
      }),
    )
    .min(1),
});

export const createPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreatePoolInput.parse(d))
  .handler(async ({ data, context }) => {
    const total_tons = data.items.reduce((s, i) => s + i.tons, 0);
    const { data: pool, error } = await context.supabase
      .from("transport_pools")
      .insert({
        name: data.name,
        route_to: data.route_to,
        total_tons,
        capacity_tons: data.capacity_tons,
        estimated_km: data.estimated_km ?? null,
        estimated_cost: data.estimated_cost ?? null,
        cost_per_ton: data.cost_per_ton ?? null,
        notes: data.notes ?? null,
        status: "draft",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: itemErr } = await context.supabase.from("transport_pool_items").insert(
      data.items.map((i, idx) => ({
        pool_id: pool.id,
        lead_id: i.lead_id,
        tons: i.tons,
        detour_km: i.detour_km ?? null,
        share_cost: i.share_cost ?? null,
        stop_order: i.stop_order ?? idx,
      })),
    );
    if (itemErr) throw new Error(itemErr.message);

    // Oznacz leady jako zgrupowane
    await context.supabase
      .from("leads")
      .update({ pooling_status: "zgrupowany" })
      .in(
        "id",
        data.items.map((i) => i.lead_id),
      );

    return pool;
  });

// ---------- list pools ----------
export const listPools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transport_pools")
      .select(
        "id, name, route_to, total_tons, capacity_tons, estimated_km, estimated_cost, cost_per_ton, status, transport_id, notes, created_at, transport_pool_items(id, tons, detour_km, share_cost, stop_order, leads(id, name, phone, city, postal_code, product, pooling_lat, pooling_lng))",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- cancel pool ----------
export const cancelPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: items } = await context.supabase
      .from("transport_pool_items")
      .select("lead_id")
      .eq("pool_id", data.id);
    const leadIds = (items ?? []).map((i) => i.lead_id);

    const { error } = await context.supabase
      .from("transport_pools")
      .update({ status: "anulowany" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (leadIds.length > 0) {
      await context.supabase
        .from("leads")
        .update({ pooling_status: "poczekalnia" })
        .in("id", leadIds);
    }
    return { ok: true };
  });

// ---------- confirm pool → transport ----------
const ConfirmInput = z.object({
  id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  driver: z.string().max(120).optional().nullable(),
  vehicle: z.string().max(120).optional().nullable(),
  product: z.enum(["pellet_paleta", "pellet_bigbag", "inne"]).default("pellet_paleta"),
  reserve_stock: z.boolean().default(true),
});

export const confirmPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfirmInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: pool, error: pErr } = await context.supabase
      .from("transport_pools")
      .select(
        "id, name, route_to, total_tons, transport_pool_items(id, tons, share_cost, stop_order, leads(id, name, city, postal_code))",
      )
      .eq("id", data.id)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (!pool) throw new Error("Pool nie znaleziony");

    const items = (pool as any).transport_pool_items ?? [];
    const firstCity = items[0]?.leads?.city ?? pool.route_to;

    // 1. Transport
    const { data: transport, error: tErr } = await context.supabase
      .from("transports")
      .insert({
        scheduled_date: data.scheduled_date,
        city: firstCity,
        destination_address: items.map((i: any) => `${i.leads?.city ?? ""} (${i.tons} t)`).join(" · "),
        driver: data.driver ?? null,
        vehicle: data.vehicle ?? null,
        capacity_kg: Number(pool.total_tons) * 1000,
        status: "planowany",
        pool_id: pool.id,
        notes: `Wspólny transport (${items.length} klientów)`,
      })
      .select()
      .single();
    if (tErr) throw new Error(tErr.message);

    // 2. transport_items — jeden per lead
    const { error: iErr } = await context.supabase.from("transport_items").insert(
      items.map((i: any) => ({
        transport_id: transport.id,
        lead_id: i.leads?.id ?? null,
        product: data.product,
        quantity: Number(i.tons),
        address: [i.leads?.postal_code, i.leads?.city].filter(Boolean).join(" "),
      })),
    );
    if (iErr) throw new Error(iErr.message);

    // 3. Rezerwacja magazynu (jedna sumaryczna)
    if (data.reserve_stock) {
      const { error: sErr } = await context.supabase.from("stock_events").insert({
        product: data.product,
        txn_type: "rezerwacja",
        quantity: Number(pool.total_tons),
        reference: `POOL:${pool.id.slice(0, 8)}`,
        note: `Rezerwacja pod wspólny transport ${data.scheduled_date} (${items.length} klientów)`,
        created_by: context.userId,
      });
      if (sErr) throw new Error(sErr.message);
    }

    // 4. Update leads + pool
    const leadIds = items.map((i: any) => i.leads?.id).filter(Boolean);
    if (leadIds.length > 0) {
      await context.supabase
        .from("leads")
        .update({ pooling_status: "wyslany", status: "wygrany" })
        .in("id", leadIds);
    }
    await context.supabase
      .from("transport_pools")
      .update({ status: "potwierdzony", transport_id: transport.id })
      .eq("id", pool.id);

    return { transport_id: transport.id };
  });
