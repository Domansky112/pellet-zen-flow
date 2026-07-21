import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FuelPrice = {
  id: string;
  fuel_type: string;
  price_per_liter: number;
  source: string;
  note: string | null;
  fetched_at: string;
};

const DEFAULT_FALLBACK = 6.8;

export const getLatestFuelPrice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FuelPrice> => {
    const { data, error } = await context.supabase
      .from("fuel_prices")
      .select("id, fuel_type, price_per_liter, source, note, fetched_at")
      .eq("fuel_type", "ON")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return {
        id: "fallback",
        fuel_type: "ON",
        price_per_liter: DEFAULT_FALLBACK,
        source: "fallback",
        note: "Brak zapisanych cen — używam domyślnej stałej",
        fetched_at: new Date().toISOString(),
      };
    }
    return {
      ...data,
      price_per_liter: Number(data.price_per_liter),
    } as FuelPrice;
  });

const ManualInput = z.object({
  price_per_liter: z.number().positive().max(20),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const setManualFuelPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ManualInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fuel_prices").insert({
      fuel_type: "ON",
      price_per_liter: data.price_per_liter,
      source: "manual",
      note: data.note || "Ręcznie ustawiona cena bazowa",
      created_by: context.userId,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentFuelPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fuel_prices")
      .select("id, fuel_type, price_per_liter, source, note, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      price_per_liter: Number(r.price_per_liter),
    })) as FuelPrice[];
  });
