/**
 * Agregacja danych do raportu finansowo-operacyjnego PDF.
 * Logika czysto serwerowa — wołana z src/lib/report.functions.ts
 */

type AnyClient = any;

export type ReportOptions = {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  anonymize: boolean;
};

export async function buildFinancialReport(supabase: AnyClient, opts: ReportOptions) {
  const { from, to, anonymize } = opts;

  // ── LEADY (zrealizowane / wygrane) ──
  let leadsQ = supabase
    .from("leads")
    .select(
      "id, lead_number, name, first_name, last_name, invoice_company, product, quantity, city, postal_code, payment_amount_gross, payment_method, payment_status, delivered_at, updated_at, reservation_status, sales_vat_rate, transport_cost_gross, transport_vat_rate",
    )
    .or("reservation_status.eq.wydany,status_key.eq.wygrany,status.eq.wygrany")
    .is("deleted_at", null)
    .order("delivered_at", { ascending: false, nullsFirst: false })
    .limit(2000);
  leadsQ = leadsQ.or(
    `delivered_at.gte.${from}T00:00:00,and(delivered_at.is.null,updated_at.gte.${from}T00:00:00)`,
  );
  leadsQ = leadsQ.or(
    `delivered_at.lte.${to}T23:59:59,and(delivered_at.is.null,updated_at.lte.${to}T23:59:59)`,
  );
  const { data: leads, error: le } = await leadsQ;
  if (le) throw new Error(le.message);

  // ── KOSZTY ──
  // Koszty z okresem rozliczeniowym (np. wypłaty pracownicze wygenerowane
  // kilka dni po zakończeniu miesiąca) przypisujemy do ich okresu,
  // a nie do daty wystawienia. Pozostałe — po expense_date.
  const { data: expenses, error: ee } = await supabase
    .from("expenses")
    .select("*")
    .is("deleted_at", null)
    .or(
      `and(period_start.not.is.null,period_start.lte.${to},period_end.gte.${from}),` +
        `and(period_start.is.null,expense_date.gte.${from},expense_date.lte.${to})`,
    )
    .order("expense_date", { ascending: false })
    .limit(2000);
  if (ee) throw new Error(ee.message);


  // ── USTAWIENIA (koszt jednostkowy / dane firmy) ──
  const { data: settings } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", ["pellet_unit_cost_pln", "company_info"]);
  const settingMap = new Map<string, any>((settings ?? []).map((s: any) => [s.key, s.value]));
  const unitCost = Number(settingMap.get("pellet_unit_cost_pln")?.pln_per_ton ?? 0);
  const cogsVatRate = Number(settingMap.get("pellet_unit_cost_pln")?.vat_rate ?? 8);
  const ci = settingMap.get("company_info") ?? {};
  const company = {
    name: String(ci.name ?? "Słoneczny Pellet"),
    nip: ci.nip ? String(ci.nip) : null,
    address: String(ci.address ?? "Magazyn: Witoroża, 21-570 Drelów"),
  };

  // ── PRZYCHODY / VAT / WOLUMEN ──
  let income = 0,
    cash = 0,
    transfer = 0,
    blik = 0,
    pending = 0;
  let salesVat = 0,
    salesVat8 = 0,
    salesVat23 = 0,
    transportVat = 0,
    transportCosts = 0,
    transportCostsNet = 0;
  let tonsTotal = 0,
    tonsPaleta = 0,
    tonsBigbag = 0,
    tonsInne = 0;
  let incomePaleta = 0,
    incomeBigbag = 0;

  for (const l of leads ?? []) {
    const amt = Number(l.payment_amount_gross ?? 0);
    income += amt;
    const sVat = Number(l.sales_vat_rate ?? 8);
    const vatAmt = amt - amt / (1 + sVat / 100);
    salesVat += vatAmt;
    if (sVat >= 23) salesVat23 += vatAmt;
    else salesVat8 += vatAmt;

    const tCost = Number(l.transport_cost_gross ?? 0);
    const tVat = Number(l.transport_vat_rate ?? 23);
    transportCosts += tCost;
    transportCostsNet += tCost / (1 + tVat / 100);
    const tVatAmt = tCost - tCost / (1 + tVat / 100);
    transportVat += tVatAmt;
    if (tVat >= 23) salesVat23 += tVatAmt;
    else salesVat8 += tVatAmt;

    if (l.payment_status === "oplacone_gotowka") {
      if (l.payment_method === "karta_blik") blik += amt;
      else cash += amt;
    } else if (l.payment_status === "oplacone_przelew") transfer += amt;
    else pending += amt;

    const qty = Number(l.quantity ?? 0);
    if (qty > 0) {
      tonsTotal += qty;
      if (l.product === "pellet_paleta") {
        tonsPaleta += qty;
        incomePaleta += amt;
      } else if (l.product === "pellet_bigbag") {
        tonsBigbag += qty;
        incomeBigbag += amt;
      } else tonsInne += qty;
    }
  }

  // ── KOSZTY DODATKOWE ──
  const isCapex = (e: any) => e.category === "zakup_srodka_trwalego";
  const manualCosts = (expenses ?? [])
    .filter((e: any) => !isCapex(e))
    .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  const capexCosts = (expenses ?? [])
    .filter(isCapex)
    .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  const manualCostsNet = (expenses ?? [])
    .filter((e: any) => !isCapex(e))
    .reduce(
      (s: number, e: any) => s + Number(e.amount ?? 0) / (1 + Number(e.vat_rate ?? 23) / 100),
      0,
    );
  const costsByCategory = new Map<string, number>();
  for (const e of (expenses ?? []).filter((x: any) => !isCapex(x))) {
    costsByCategory.set(e.category, (costsByCategory.get(e.category) ?? 0) + Number(e.amount ?? 0));
  }

  // ── COGS (FIFO + fallback) ──
  const leadIds = (leads ?? []).map((l: any) => l.id);
  const fifoByLead = new Map<string, { cost: number; tons: number }>();
  if (leadIds.length) {
    const { data: cons } = await supabase
      .from("stock_lot_consumptions")
      .select("lead_id, quantity, cost")
      .in("lead_id", leadIds);
    for (const c of cons ?? []) {
      const prev = fifoByLead.get(c.lead_id) ?? { cost: 0, tons: 0 };
      prev.cost += Number(c.cost ?? 0);
      prev.tons += Number(c.quantity ?? 0);
      fifoByLead.set(c.lead_id, prev);
    }
  }
  let cogs = 0;
  const cogsByLead = new Map<string, number>();
  for (const l of leads ?? []) {
    const qty = Number(l.quantity ?? 0);
    const f = fifoByLead.get(l.id);
    // Partie FIFO mogą pokrywać tylko część wydania — resztę wyceniamy stawką z Ustawień.
    const c =
      f && f.tons > 0 ? f.cost + Math.max(0, qty - f.tons) * unitCost : qty * unitCost;
    cogsByLead.set(l.id, c);
    cogs += c;
  }

  const cogsNet = cogs / (1 + cogsVatRate / 100);

  // ── MAGAZYN (stan na koniec okresu — bieżący stan FIFO) ──
  const { data: bal } = await supabase.from("stock_balance").select("product, physical, reserved");
  const { data: lots } = await supabase
    .from("stock_lots")
    .select("product, remaining_quantity, unit_price")
    .gt("remaining_quantity", 0);
  const lotByProduct = new Map<string, { tons: number; value: number }>();
  for (const l of lots ?? []) {
    const prev = lotByProduct.get(l.product) ?? { tons: 0, value: 0 };
    const q = Number(l.remaining_quantity ?? 0);
    prev.tons += q;
    prev.value += q * Number(l.unit_price ?? 0);
    lotByProduct.set(l.product, prev);
  }
  const warehouse = (bal ?? []).map((r: any) => {
    const physical = Number(r.physical ?? 0);
    const reserved = Number(r.reserved ?? 0);
    const lot = lotByProduct.get(r.product);
    const uncovered = Math.max(0, physical - (lot?.tons ?? 0));
    return {
      product: r.product as string,
      physical,
      reserved,
      available: physical - reserved,
      value: (lot?.value ?? 0) + uncovered * unitCost,
    };
  });
  const warehouseTons = warehouse.reduce((s: number, r: any) => s + r.available, 0);
  const warehouseValue = warehouse.reduce((s: number, r: any) => s + r.value, 0);

  // ── WYNIKI ──
  const vatTotal = salesVat + transportVat;
  const incomeNet = income - vatTotal;
  const totalCosts = manualCosts + cogs + transportCosts;
  const totalCostsNet = cogsNet + manualCostsNet + transportCostsNet;
  const grossProfit = income - totalCosts;
  const netProfit = incomeNet - totalCostsNet;
  const margin = incomeNet > 0 ? (netProfit / incomeNet) * 100 : 0;

  // ── POZYCJE ZLECEŃ ──
  const rows = (leads ?? []).map((l: any) => {
    const gross = Number(l.payment_amount_gross ?? 0);
    const tCost = Number(l.transport_cost_gross ?? 0);
    const clientName =
      l.invoice_company ||
      [l.first_name, l.last_name].filter(Boolean).join(" ") ||
      l.name ||
      "—";
    return {
      date: (l.delivered_at ?? l.updated_at ?? "").slice(0, 10),
      number: l.lead_number ?? l.id.slice(0, 8),
      client: anonymize ? "—" : clientName,
      city: [l.city, l.postal_code].filter(Boolean).join(", ") || "—",
      tons: Number(l.quantity ?? 0),
      form:
        l.product === "pellet_paleta" ? "Paleta" : l.product === "pellet_bigbag" ? "Big Bag" : "Inne",
      gross,
      transportCost: tCost,
      profit: gross - tCost - (cogsByLead.get(l.id) ?? 0),
    };
  });

  return {
    period: { from, to },
    anonymize,
    company,
    kpi: {
      income,
      incomeNet,
      vatTotal,
      salesVat,
      salesVat8,
      salesVat23,
      transportVat,
      cogs,
      cogsNet,
      transportCosts,
      transportCostsNet,
      manualCosts,
      manualCostsNet,
      capexCosts,
      totalCosts,
      totalCostsNet,
      grossProfit,
      netProfit,
      margin,
    },
    volume: {
      tonsTotal,
      tonsPaleta,
      tonsBigbag,
      tonsInne,
      ordersCount: (leads ?? []).length,
      avgTransportPerTon: tonsTotal > 0 ? transportCostsNet / tonsTotal : 0,
      avgNetPricePerTon: tonsTotal > 0 ? incomeNet / tonsTotal : 0,
      avgPricePaleta: tonsPaleta > 0 ? incomePaleta / tonsPaleta : 0,
      avgPriceBigbag: tonsBigbag > 0 ? incomeBigbag / tonsBigbag : 0,
    },
    warehouse: { perProduct: warehouse, totalTons: warehouseTons, totalValue: warehouseValue },
    cashflow: { cash, transfer, blik, pending },
    costsByCategory: Array.from(costsByCategory.entries()).map(([category, amount]) => ({
      category,
      amount,
    })),
    rows,
  };
}
