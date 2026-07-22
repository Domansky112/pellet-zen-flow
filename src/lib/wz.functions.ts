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
  hasUnloadingEquipment: boolean;
  leadNumber: string | null;
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
    hasUnloadingEquipment: !!lead?.has_unloading_equipment,
    leadNumber: lead?.lead_number ?? null,
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
      "id, scheduled_date, city, postal_code, destination_address, driver, vehicle, notes, transport_items(id, product, quantity, address, leads(id, name, first_name, last_name, phone, email, city, postal_code, invoice_company, invoice_nip, invoice_address, has_unloading_equipment))",
    )
    .eq("id", transportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) throw new Error("Transport nie istnieje");

  const rawItems = (t.transport_items ?? []) as any[];
  const items = rawItems.map((i) => buildItem(i.product, Number(i.quantity)));
  const recipients: WzRecipient[] = rawItems
    .map((i): WzRecipient =>
      i.leads
        ? leadToRecipient(i.leads)
        : {
            name: t.city,
            company: null,
            nip: null,
            address: t.destination_address ?? "—",
            phone: null,
            email: null,
            hasUnloadingEquipment: false,
            leadNumber: null,
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
        hasUnloadingEquipment: false,
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
      "id, name, route_to, notes, transport_id, transport_pool_items(id, tons, stop_order, leads(id, name, first_name, last_name, phone, email, city, postal_code, product, quantity, invoice_company, invoice_nip, invoice_address, has_unloading_equipment))",
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

const LOADING_PLACE = "Magazyn Słoneczny Pellet, Witoroża, 21-570 Drelów";

export function generateWzFile(data: WzDocumentData): WzFile {
  const rows = data.items
    .map((i, idx) => {
      const qty = i.pieces ? `${i.pieces}` : i.quantityTons.toFixed(3);
      const unit = i.pieces ? (i.unit === "big-bag" ? "big-bag" : "paleta") : "t";
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td>${escapeHtml(i.productLabel)}</td>
          <td class="right">${qty}</td>
          <td class="center">${unit}</td>
          <td>${escapeHtml(i.description)}</td>
        </tr>`;
    })
    .join("");

  const unloading = data.recipients
    .map(
      (r) =>
        `<div class="place-row"><strong>${escapeHtml(r.company ?? r.name)}</strong> — ${escapeHtml(
          r.address,
        )}${r.phone ? ` · tel. ${escapeHtml(r.phone)}` : ""}<br/><span class="muted">Sprzęt do rozładunku u klienta: <b>${r.hasUnloadingEquipment ? "TAK" : "NIE — wymagany HDS / winda"}</b></span></div>`,
    )
    .join("");

  const anyMissingUnload = data.recipients.some((r) => !r.hasUnloadingEquipment);
  const allSelfUnload = data.recipients.length > 0 && data.recipients.every((r) => r.hasUnloadingEquipment);
  const unloadNote = allSelfUnload
    ? "Sprzęt do rozładunku u klienta: TAK (wszystkie punkty)"
    : anyMissingUnload
      ? "UWAGA: co najmniej jeden punkt bez własnego sprzętu — wymagany rozładunek HDS / winda"
      : "";

  const firstRecipient = data.recipients[0];
  const recipientBlock = firstRecipient
    ? `<strong>${escapeHtml(firstRecipient.company ?? firstRecipient.name)}</strong><br/>
       ${firstRecipient.nip ? `NIP: ${escapeHtml(firstRecipient.nip)}<br/>` : ""}
       ${escapeHtml(firstRecipient.address)}${
         data.recipients.length > 1
           ? `<br/><span class="muted">+ ${data.recipients.length - 1} kolejnych odbiorców (patrz miejsca rozładunku)</span>`
           : ""
       }`
    : "<em>—</em>";

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"/><title>${data.number}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 12px; line-height: 1.35; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: 1px; }
  .header .meta { text-align: right; font-size: 11px; }
  .header .meta strong { font-size: 13px; }
  table.doc { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.doc th, table.doc td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
  table.doc th { background: #eee; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; text-align: left; }
  .parties td { width: 33.33%; }
  .places td { width: 50%; }
  table.items th { background: #eee; font-size: 11px; }
  table.items td.center, table.items th.center { text-align: center; }
  table.items td.right, table.items th.right { text-align: right; }
  .notes { border: 1px solid #333; padding: 8px 10px; min-height: 50px; margin-bottom: 20px; }
  .notes h3 { margin: 0 0 4px 0; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #555; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; }
  .sig { border-top: 1px solid #333; padding-top: 4px; text-align: center; font-size: 10px; color: #555; }
  .sig strong { display: block; color: #111; font-size: 11px; margin-bottom: 20px; }
  .place-row + .place-row { margin-top: 4px; padding-top: 4px; border-top: 1px dashed #bbb; }
  .muted { color: #666; font-size: 10px; }
  .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; background: #e5661b; color: #fff; border: 0; border-radius: 4px; cursor: pointer; font-weight: 600; }
  @media print { .print-btn { display: none; } }
</style></head><body>
  <button class="print-btn" onclick="window.print()">Drukuj / Zapisz PDF</button>

  <div class="header">
    <div>
      <h1>WYDANIE ZEWNĘTRZNE (WZ)</h1>
      <div class="muted">Dokument wydania towaru / list przewozowy</div>
    </div>
    <div class="meta">
      <div>Nr: <strong>${data.number}</strong></div>
      <div>Data wystawienia: <strong>${data.issueDate}</strong></div>
      <div>Data wydania: <strong>${data.transportDate}</strong></div>
      <div>Miejscowość: <strong>Drelów</strong></div>
    </div>
  </div>

  <table class="doc parties">
    <thead><tr><th>Nadawca / Dostawca</th><th>Odbiorca</th><th>Przewoźnik</th></tr></thead>
    <tbody><tr>
      <td>
        <strong>${escapeHtml(data.issuer.name)}</strong><br/>
        ${escapeHtml(data.issuer.address)}
        ${data.issuer.nip ? `<br/>NIP: ${escapeHtml(data.issuer.nip)}` : ""}
      </td>
      <td>${recipientBlock}</td>
      <td>
        <strong>${escapeHtml(data.issuer.name)}</strong><br/>
        Kierowca: <strong>${escapeHtml(data.carrier.driver ?? "—")}</strong><br/>
        Pojazd: <strong>${escapeHtml(data.carrier.vehicle ?? "—")}</strong>
      </td>
    </tr></tbody>
  </table>

  <table class="doc places">
    <thead><tr><th>Miejsce załadunku</th><th>Miejsce(a) rozładunku</th></tr></thead>
    <tbody><tr>
      <td>${escapeHtml(LOADING_PLACE)}</td>
      <td>${unloading || "<em>—</em>"}</td>
    </tr></tbody>
  </table>

  <table class="doc items">
    <thead><tr>
      <th class="center" style="width:6%">Lp.</th>
      <th style="width:34%">Nazwa towaru / materiału</th>
      <th class="right" style="width:12%">Ilość</th>
      <th class="center" style="width:10%">Jm.</th>
      <th>Uwagi</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="2" class="right"><strong>RAZEM</strong></td>
      <td class="right"><strong>${data.totals.pieces || data.totals.tons.toFixed(3)}</strong></td>
      <td class="center"><strong>${data.totals.pieces ? "szt." : "t"}</strong></td>
      <td>${data.totals.pieces ? `${data.totals.tons.toFixed(3)} t łącznie` : ""}</td>
    </tr></tfoot>
  </table>

  <div class="notes">
    <h3>Uwagi do transportu / rozładunku</h3>
    ${unloadNote ? `<div><strong>${escapeHtml(unloadNote)}</strong></div>` : ""}
    ${data.carrier.notes ? `<div>${escapeHtml(data.carrier.notes)}</div>` : (!unloadNote ? "&nbsp;" : "")}
  </div>

  <div class="signatures">
    <div class="sig"><strong>&nbsp;</strong>Sporządził / Wydał<br/>${escapeHtml(data.signatures.issuedBy)}</div>
    <div class="sig"><strong>&nbsp;</strong>Przewoźnik / Kierowca<br/>${escapeHtml(data.carrier.driver ?? "…………………………")}</div>
    <div class="sig"><strong>&nbsp;</strong>Odebrał / Odbiorca<br/>${escapeHtml(data.signatures.receivedBy || "…………………………")}</div>
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
