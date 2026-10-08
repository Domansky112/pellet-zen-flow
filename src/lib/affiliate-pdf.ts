import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import fontRegularUrl from "@/assets/fonts/DejaVuSans.ttf?url";
import fontBoldUrl from "@/assets/fonts/DejaVuSans-Bold.ttf?url";

const F = "DejaVu";
const nb = (v: string) => v.replace(/[\u00a0\u202f]/g, " ");
const pln = (n: number) =>
  nb(`${(Number(n) || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`);
const dmy = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");
const METHODS: Record<string, string> = { przelew: "Przelew bankowy", gotowka: "Gotówka", kompensata: "Kompensata / rabat" };

async function b64(url: string) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function downloadAffiliateSettlementPdf(partner: any, settlement: any, items: any[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const [r, b] = await Promise.all([b64(fontRegularUrl), b64(fontBoldUrl)]);
  doc.addFileToVFS("R.ttf", r); doc.addFont("R.ttf", F, "normal");
  doc.addFileToVFS("B.ttf", b); doc.addFont("B.ttf", F, "bold");
  const M = 15, W = doc.internal.pageSize.getWidth();
  let y = 20;
  doc.setFont(F, "bold").setFontSize(14).text("Zestawienie transportów afiliacyjnych", M, y);
  y += 6;
  doc.setFont(F, "normal").setFontSize(9).setTextColor(110);
  doc.text(`Nr zestawienia: ${String(settlement.id).slice(0, 8).toUpperCase()}`, M, y);
  doc.text(`Wygenerowano: ${new Date().toLocaleString("pl-PL")}`, W - M, y, { align: "right" });
  y += 8;
  doc.setTextColor(20).setFontSize(10);
  const left = [
    ["Wystawca", "GOSPODARSTWO MICHALCZUK SPÓŁKA KOMANDYTOWA"],
    ["", "ul. Witoroż 70C, 21-570 Drelów, NIP 5372656685"],
    ["Partner", partner.full_name],
    ["NIP", partner.nip || "—"],
    ["Rachunek", partner.bank_account || "—"],
    ["Data rozliczenia", dmy(settlement.paid_at)],
    ["Forma", METHODS[settlement.method] ?? settlement.method],
  ];
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: "plain", body: left,
    styles: { font: F, fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 35 } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: "grid",
    head: [["Data", "Opis", "Lead", "Tonaż", "Stawka / t", "Kwota"]],
    body: [
      ...items.map((c) => [
        dmy(c.commission_date), c.description,
        c.leads ? `#${c.leads.lead_number ?? ""} ${c.leads.name ?? ""}` : "—",
        c.tons ? nb(`${Number(c.tons).toLocaleString("pl-PL")} t`) : "—",
        c.rate_per_ton ? pln(c.rate_per_ton) : "—", pln(c.amount),
      ]),
      [{ content: "RAZEM", colSpan: 5, styles: { fontStyle: "bold" } },
       { content: pln(settlement.total_amount), styles: { fontStyle: "bold" } }],
    ],
    styles: { font: F, fontSize: 8.5, cellPadding: 1.8, lineColor: 214, lineWidth: 0.1 },
    headStyles: { font: F, fontStyle: "bold", fillColor: 240, textColor: 20 },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;
  if (settlement.notes) { doc.setFontSize(9).text(`Uwagi: ${settlement.notes}`, M, y, { maxWidth: W - 2 * M }); y += 10; }
  y += 15;
  doc.setDrawColor(150);
  doc.line(M, y, M + 65, y); doc.line(W - M - 65, y, W - M, y);
  doc.setFontSize(8).setTextColor(110);
  doc.text("Wystawca", M + 32.5, y + 4, { align: "center" });
  doc.text("Partner", W - M - 32.5, y + 4, { align: "center" });
  const safe = partner.full_name.replace(/[^\p{L}\p{N}]+/gu, "-");
  doc.save(`zestawienie-afiliacyjne-${safe}-${settlement.paid_at}.pdf`);
}
