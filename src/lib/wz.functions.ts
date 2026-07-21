import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WZ (Wydanie Zewnętrzne) — dokument wydania z magazynu.
 *
 * Infrastruktura przygotowana pod przyszłą integrację z Google Docs / generatorem PDF.
 * Podmień tylko funkcję `generateWzFile(data)` — reszta (pobieranie danych, endpoint,
 * przycisk UI, mapowanie DTO) zostaje bez zmian.
 */

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Pellet — paleta (960 kg)",
  pellet_bigbag: "Pellet — Big Bag (1000 kg)",
  inne: "Inne",
};

const PIECE_KG: Record<string, number> = {
  pellet_paleta: 960,
  pellet_bigbag: 1000,
};

// ─────────────────────────────────────────────────────────────
// DTO
// ─────────────────────────────────────────────────────────────

export type WzRecipient = {
  name: string;
  company: string | null;
  nip: string | null;
  address: string;
  phone: string | null;
  email: string | null;
};

export type WzItem = {
  product: string;
  productLabel: string;
  quantityTons: number;
  pieces: number | null;
  unit: string; // "big-bag", "paleta", "t"
  description: string; // "10× Big Bag 1000 kg — Pellet"
};

export type WzDocumentData = {
  number: string;
  issueDate: string; // YYYY-MM-DD (dzień wygenerowania)
  transportDate: string; // YYYY-MM-DD (planowana data wydania)
  source: "transport" | "pool";
  sourceId: string;
  issuer: {
    name: string;
    address: string;
    nip: string | null;
  };
  carrier: {
    driver: string | null;
    vehicle: string | null;
    notes: string | null;
  };
  recipients: WzRecipient[];
  items: WzItem[];
  totals: {
    tons: number;
    pieces: number;
  };
  signatures: {
    issuedBy: string; // "Wydał"
    receivedBy: string; // "Odebrał"
  };
};

// ─────────────────────────────────────────────────────────────
// Numer dokumentu
// ─────────────────────────────────────────────────────────────

function makeWzNumber(sourceId: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const short = sourceId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `WZ/${y}/${m}/${d}-${short}`;
}

// ─────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────

function leadToRecipient(lead: any): WzRecipient {
  const name =
    lead?.name ??
    [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim() ??
    "—";
  const address =
    lead?.invoice_address ??
    [lead?.city, lead?.postal_code].filter(Boolean).join(" ") ??
    "—";
  return {
    name: name || "—",
    company: lead?.invoice_company ?? null,
    nip: lead?.invoice_nip ?? null,
    address: address || "—",
    phone: lead?.phone ?? null,
    email: lead?.email ?? null,
  };
}

function buildItem(product: string, quantityTons: number): WzItem {
  const label = PRODUCT_LABEL[product] ?? product;
  const kgPer = PIECE_KG[product];
  const totalKg = quantityTons * 1000;
  const pieces = kgPer ? Math.ceil(totalKg / kgPer) : null;
  const unit = product === "pellet_bigbag" ? "big-bag" : product === "pellet_paleta" ? "paleta" : "t";
  const description = pieces
    ? `${pieces}× ${unit === "big-bag" ? "Big Bag" : "Paleta"} ${kgPer} kg — Pellet (${quantityTons} t)`
    : `${quantityTons} t — ${label}`;
  return {
    product,
    productLabel: label,
    quantityTons,
    pieces,
    unit,
    description,
  };
}

// ─────────────────────────────────────────────────────────────
// Agregatory danych
// ─────────────────────────────────────────────────────────────

async function prepareFromTransport(
  supabase: any,
  transportId: string,
  issuerName: string,
): Promise<WzDocumentData> {
  const { data: t, error } = await supabase
    .from("transports")
    .select(
      "id, scheduled_date, city, postal_code, destination_address, driver, vehicle, notes, transport_items(id, product, quantity, address, leads(id, name, first_name, last_name, phone, email, city, postal_code, invoice_company, invoice_nip, invoice_address))",
    )
    .eq("id", transportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) throw new Error("Transport nie istnieje");

  const rawItems = (t.transport_items ?? []) as any[];
  const items = rawItems.map((i) => buildItem(i.product, Number(i.quantity)));
  const recipients: WzRecipient[] = rawItems
    .map((i) =>
      i.leads
        ? leadToRecipient(i.leads)
        : {
            name: t.city,
            company: null,
            nip: null,
            address: t.destination_address ?? "—",
            phone: null,
            email: null,
          },
    )
    // deduplikuj po nazwie+adres
    .filter(
      (r, idx, arr) => arr.findIndex((x) => x.name === r.name && x.address === r.address) === idx,
    );

  const now = new Date();
  return {
    number: makeWzNumber(t.id, now),
    issueDate: now.toISOString().slice(0, 10),
    transportDate: t.scheduled_date,
    source: "transport",
    sourceId: t.id,
    issuer: {
      name: "Słoneczny Pellet",
      address: "Witoroża 21-570",
      nip: null,
    },
    carrier: {
      driver: t.driver ?? null,
      vehicle: t.vehicle ?? null,
      notes: t.notes ?? null,
    },
    recipients: recipients.length ? recipients : [
      {
        name: t.city,
        company: null,
        nip: null,
        address: t.destination_address ?? "—",
        phone: null,
        email: null,
      },
    ],
    items,
    totals: {
      tons: items.reduce((s, i) => s + i.quantityTons, 0),
      pieces: items.reduce((s, i) => s + (i.pieces ?? 0), 0),
    },
    signatures: {
      issuedBy: issuerName,
      receivedBy: "",
    },
  };
}

async function prepareFromPool(
  supabase: any,
  poolId: string,
  issuerName: string,
): Promise<WzDocumentData> {
  const { data: p, error } = await supabase
    .from("transport_pools")
    .select(
      "id, name, route_to, notes, transport_id, transport_pool_items(id, tons, stop_order, leads(id, name, first_name, last_name, phone, email, city, postal_code, product, quantity, invoice_company, invoice_nip, invoice_address))",
    )
    .eq("id", poolId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) throw new Error("Wspólny transport nie istnieje");

  // Jeśli pool został potwierdzony i ma transport_id — pobierz też datę / kierowcę
  let transportRow: any = null;
  if (p.transport_id) {
    const { data: tr } = await supabase
      .from("transports")
      .select("scheduled_date, driver, vehicle, notes")
      .eq("id", p.transport_id)
      .maybeSingle();
    transportRow = tr;
  }

  const rawItems = (p.transport_pool_items ?? []) as any[];
  // agregacja per produkt
  const byProduct = new Map<string, number>();
  const recipients: WzRecipient[] = [];
  for (const it of rawItems) {
    const lead = it.leads;
    if (!lead) continue;
    const prod = lead.product ?? "inne";
    byProduct.set(prod, (byProduct.get(prod) ?? 0) + Number(it.tons));
    recipients.push(leadToRecipient(lead));
  }
  const items = Array.from(byProduct.entries()).map(([prod, tons]) => buildItem(prod, tons));

  const now = new Date();
  return {
    number: makeWzNumber(p.id, now),
    issueDate: now.toISOString().slice(0, 10),
    transportDate: transportRow?.scheduled_date ?? now.toISOString().slice(0, 10),
    source: "pool",
    sourceId: p.id,
    issuer: {
      name: "Słoneczny Pellet",
      address: "Witoroża 21-570",
      nip: null,
    },
    carrier: {
      driver: transportRow?.driver ?? null,
      vehicle: transportRow?.vehicle ?? null,
      notes: transportRow?.notes ?? p.notes ?? null,
    },
    recipients,
    items,
    totals: {
      tons: items.reduce((s, i) => s + i.quantityTons, 0),
      pieces: items.reduce((s, i) => s + (i.pieces ?? 0), 0),
    },
    signatures: {
      issuedBy: issuerName,
      receivedBy: "",
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Renderer pliku (MOCK / PLACEHOLDER)
//
// TODO: Zamień treść tej funkcji na wywołanie generatora PDF
// (np. Google Docs API + template docId, albo pdf-lib / puppeteer).
// Reszta pipeline'u pozostaje bez zmian — funkcja przyjmuje WzDocumentData
// i zwraca { filename, mime, content (base64|utf8) }.
// ─────────────────────────────────────────────────────────────

export type WzFile = {
  filename: string;
  mime: string;
  encoding: "utf8" | "base64";
  content: string;
};

export function generateWzFile(data: WzDocumentData): WzFile {
  const rows = data.items
    .map(
      (i) => `
        <tr>
          <td>${escapeHtml(i.productLabel)}</td>
          <td class="right">${i.pieces ?? "—"}</td>
          <td class="right">${i.quantityTons.toFixed(3)} t</td>
          <td>${escapeHtml(i.description)}</td>
        </tr>`,
    )
    .join("");

  const recipients = data.recipients
    .map(
      (r) => `
        <div class="recipient">
          <strong>${escapeHtml(r.company ?? r.name)}</strong><br/>
          ${r.nip ? `NIP: ${escapeHtml(r.nip)}<br/>` : ""}
          ${escapeHtml(r.address)}<br/>
          ${r.phone ? `tel. ${escapeHtml(r.phone)}` : ""}
        </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"/><title>${data.number}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #111; margin: 40px; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  .muted { color: #666; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
  .box { border: 1px solid #ddd; padding: 12px 14px; border-radius: 6px; }
  .box h3 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #666; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; font-size: 13px; text-align: left; }
  th { background: #f7f7f7; }
  .right { text-align: right; }
  .totals { margin-top: 8px; font-weight: 600; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
  .sig { border-top: 1px solid #333; padding-top: 6px; font-size: 12px; text-align: center; }
  .recipient + .recipient { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ddd; }
  .mock { background: #fff8e1; border: 1px dashed #d4a600; padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #8a6d00; margin-bottom: 16px; }
</style></head><body>
  <div class="mock">📄 <strong>Podgląd WZ (mock)</strong> — dokument tymczasowy. Docelowo: generator PDF ze wzoru firmowego.</div>
  <h1>WYDANIE ZEWNĘTRZNE (WZ)</h1>
  <div class="muted">Nr dokumentu: <strong>${data.number}</strong> · Data wystawienia: ${data.issueDate} · Data wydania: ${data.transportDate}</div>

  <div class="grid">
    <div class="box">
      <h3>Wydający</h3>
      <strong>${escapeHtml(data.issuer.name)}</strong><br/>
      ${escapeHtml(data.issuer.address)}
    </div>
    <div class="box">
      <h3>Odbiorca / Odbiorcy</h3>
      ${recipients || "<em>—</em>"}
    </div>
  </div>

  <div class="box">
    <h3>Przewoźnik / Transport</h3>
    Kierowca: <strong>${escapeHtml(data.carrier.driver ?? "—")}</strong> ·
    Pojazd: <strong>${escapeHtml(data.carrier.vehicle ?? "—")}</strong>
    ${data.carrier.notes ? `<div class="muted" style="margin-top:6px">Uwagi: ${escapeHtml(data.carrier.notes)}</div>` : ""}
  </div>

  <table>
    <thead><tr><th>Towar</th><th class="right">Ilość szt.</th><th class="right">Waga</th><th>Opis</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals right">RAZEM: ${data.totals.pieces} szt. · ${data.totals.tons.toFixed(3)} t</div>

  <div class="signatures">
    <div class="sig">Wydał: ${escapeHtml(data.signatures.issuedBy)}</div>
    <div class="sig">Odebrał: ${escapeHtml(data.signatures.receivedBy || "…………………………")}</div>
  </div>
</body></html>`;

  return {
    filename: `${data.number.replace(/\//g, "_")}.html`,
    mime: "text/html;charset=utf-8",
    encoding: "utf8",
    content: html,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

// ─────────────────────────────────────────────────────────────
// Server functions
// ─────────────────────────────────────────────────────────────

const inputSchema = z
  .object({
    transportId: z.string().uuid().optional(),
    poolId: z.string().uuid().optional(),
  })
  .refine((v) => !!v.transportId !== !!v.poolId, {
    message: "Podaj dokładnie jedno: transportId LUB poolId",
  });

/** Zwraca sam DTO — do podglądu / debugowania. */
export const prepareWzDocumentData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const issuer =
      (context.claims as any)?.email ?? (context.claims as any)?.name ?? "Operator";
    if (data.transportId)
      return prepareFromTransport(context.supabase, data.transportId, issuer);
    return prepareFromPool(context.supabase, data.poolId!, issuer);
  });

/** Zwraca gotowy plik (mock HTML) + DTO. */
export const getWzDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const issuer =
      (context.claims as any)?.email ?? (context.claims as any)?.name ?? "Operator";
    const dto = data.transportId
      ? await prepareFromTransport(context.supabase, data.transportId, issuer)
      : await prepareFromPool(context.supabase, data.poolId!, issuer);
    const file = generateWzFile(dto);
    return { data: dto, file };
  });
