/**
 * Generator PDF raportu finansowo-operacyjnego (klient, jsPDF + autoTable).
 * Fonty DejaVu osadzone lokalnie — pełna obsługa polskich znaków.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import fontRegularUrl from "@/assets/fonts/DejaVuSans.ttf?url";
import fontBoldUrl from "@/assets/fonts/DejaVuSans-Bold.ttf?url";

export type ReportData = Awaited<ReturnType<any>> & Record<string, any>;

const FONT = "DejaVu";
const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];
const LINE: [number, number, number] = [214, 214, 219];
const GREEN: [number, number, number] = [22, 101, 52];
const GREEN_BG: [number, number, number] = [220, 245, 229];
const HEAD_BG: [number, number, number] = [244, 244, 245];

let fontCache: { regular: string; bold: string } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const toB64 = async (url: string) => {
    const buf = await (await fetch(url)).arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  };
  const [regular, bold] = await Promise.all([toB64(fontRegularUrl), toB64(fontBoldUrl)]);
  fontCache = { regular, bold };
  return fontCache;
}

// DejaVu nie ma wąskiej spacji nierozdzielającej — zamieniamy na zwykłą spację.
const nbsp = (v: string) => v.replace(/[\u00a0\u202f]/g, " ");
const pln = (n: number) =>
  nbsp(
    `${(Math.round((n ?? 0) * 100) / 100).toLocaleString("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} zł`,
  );
const tons = (n: number) => nbsp(`${(Math.round((n ?? 0) * 100) / 100).toLocaleString("pl-PL")} t`);
const pct = (n: number) => nbsp(`${(Math.round((n ?? 0) * 10) / 10).toLocaleString("pl-PL")} %`);
const dmy = (iso: string) => (iso ? iso.split("-").reverse().join(".") : "—");

const CATEGORY_LABEL: Record<string, string> = {
  paliwo: "Paliwo",
  wynagrodzenia: "Wynagrodzenia / kierowca",
  wynagrodzenia_robocizna: "Wynagrodzenia i robocizna",
  eksploatacja: "Eksploatacja pojazdu",
  biuro: "Biuro / administracja",
  marketing: "Marketing",
  podatki: "Podatki / opłaty",
  inne: "Inne",
};

export async function buildReportPdf(
  data: ReportData,
  variant: "summary" | "full",
): Promise<jsPDF> {
  const fonts = await loadFonts();
  const landscape = variant === "full";
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setFont(FONT, "normal");

  const M = 15;
  const W = doc.internal.pageSize.getWidth();
  const right = W - M;
  let y = M;

  // ── SEKCJA 1: nagłówek ──
  doc.setFillColor(234, 88, 12);
  doc.roundedRect(M, y, 14, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT, "bold").setFontSize(10);
  doc.text("SP", M + 7, y + 9, { align: "center" });

  doc.setTextColor(...INK);
  doc.setFont(FONT, "bold").setFontSize(13);
  doc.text(data.company.name, M + 18, y + 5.5);
  doc.setFont(FONT, "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text(
    [data.company.nip ? `NIP: ${data.company.nip}` : null, data.company.address]
      .filter(Boolean)
      .join("  ·  "),
    M + 18,
    y + 10.5,
  );

  doc.setTextColor(...INK).setFont(FONT, "bold").setFontSize(12);
  doc.text("Raport Finansowo-Operacyjny", right, y + 5.5, { align: "right" });
  doc.setFont(FONT, "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text(
    variant === "summary" ? "Sprzedaż pelletu — skrót (Executive Summary)" : "Sprzedaż pelletu — raport pełny",
    right,
    y + 10.5,
    { align: "right" },
  );

  y += 18;
  doc.setDrawColor(...LINE).line(M, y, right, y);
  y += 5;

  doc.setFontSize(8).setTextColor(...MUTED);
  doc.text(`Okres raportu: ${dmy(data.period.from)} – ${dmy(data.period.to)}`, M, y);
  doc.text(
    `Wygenerowano: ${new Date(data.generatedAt).toLocaleString("pl-PL")}  ·  ${data.generatedBy}`,
    right,
    y,
    { align: "right" },
  );
  if (data.anonymize) {
    y += 4;
    doc.text("Dokument zanonimizowany — dane klientów ukryte (ID zlecenia + miasto).", M, y);
  }
  y += 6;

  const table = (opts: any) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      styles: { font: FONT, fontSize: 8, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
      headStyles: { font: FONT, fontStyle: "bold", fillColor: HEAD_BG, textColor: INK },
      theme: "grid",
      ...opts,
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  };

  let sectionNo = 0;
  const sectionTitle = (t: string) => {
    sectionNo += 1;
    // Nie zostawiaj osieroconego nagłówka na dole strony.
    if (y > doc.internal.pageSize.getHeight() - 45) {
      doc.addPage();
      y = M;
    }
    doc.setFont(FONT, "bold").setFontSize(9.5).setTextColor(...INK);
    doc.text(`${sectionNo}. ${t}`, M, y);
    y += 3;
  };

  // ── SEKCJA 2: KPI finansowe ──
  sectionTitle("Kluczowe wskaźniki finansowe");
  table({
    head: [["Pozycja", "Brutto", "Netto"]],
    body: [
      ["Przychód całkowity", pln(data.kpi.income), pln(data.kpi.incomeNet)],
      [
        `Suma należnego VAT (8% = ${pln(data.kpi.salesVat8)}, 23% = ${pln(data.kpi.salesVat23)})`,
        pln(data.kpi.vatTotal),
        "—",
      ],
      ["Koszt surowca (COGS, FIFO)", pln(data.kpi.cogs), pln(data.kpi.cogsNet)],
      ["Koszty logistyki i transportu", pln(data.kpi.transportCosts), pln(data.kpi.transportCostsNet)],
      ["Koszty dodatkowe / eksploatacja / robocizna", pln(data.kpi.manualCosts), pln(data.kpi.manualCostsNet)],
      [
        `Prowizje afiliacyjne (naliczone${
          data.kpi.affiliateCostsPending > 0 ? `, w tym niewypłacone ${pln(data.kpi.affiliateCostsPending)}` : ""
        })`,
        pln(data.kpi.affiliateCosts ?? 0),
        pln(data.kpi.affiliateCostsNet ?? 0),
      ],
      ["Koszty razem", pln(data.kpi.totalCosts), pln(data.kpi.totalCostsNet)],
      ["Zysk brutto", pln(data.kpi.grossProfit), "—"],
      [
        {
          content: `ZYSK NETTO  ·  marża ${pct(data.kpi.margin)}`,
          styles: { fontStyle: "bold", fillColor: GREEN_BG, textColor: GREEN },
        },
        {
          content: "—",
          styles: { fillColor: GREEN_BG, textColor: GREEN },
        },
        {
          content: pln(data.kpi.netProfit),
          styles: { fontStyle: "bold", fillColor: GREEN_BG, textColor: GREEN },
        },
      ],
    ],
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });

  // ── SEKCJA 3: wolumen ──
  sectionTitle("Wolumen i statystyki operacyjne");
  table({
    head: [["Wskaźnik", "Wartość", "Wskaźnik", "Wartość"]],
    body: [
      ["Łączny sprzedany tonaż", tons(data.volume.tonsTotal), "Liczba zrealizowanych zleceń", String(data.volume.ordersCount)],
      ["Palety (workowany)", tons(data.volume.tonsPaleta), "Big Bagi (luz / zasyp)", tons(data.volume.tonsBigbag)],
      [
        "Średni koszt transportu / t",
        `${pln(data.volume.avgTransportPerTon)}/t`,
        "Średnia cena sprzedaży netto / t",
        `${pln(data.volume.avgNetPricePerTon)}/t`,
      ],
      [
        "Średnia cena — paleta (brutto/t)",
        `${pln(data.volume.avgPricePaleta)}/t`,
        "Średnia cena — big bag (brutto/t)",
        `${pln(data.volume.avgPriceBigbag)}/t`,
      ],
    ],
    columnStyles: { 1: { halign: "right" }, 3: { halign: "right" } },
  });

  // ── SEKCJA 4 + 5 ──
  sectionTitle("Stan magazynu i majątku (na dzień zamknięcia raportu)");
  const wRows = data.warehouse.perProduct.map((p: any) => [
    p.product === "pellet_paleta" ? "Palety" : p.product === "pellet_bigbag" ? "Big Bagi" : "Inne",
    tons(p.available),
    pln(p.value),
  ]);
  table({
    head: [["Produkt", "Dostępny tonaż", "Wycena FIFO"]],
    body: [
      ...wRows,
      [
        { content: "RAZEM", styles: { fontStyle: "bold" } },
        { content: tons(data.warehouse.totalTons), styles: { fontStyle: "bold" } },
        { content: pln(data.warehouse.totalValue), styles: { fontStyle: "bold" } },
      ],
    ],
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });

  sectionTitle("Struktura płatności i cashflow");
  table({
    head: [["Forma płatności", "Kwota brutto"]],
    body: [
      ["Gotówka przy odbiorze", pln(data.cashflow.cash)],
      ["BLIK / płatność elektroniczna", pln(data.cashflow.blik)],
      ["Przelew bankowy / faktura terminowa", pln(data.cashflow.transfer)],
      ["Należności oczekujące / nierozliczone", pln(data.cashflow.pending)],
    ],
    columnStyles: { 1: { halign: "right" } },
  });

  // ── SEKCJA 6: tabela zleceń (tylko raport pełny) ──
  if (variant === "full") {
    if (data.costsByCategory.length) {
      sectionTitle("Koszty dodatkowe wg kategorii");
      table({
        head: [["Kategoria", "Kwota brutto"]],
        body: data.costsByCategory.map((c: any) => [
          CATEGORY_LABEL[c.category] ?? c.category,
          pln(c.amount),
        ]),
        columnStyles: { 1: { halign: "right" } },
      });
    }

    if (data.affiliates?.length) {
      sectionTitle("Prowizje afiliacyjne naliczone w okresie");
      const affSum = data.affiliates.reduce(
        (a: any, r: any) => ({ tons: a.tons + (r.tons ?? 0), amount: a.amount + r.amount }),
        { tons: 0, amount: 0 },
      );
      table({
        head: [["Data naliczenia", "Partner", "Opis", "Tonaż", "Stawka / t", "Kwota", "Status"]],
        body: [
          ...data.affiliates.map((r: any) => [
            dmy(r.date),
            r.partner,
            r.description,
            r.tons ? tons(r.tons) : "—",
            r.ratePerTon ? `${pln(r.ratePerTon)}/t` : "—",
            pln(r.amount),
            r.paid ? "Wypłacona" : "Do wypłaty",
          ]),
          [
            { content: "SUMA", colSpan: 3, styles: { fontStyle: "bold" } },
            { content: tons(affSum.tons), styles: { fontStyle: "bold" } },
            "",
            { content: pln(affSum.amount), styles: { fontStyle: "bold" } },
            "",
          ],
        ],
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
      });
    }



    sectionTitle("Zrealizowane zlecenia w okresie");
    const sum = data.rows.reduce(
      (a: any, r: any) => ({
        tons: a.tons + r.tons,
        gross: a.gross + r.gross,
        transport: a.transport + r.transportCost,
        profit: a.profit + r.profit,
      }),
      { tons: 0, gross: 0, transport: 0, profit: 0 },
    );
    table({
      head: [["Data", "Nr zlecenia", "Klient", "Miasto / kod", "Tonaż", "Forma", "Przychód brutto", "Koszt transportu", "Zysk"]],
      body: [
        ...data.rows.map((r: any) => [
          dmy(r.date),
          r.number,
          r.client,
          r.city,
          tons(r.tons),
          r.form,
          pln(r.gross),
          pln(r.transportCost),
          pln(r.profit),
        ]),
        [
          { content: "SUMA", colSpan: 4, styles: { fontStyle: "bold" } },
          { content: tons(sum.tons), styles: { fontStyle: "bold" } },
          "",
          { content: pln(sum.gross), styles: { fontStyle: "bold" } },
          { content: pln(sum.transport), styles: { fontStyle: "bold" } },
          { content: pln(sum.profit), styles: { fontStyle: "bold", textColor: GREEN } },
        ],
      ],
      styles: { font: FONT, fontSize: 7, cellPadding: 1.4, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
      columnStyles: {
        4: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right" },
      },
    });
  }

  // ── Stopka: numeracja stron ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont(FONT, "normal").setFontSize(7).setTextColor(...MUTED);
    doc.text(`${data.company.name} — raport wewnętrzny, nie stanowi dokumentu księgowego`, M, H - 8);
    doc.text(`Strona ${i} z ${pages}`, right, H - 8, { align: "right" });
  }

  return doc;
}

export function reportFileName(data: ReportData, variant: "summary" | "full") {
  return `raport-${variant === "summary" ? "skrocony" : "pelny"}-${data.period.from}_${data.period.to}.pdf`;
}
