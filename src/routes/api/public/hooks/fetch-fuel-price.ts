import { createFileRoute } from "@tanstack/react-router";

/**
 * Scrape aktualnej hurtowej ceny ON (Ekodiesel) ze strony Orlen.
 * Endpoint publiczny — chroniony przez apikey Supabase (pg_cron).
 * Fallback: jeśli parsowanie się nie uda, logujemy warning i NIE wstawiamy nowego rekordu
 * — kalkulator dalej korzysta z ostatniej zapisanej ceny.
 */
export const Route = createFileRoute("/api/public/hooks/fetch-fuel-price")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const result: {
          success: boolean;
          price?: number;
          source_url?: string;
          reason?: string;
        } = { success: false };

        // Kolejność źródeł — najpierw hurtowe ceny paliw Orlen (stabilna struktura), potem fallback.
        const sources = [
          "https://www.orlen.pl/pl/dla-biznesu/hurtowe-ceny-paliw",
          "https://www.orlen.pl/pl/dla-kierowcow/paliwa/ceny-paliw",
        ];

        let parsed: number | null = null;
        let usedUrl: string | null = null;

        for (const url of sources) {
          try {
            const res = await fetch(url, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (compatible; SlonecznyPelletOS/1.0; +https://pellet-zen-flow.lovable.app)",
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "pl-PL,pl;q=0.9",
              },
            });
            if (!res.ok) {
              console.warn(`[fuel-scrape] ${url} zwrócił ${res.status}`);
              continue;
            }
            const html = await res.text();
            const price = extractDieselPrice(html);
            if (price !== null) {
              parsed = price;
              usedUrl = url;
              break;
            } else {
              console.warn(`[fuel-scrape] Nie znaleziono ceny ON na ${url}`);
            }
          } catch (err) {
            console.warn(
              `[fuel-scrape] Błąd fetch ${url}: ${(err as Error).message}`,
            );
          }
        }

        if (parsed === null) {
          result.reason =
            "Nie udało się pobrać/parsować ceny ON ze stron Orlen — pozostawiam ostatnią zapisaną wartość.";
          console.warn("[fuel-scrape]", result.reason);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Zapis do bazy — service role
        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Deduplikacja: jeśli ostatnia auto-cena jest identyczna z dzisiejszą, nie zaśmiecamy historii.
        const { data: last } = await admin
          .from("fuel_prices")
          .select("price_per_liter, fetched_at, source")
          .eq("fuel_type", "ON")
          .eq("source", "orlen_auto")
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const same =
          last && Math.abs(Number(last.price_per_liter) - parsed) < 0.001;

        if (!same) {
          const { error } = await admin.from("fuel_prices").insert({
            fuel_type: "ON",
            price_per_liter: parsed,
            source: "orlen_auto",
            note: `Auto-scrape: ${usedUrl}`,
          });
          if (error) {
            console.error("[fuel-scrape] insert error:", error.message);
            return new Response(
              JSON.stringify({ success: false, reason: error.message }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        }

        result.success = true;
        result.price = parsed;
        result.source_url = usedUrl!;
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

/**
 * Próbuje wyłuskać cenę ON w zł/l z HTML Orlenu.
 * Hurtowe ceny podawane są w zł/1000l (np. "5236" oznacza 5,236 zł/l).
 * Ceny detaliczne w zł/l (np. "6,89 zł/l").
 */
function extractDieselPrice(html: string): number | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // 1) Hurtowe: szukamy "Ekodiesel" / "Olej napędowy" i pobliskiej liczby 4-cyfrowej
  //    (zł/1000l → dzielimy przez 1000).
  const wholesalePatterns = [
    /Ekodiesel[^0-9]{0,80}(\d{4})\b/i,
    /Olej\s+nap[eę]dowy[^0-9]{0,80}(\d{4})\b/i,
  ];
  for (const re of wholesalePatterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n > 3000 && n < 10000) {
        return round3(n / 1000);
      }
    }
  }

  // 2) Detaliczne: "ON ... 6,89 zł/l" lub "Diesel ... 6.89 zł"
  const retailPatterns = [
    /\bON\b[^0-9]{0,40}(\d{1,2}[.,]\d{2,3})\s*z[łl]\/?l/i,
    /Diesel[^0-9]{0,40}(\d{1,2}[.,]\d{2,3})\s*z[łl]/i,
    /Olej\s+nap[eę]dowy[^0-9]{0,40}(\d{1,2}[.,]\d{2,3})\s*z[łl]/i,
  ];
  for (const re of retailPatterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1].replace(",", "."));
      if (n > 3 && n < 15) {
        return round3(n);
      }
    }
  }

  return null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
