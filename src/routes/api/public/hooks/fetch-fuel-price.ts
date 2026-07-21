import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

/**
 * Pobiera aktualną HURTOWĄ cenę ON Ekodiesel z JSON API Orlenu i przelicza ją na
 * szacowaną cenę DETALICZNĄ (na stacji) według uproszczonego wzoru:
 *   retail ≈ (netto/1000) * 1.10
 *
 * Ta wartość detaliczna jest zapisywana w tabeli `fuel_prices` jako `price_per_liter`
 * (source = "orlen_retail_auto"). Sugerowana cena bazowa dla kalkulatorów =
 * retail - 0,10 zł (patrz `getLatestFuelPrice` w src/lib/fuel.functions.ts).
 */
const RETAIL_MULTIPLIER = 1.10;

export const Route = createFileRoute("/api/public/hooks/fetch-fuel-price")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
          return json({ error: "Unauthorized" }, 401);
        }

        const ORLEN_API = "https://tool.orlen.pl/api/wholesalefuelprices";
        let parsed: number | null = null;
        let effectiveDate: string | null = null;
        let rawValue: number | null = null;

        try {
          const res = await fetch(ORLEN_API, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json, text/plain, */*",
              "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
              Referer: "https://www.orlen.pl/pl/dla-biznesu/hurtowe-ceny-paliw",
              Origin: "https://www.orlen.pl",
            },
          });
          if (!res.ok) {
            console.warn(`[fuel-scrape] Orlen API HTTP ${res.status}`);
          } else {
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.includes("json")) {
              console.warn(
                `[fuel-scrape] Orlen API zwróciło non-JSON (${contentType}) — prawdopodobnie WAF/anty-bot.`,
              );
            } else {
              const data = (await res.json()) as Array<{
                productName?: string;
                value?: number;
                effectiveDate?: string;
              }>;
              const eko = Array.isArray(data)
                ? data.find(
                    (r) => (r.productName ?? "").toLowerCase() === "onekodiesel",
                  )
                : null;
              if (eko && typeof eko.value === "number" && eko.value > 3000) {
                rawValue = eko.value;
                const wholesaleNettoPerL = eko.value / 1000; // zł/1000l → zł/l netto
                const retail = wholesaleNettoPerL * RETAIL_MULTIPLIER;
                parsed = round3(retail);
                effectiveDate = eko.effectiveDate ?? null;
              } else {
                console.warn(
                  "[fuel-scrape] Brak rekordu ONEkodiesel w odpowiedzi Orlenu.",
                );
              }
            }
          }
        } catch (err) {
          console.warn(`[fuel-scrape] fetch error: ${(err as Error).message}`);
        }

        if (parsed === null) {
          return json({
            success: false,
            reason:
              "Nie udało się pobrać ceny z Orlenu — pozostawiam ostatnią zapisaną wartość.",
          });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Deduplikacja: nie duplikujemy jeśli ostatnia auto-cena ma tę samą wartość i tę samą datę obowiązywania.
        const { data: last } = await admin
          .from("fuel_prices")
          .select("price_per_liter, note")
          .eq("fuel_type", "ON")
          .eq("source", "orlen_retail_auto")
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const dateStr = effectiveDate ? effectiveDate.slice(0, 10) : null;
        const noteText = `Orlen Detal (szac.): hurt ${rawValue} zł/1000l × 1,10${dateStr ? ` · z dnia ${dateStr}` : ""}`;

        const same =
          last &&
          Math.abs(Number(last.price_per_liter) - parsed) < 0.001 &&
          (last.note ?? "") === noteText;

        if (!same) {
          const { error } = await admin.from("fuel_prices").insert({
            fuel_type: "ON",
            price_per_liter: parsed,
            source: "orlen_retail_auto",
            note: noteText,
          });
          if (error) {
            console.error("[fuel-scrape] insert error:", error.message);
            return json({ success: false, reason: error.message }, 500);
          }
        }


        return json({
          success: true,
          price: parsed,
          raw_value_per_1000l: rawValue,
          effective_date: effectiveDate,
          deduplicated: !!same,
        });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
