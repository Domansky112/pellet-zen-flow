import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FuelPrice = {
  id: string;
  fuel_type: string;
  /** Cena detaliczna (bazowa) — pobrana / szacowana z Orlenu lub wpisana ręcznie. */
  price_per_liter: number;
  /** Sugerowana cena bazowa do kalkulatorów = price_per_liter - 0,10 zł. */
  suggested_price: number;
  source: string;
  note: string | null;
  fetched_at: string;
};

const DEFAULT_FALLBACK_RETAIL = 6.9;
const SUGGESTED_DISCOUNT_PLN = 0.1;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

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
        price_per_liter: DEFAULT_FALLBACK_RETAIL,
        suggested_price: round3(DEFAULT_FALLBACK_RETAIL - SUGGESTED_DISCOUNT_PLN),
        source: "fallback",
        note: "Brak zapisanych cen — używam domyślnej stałej detalicznej",
        fetched_at: new Date().toISOString(),
      };
    }
    const retail = Number(data.price_per_liter);
    return {
      ...data,
      price_per_liter: retail,
      suggested_price: round3(retail - SUGGESTED_DISCOUNT_PLN),
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
    return (data ?? []).map((r: any) => {
      const retail = Number(r.price_per_liter);
      return {
        ...r,
        price_per_liter: retail,
        suggested_price: round3(retail - SUGGESTED_DISCOUNT_PLN),
      };
    }) as FuelPrice[];
  });

