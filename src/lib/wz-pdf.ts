/**
 * Generator PDF dokumentu WZ (klient, jsPDF) — układ zgodny z dotychczasowym HTML.
 * Fonty DejaVu osadzone lokalnie — pełna obsługa polskich znaków.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import fontRegularUrl from "@/assets/fonts/DejaVuSans.ttf?url";
import fontBoldUrl from "@/assets/fonts/DejaVuSans-Bold.ttf?url";
import type { WzDocumentData } from "@/lib/wz.functions";

const FONT = "DejaVu";
const INK: [number, number, number] = [17, 17, 17];
const MUTED: [number, number, number] = [102, 102, 102];
const LINE: [number, number, number] = [51, 51, 51];
const HEAD_BG: [number, number, number] = [238, 238, 238];

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

const formatPlDate = (iso: string) => (iso ? iso.split("-").reverse().join(".") : "—");

export async function buildWzPdf(data: WzDocumentData): Promise<jsPDF> {
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setFont(FONT, "normal");

  const M = 15;
  const W = doc.internal.pageSize.getWidth();
  const right = W - M;
  let y = M;

  // ── Nagłówek ──
  doc.setFont(FONT, "bold").setFontSize(16).setTextColor(...INK);
  doc.text("WYDANIE ZEWNĘTRZNE (WZ)", M, y + 4);
  doc.setFont(FONT, "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text("Dokument wydania towaru / list przewozowy", M, y + 9);

  doc.setFontSize(9).setTextColor(...INK);
  doc.setFont(FONT, "normal").text("Nr dokumentu: ", right - 45, y + 2, { align: "left" });
  doc.setFont(FONT, "bold").text(data.number, right, y + 2, { align: "right" });
  doc.setFont(FONT, "normal");
  doc.text(`Miejscowość: ${data.city}, Data: ${formatPlDate(data.transportDate)}`, right, y + 7, {
    align: "right",
  });
  y += 14;

  const baseStyles = {
    font: FONT,
    fontSize: 9,
    cellPadding: 2.2,
    textColor: INK,
    lineColor: LINE,
    lineWidth: 0.2,
  } as const;
  const headStyles = {
    font: FONT,
    fontStyle: "bold" as const,
    fillColor: HEAD_BG,
    textColor: INK,
    fontSize: 7.5,
  };

  const runTable = (opts: any) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      styles: { ...baseStyles },
      headStyles: { ...headStyles },
      footStyles: { ...headStyles, fontSize: 9 },
      theme: "grid",
      ...opts,
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  };

  // ── Strony dokumentu ──
  const firstRecipient = data.recipients[0];
  const recipientLines: string[] = [];
  if (firstRecipient) {
    recipientLines.push(firstRecipient.company ?? firstRecipient.name);
    if (firstRecipient.nip) recipientLines.push(`NIP: ${firstRecipient.nip}`);
    recipientLines.push(firstRecipient.address);
    if (data.recipients.length > 1) {
      recipientLines.push(`+ ${data.recipients.length - 1} kolejnych odbiorców (patrz miejsca rozładunku)`);
    }
  }

  runTable({
    head: [["Nadawca / Dostawca", "Odbiorca", "Przewoźnik"]],
    body: [
      [
        `${data.issuer.name}\n${data.issuer.address}${data.issuer.nip ? `\nNIP: ${data.issuer.nip}` : ""}`,
        recipientLines.join("\n"),
        `${data.issuer.name}\nKierowca: ${data.carrier.driver ?? ""}\nPojazd: ${data.carrier.vehicle ?? ""}`,
      ],
    ],
    columnStyles: { 0: { cellWidth: (W - 2 * M) / 3 }, 1: { cellWidth: (W - 2 * M) / 3 }, 2: { cellWidth: (W - 2 * M) / 3 } },
  });

  // ── Miejsca załadunku / rozładunku ──
  const unloadingLines = data.recipients
    .map((r) => {
      const head = `${r.leadNumber ? `${r.leadNumber} · ` : ""}${r.company ?? r.name} — ${r.deliveryAddress}${r.phone ? ` · tel. ${r.phone}` : ""}`;
      const eq = `Sprzęt do rozładunku u klienta: ${r.hasUnloadingEquipment ? "TAK" : "NIE — wymagany HDS / winda"}`;
      return `${head}\n${eq}`;
    })
    .join("\n\n");

  runTable({
    head: [["Miejsce załadunku", "Miejsce(a) rozładunku"]],
    body: [[data.loadingPlace, unloadingLines || "—"]],
    columnStyles: { 0: { cellWidth: (W - 2 * M) / 2 }, 1: { cellWidth: (W - 2 * M) / 2 } },
  });

  // ── Tabela towarów (ilość pusta — uzupełnia kierowca) ──
  runTable({
    head: [["Lp.", "Nazwa towaru / materiału", "Ilość", "Jm.", "Uwagi"]],
    body: data.items.map((i, idx) => [
      String(idx + 1),
      i.productLabel,
      "",
      i.unit,
      i.description,
    ]),
    foot: [
      [
        { content: "RAZEM (wpisuje kierowca)", colSpan: 2, styles: { halign: "right", fontStyle: "bold" } },
        "",
        { content: "t", styles: { halign: "center", fontStyle: "bold" } },
        { content: "Ilość i tonaż uzupełnia kierowca przy załadunku", styles: { fontSize: 7.5, textColor: MUTED } },
      ],
    ],
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 60 },
      2: { cellWidth: 25, halign: "right", minCellHeight: 8 },
      3: { cellWidth: 18, halign: "center" },
    },
  });

  // ── Uwagi ──
  const anyMissingUnload = data.recipients.some((r) => !r.hasUnloadingEquipment);
  const allSelfUnload = data.recipients.length > 0 && data.recipients.every((r) => r.hasUnloadingEquipment);
  const unloadNote = allSelfUnload
    ? "Sprzęt do rozładunku u klienta: TAK (wszystkie punkty)"
    : anyMissingUnload
      ? "UWAGA: co najmniej jeden punkt bez własnego sprzętu — wymagany rozładunek HDS / winda"
      : "";
  const noteLines = [unloadNote, data.carrier.notes ?? ""].filter(Boolean).join("\n");

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    styles: { ...baseStyles },
    theme: "grid",
    body: [
      [{ content: "UWAGI DO TRANSPORTU / ROZŁADUNKU", styles: { fontSize: 7.5, fontStyle: "bold", textColor: MUTED } }],
      [{ content: noteLines || " ", styles: { minCellHeight: 14 } }],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 24;

  // ── Podpisy ──
  const H = doc.internal.pageSize.getHeight();
  if (y > H - 40) {
    doc.addPage();
    y = M + 20;
  }
  const colW = (W - 2 * M - 2 * 10) / 3;
  const sigLabels: [string, string][] = [
    ["", "Sporządził / Wydał"],
    ["", "Przewoźnik / Kierowca"],
    ["", "Odebrał / Odbiorca"],
  ];
  const sigSubs = ["…………………………", data.carrier.driver ?? "…………………………", data.signatures.receivedBy || "…………………………"];
  sigLabels.forEach(([, label], idx) => {
    const x = M + idx * (colW + 10);
    doc.setDrawColor(...LINE);
    doc.line(x, y, x + colW, y);
    doc.setFont(FONT, "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(label, x + colW / 2, y + 4, { align: "center" });
    doc.setFontSize(8).setTextColor(...INK);
    doc.text(sigSubs[idx], x + colW / 2, y + 8.5, { align: "center" });
  });

  return doc;
}

export function wzFileName(data: WzDocumentData): string {
  return `WZ_${data.number.replace(/\//g, "_")}.pdf`;
}
