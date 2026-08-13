import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEAD_COLS =
  "id, lead_number, name, first_name, last_name, phone, email, city, postal_code, product, quantity, invoice_company, invoice_nip, invoice_address, payment_method, payment_status, payment_amount_gross, invoice_number, receipt_number, payment_reminded_at, driver_settled_at, reservation_status, delivered_at, urgent_no_fuel, sales_vat_rate, transport_cost_gross, transport_vat_rate";

// ─────────────────────────────────────────────────────────────
// Nadchodzące transporty (planowane) — z leadami do pobrania
// ─────────────────────────────────────────────────────────────
export const listUpcomingPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transports")
      .select(
        `id, scheduled_date, city, postal_code, destination_address, driver, vehicle, status, pool_id,
         transport_items(id, product, quantity, leads(${LEAD_COLS}))`,
      )
      .in("status", ["planowany", "potwierdzony", "w_trasie"])
      .order("scheduled_date", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ─────────────────────────────────────────────────────────────
// Zrealizowane transporty i rozliczenia
// ─────────────────────────────────────────────────────────────
export const listCompletedPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transports")
      .select(
        `id, scheduled_date, city, postal_code, destination_address, driver, vehicle, status, pool_id,
         transport_items(id, product, quantity, leads(${LEAD_COLS}))`,
      )
      .eq("status", "dostarczony")
      .order("scheduled_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Fallback: leady wydane bez powiązania z transportem
export const listDeliveredLeadsWithoutTransport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(LEAD_COLS)
      .or("reservation_status.eq.wydany,status_key.eq.wygrany,status.eq.wygrany")
      .is("deleted_at", null)
      .order("delivered_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ─────────────────────────────────────────────────────────────
// Update statusu / numerów płatności
// ─────────────────────────────────────────────────────────────
const PaymentStatusEnum = z.enum([
  "nieoplacone",
  "czeka_przelew",
  "oplacone_gotowka",
  "oplacone_przelew",
  "zaliczka",
]);

const AmountLike = z.preprocess((v) => {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/\s+/g, "").replace(",", ".");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number().nonnegative().max(10_000_000).nullable());

const UpdatePaymentInput = z.object({
  leadId: z.string().uuid(),
  payment_status: PaymentStatusEnum.optional(),
  payment_method: z.string().max(50).optional(),
  invoice_number: z.string().max(64).nullable().optional(),
  receipt_number: z.string().max(64).nullable().optional(),
  payment_amount_gross: AmountLike.optional(),
});

async function assertStaff(context: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isSales }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "sales" }),
  ]);
  if (!isAdmin && !isSales) throw new Error("Brak uprawnień — wymagana rola admin/sales.");
}

export const updateLeadPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdatePaymentInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    // pobierz stan przed edycją, żeby wykryć usunięcie płatności
    const { data: prev } = await context.supabase
      .from("leads")
      .select("payment_status, payment_method, payment_amount_gross")
      .eq("id", data.leadId)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (data.payment_status !== undefined) patch.payment_status = data.payment_status;
    if (data.payment_method !== undefined) patch.payment_method = data.payment_method;
    if (data.invoice_number !== undefined) patch.invoice_number = data.invoice_number;
    if (data.receipt_number !== undefined) patch.receipt_number = data.receipt_number;
    if (data.payment_amount_gross !== undefined) patch.payment_amount_gross = data.payment_amount_gross;

    const { error } = await context.supabase.from("leads").update(patch as any).eq("id", data.leadId);
    if (error) throw new Error(`Payment sync failed for Lead ${data.leadId.slice(0, 8)}: ${error.message}`);

    // Wykryj usunięcie / wyzerowanie płatności → osobna akcja w dzienniku
    const clearedStatus =
      "payment_status" in patch && (patch.payment_status === null || patch.payment_status === "" || patch.payment_status === "nieoplacone");
    const clearedAmount =
      "payment_amount_gross" in patch && (patch.payment_amount_gross === null || Number(patch.payment_amount_gross ?? 0) === 0);
    const wasPaid = prev && (prev as any).payment_status && (prev as any).payment_status !== "nieoplacone" && Number((prev as any).payment_amount_gross ?? 0) > 0;
    const action = wasPaid && (clearedStatus || clearedAmount) ? "payment_removed" : "payment_update";

    await context.supabase.from("audit_log").insert({
      entity_type: "payment",
      entity_id: data.leadId,
      action,
      actor_id: context.userId,
      details: {
        ...patch,
        prev_amount: prev ? (prev as any).payment_amount_gross : null,
        prev_status: prev ? (prev as any).payment_status : null,
        prev_method: prev ? (prev as any).payment_method : null,
      } as any,
    } as any);

    return { ok: true };
  });



// ─────────────────────────────────────────────────────────────
// Rozliczenie trasy z kierowcą (oznacza gotówkowe płatności jako przyjęte do kasy)
// ─────────────────────────────────────────────────────────────
const SettleInput = z.object({ transportId: z.string().uuid() });

export const settleTransportWithDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettleInput.parse(d))
  .handler(async ({ data, context }) => {
    // pobierz leadów z tego transportu opłaconych gotówką
    const { data: items, error } = await context.supabase
      .from("transport_items")
      .select("leads(id, payment_status)")
      .eq("transport_id", data.transportId);
    if (error) throw new Error(error.message);

    const leadIds = (items ?? [])
      .map((i: any) => i.leads)
      .filter((l: any) => l && l.payment_status === "oplacone_gotowka")
      .map((l: any) => l.id);

    if (leadIds.length === 0) return { settled: 0 };

    const { error: upErr } = await context.supabase
      .from("leads")
      .update({ driver_settled_at: new Date().toISOString(), driver_settled_by: context.userId } as any)
      .in("id", leadIds);
    if (upErr) throw new Error(upErr.message);
    return { settled: leadIds.length };
  });

// ─────────────────────────────────────────────────────────────
// Przypomnienie o płatności (znacznik + zwrot linku mailto/sms)
// ─────────────────────────────────────────────────────────────
const ReminderInput = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["email", "sms"]),
});

export const markPaymentReminderSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReminderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ payment_reminded_at: new Date().toISOString() } as any)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    // audit note
    await context.supabase.from("lead_notes").insert({
      lead_id: data.leadId,
      body: `📨 Wysłano przypomnienie o płatności (${data.channel.toUpperCase()})`,
      author_id: context.userId,
    });
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// KOSZTY (expenses)
// ─────────────────────────────────────────────────────────────
const ExpenseInput = z.object({
  description: z.string().trim().min(1).max(500),
  amount: AmountLike.transform((v) => (v ?? 0) as number).pipe(z.number().nonnegative().max(10_000_000)),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(60).default("inne"),
  vat_rate: z.coerce.number().refine((v) => [0, 8, 23].includes(v), "Dozwolone stawki VAT: 0, 8, 23").default(23),
  notes: z.string().trim().max(2000).optional().nullable(),
  fixed_asset_id: z.string().uuid().nullable().optional(),
});


const RangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    let q = context.supabase
      .from("expenses")
      .select("*")
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("expense_date", data.from);
    if (data.to) q = q.lte("expense_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExpenseInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { data: row, error } = await context.supabase
      .from("expenses")
      .insert({ ...data, created_by: context.userId } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      entity_type: "expense",
      entity_id: row.id,
      action: "expense_added",
      actor_id: context.userId,
      details: {
        amount: data.amount,
        description: data.description,
        category: data.category,
        vat_rate: data.vat_rate,
        amount_net: Number((data.amount / (1 + data.vat_rate / 100)).toFixed(2)),
      } as any,
    } as any);
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    // pobierz stan przed (do audytu) — pozwala pokazać w dzienniku „co usunięto”
    const { data: prev } = await context.supabase
      .from("expenses")
      .select("amount, description, category")
      .eq("id", data.id)
      .maybeSingle();

    // MIĘKKIE USUNIĘCIE — wiersz zostaje w bazie, ale znika z bilansu i z listy kosztów
    const { error } = await context.supabase
      .from("expenses")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId, deleted_reason: data.reason ?? null } as any)
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      entity_type: "expense",
      entity_id: data.id,
      action: "expense_deleted",
      actor_id: context.userId,
      details: {
        amount: prev ? (prev as any).amount : null,
        description: prev ? (prev as any).description : null,
        category: prev ? (prev as any).category : null,
        reason: data.reason ?? null,
      } as any,
    } as any);
    return { ok: true };
  });



// ─────────────────────────────────────────────────────────────
// Podsumowanie finansowe w zakresie dat
// ─────────────────────────────────────────────────────────────
export const getFinancialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let leadsQ = context.supabase
      .from("leads")
      .select("id, lead_number, name, first_name, last_name, invoice_company, product, quantity, city, payment_amount_gross, payment_method, payment_status, delivered_at, updated_at, reservation_status, sales_vat_rate, transport_cost_gross, transport_vat_rate")
      .or("reservation_status.eq.wydany,status_key.eq.wygrany,status.eq.wygrany")
      .is("deleted_at", null)
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    // Fallback: leady bez delivered_at wpadają w zakres wg updated_at, żeby nic nie ginęło w bilansie.
    if (data.from) leadsQ = leadsQ.or(`delivered_at.gte.${data.from}T00:00:00,and(delivered_at.is.null,updated_at.gte.${data.from}T00:00:00)`);
    if (data.to) leadsQ = leadsQ.or(`delivered_at.lte.${data.to}T23:59:59,and(delivered_at.is.null,updated_at.lte.${data.to}T23:59:59)`);
    const { data: leads, error: le } = await leadsQ;
    if (le) throw new Error(le.message);

    let expQ = context.supabase
      .from("expenses")
      .select("*")
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .limit(1000);
    if (data.from) expQ = expQ.gte("expense_date", data.from);
    if (data.to) expQ = expQ.lte("expense_date", data.to);
    const { data: expenses, error: ee } = await expQ;
    if (ee) throw new Error(ee.message);


    let income = 0, cash = 0, transfer = 0, pending = 0;
    let salesVat = 0, transportVat = 0, transportCosts = 0, transportCostsNet = 0;
    let tonsTotal = 0, tonsPaleta = 0, tonsBigbag = 0, tonsInne = 0;
    let incomePaleta = 0, incomeBigbag = 0, incomeInne = 0;
    for (const l of leads ?? []) {
      const amt = Number(l.payment_amount_gross ?? 0);
      income += amt;
      const sVat = Number((l as any).sales_vat_rate ?? 8);
      salesVat += amt - amt / (1 + sVat / 100);
      const tCost = Number((l as any).transport_cost_gross ?? 0);
      const tVat = Number((l as any).transport_vat_rate ?? 23);
      transportCosts += tCost;
      transportCostsNet += tCost / (1 + tVat / 100);
      transportVat += tCost - tCost / (1 + tVat / 100);
      if (l.payment_status === "oplacone_gotowka") cash += amt;
      else if (l.payment_status === "oplacone_przelew") transfer += amt;
      else pending += amt;
      const qty = Number((l as any).quantity ?? 0);
      if (qty > 0) {
        tonsTotal += qty;
        if ((l as any).product === "pellet_paleta") { tonsPaleta += qty; incomePaleta += amt; }
        else if ((l as any).product === "pellet_bigbag") { tonsBigbag += qty; incomeBigbag += amt; }
        else { tonsInne += qty; incomeInne += amt; }
      }
    }
    // Zakupy środków trwałych (inwestycje: ciężarówka, owijarka itp.) NIE są kosztem operacyjnym —
    // ich wartość ujmujemy w majątku (środki trwałe), nie w kosztach/zysku okresu.
    const isCapex = (e: any) => e.category === "zakup_srodka_trwalego";
    const manualCosts = (expenses ?? []).filter((e: any) => !isCapex(e)).reduce((s, e: any) => s + Number(e.amount ?? 0), 0);
    const capexCosts = (expenses ?? []).filter(isCapex).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
    // Koszty dodatkowe netto — każdy koszt przeliczany indywidualnie wg własnej stawki VAT (0 / 8 / 23%).
    const manualCostsNet = (expenses ?? [])
      .filter((e: any) => !isCapex(e))
      .reduce((s: number, e: any) => s + Number(e.amount ?? 0) / (1 + Number(e.vat_rate ?? 23) / 100), 0);

    // ── KOSZT SPRZEDANEGO TOWARU (COGS) ──
    // Priorytet: rzeczywisty koszt zakupu z partii FIFO zdjętych pod dany lead.
    // Fallback (leady bez rozchodu z partii): tonaż × stawka jednostkowa z Ustawień.
    const { data: costSetting } = await context.supabase
      .from("system_settings")
      .select("value")
      .eq("key", "pellet_unit_cost_pln")
      .maybeSingle();
    const unitCost = Number((costSetting?.value as any)?.pln_per_ton ?? 0);
    const cogsVatRate = Number((costSetting?.value as any)?.vat_rate ?? 8);

    const leadIds = (leads ?? []).map((l: any) => l.id);
    const fifoByLead = new Map<string, { cost: number; tons: number }>();
    if (leadIds.length) {
      const { data: cons } = await context.supabase
        .from("stock_lot_consumptions")
        .select("lead_id, quantity, cost")
        .in("lead_id", leadIds);
      for (const c of cons ?? []) {
        const key = (c as any).lead_id as string;
        const prev = fifoByLead.get(key) ?? { cost: 0, tons: 0 };
        prev.cost += Number((c as any).cost ?? 0);
        prev.tons += Number((c as any).quantity ?? 0);
        fifoByLead.set(key, prev);
      }
    }

    let cogsFifo = 0, cogsFifoTons = 0, cogsFallback = 0, cogsFallbackTons = 0;
    for (const l of leads ?? []) {
      const qty = Number((l as any).quantity ?? 0);
      const f = fifoByLead.get((l as any).id);
      if (f && f.tons > 0) {
        cogsFifo += f.cost;
        cogsFifoTons += f.tons;
      } else if (qty > 0) {
        cogsFallback += qty * unitCost;
        cogsFallbackTons += qty;
      }
    }
    const cogsTons = cogsFifoTons + cogsFallbackTons;
    const cogs = cogsFifo + cogsFallback;
    const cogsNet = cogs / (1 + cogsVatRate / 100);


    const totalCosts = manualCosts + cogs + transportCosts;
    const avgPricePerTon = tonsTotal > 0 ? income / tonsTotal : 0;
    const avgPricePaleta = tonsPaleta > 0 ? incomePaleta / tonsPaleta : 0;
    const avgPriceBigbag = tonsBigbag > 0 ? incomeBigbag / tonsBigbag : 0;
    const avgPriceInne = tonsInne > 0 ? incomeInne / tonsInne : 0;

    // Zysk = Przychód ze zrealizowanych dostaw − (COGS + koszty dodatkowe)
    const grossProfit = income - totalCosts;
    // VAT należny = VAT z towaru (8/23%) + VAT z transportu (23/8%)
    const vatTotal = salesVat + transportVat;
    const incomeNet = income - vatTotal;
    const totalCostsNet = cogsNet + manualCostsNet + transportCostsNet;
    const netProfit = incomeNet - transportCostsNet - cogsNet - manualCostsNet;

    return {
      income, cash, transfer, pending,
      totalCosts,
      manualCosts,
      manualCostsNet,
      capexCosts,
      cogs,
      cogsNet,
      cogsVatRate,
      cogsTons,
      cogsUnitCost: unitCost,
      cogsFifo, cogsFifoTons, cogsFallback, cogsFallbackTons,

      vatTotal, salesVat, transportVat,
      transportCosts, transportCostsNet,
      balance: income - totalCosts,
      grossProfit,
      netProfit,
      incomeNet,
      totalCostsNet,
      tonsTotal, tonsPaleta, tonsBigbag, tonsInne,
      incomePaleta, incomeBigbag, incomeInne,
      avgPricePerTon, avgPricePaleta, avgPriceBigbag, avgPriceInne,
      leads: leads ?? [],
      expenses: expenses ?? [],
    };
  });

// ─────────────────────────────────────────────────────────────
// Audit log — dziennik zdarzeń finansowych
// ─────────────────────────────────────────────────────────────
export const listPaymentAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("audit_log")
      .select("*")
      .in("entity_type", ["payment", "expense"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // 1) Zbierz identyfikatory leadów z realnych wpisów w audycie (dla wzbogacenia)
    const paymentRows = (rows ?? []).filter((r: any) => r.entity_type === "payment" && r.entity_id);
    const paymentLeadIds = new Set(paymentRows.map((r: any) => r.entity_id as string));

    // 2) Pobierz zrealizowane leady w zakresie dat, dla których BRAK wpisu w audycie
    //    → syntetyczne wiersze „Rozliczenie (auto)”, żeby dziennik nie gubił historii.
    let backfillQ = context.supabase
      .from("leads")
      .select("id, lead_number, name, first_name, last_name, invoice_company, payment_amount_gross, payment_method, payment_status, delivered_at, updated_at")
      .or("reservation_status.eq.wydany,status_key.eq.wygrany,status.eq.wygrany")
      .is("deleted_at", null)
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (data.from) backfillQ = backfillQ.gte("delivered_at", `${data.from}T00:00:00`);
    if (data.to) backfillQ = backfillQ.lte("delivered_at", `${data.to}T23:59:59`);
    const { data: realized } = await backfillQ;

    const missing = (realized ?? []).filter((l: any) => !paymentLeadIds.has(l.id));

    // 3) Wzbogać wszystkie identyfikatory leadów (audyt + brakujące) o dane karty
    const allLeadIds = new Set<string>([...paymentLeadIds]);
    for (const l of realized ?? []) allLeadIds.add(l.id);

    let leadMap: Record<string, any> = {};
    if (allLeadIds.size) {
      const { data: leads } = await context.supabase
        .from("leads")
        .select("id, lead_number, name, first_name, last_name, invoice_company")
        .in("id", Array.from(allLeadIds));
      leadMap = Object.fromEntries((leads ?? []).map((l: any) => [l.id, l]));
    }

    // 4) Wzbogać wpisy kosztów o info o miękkim usunięciu
    const expenseIds = Array.from(new Set((rows ?? []).filter((r: any) => r.entity_type === "expense" && r.entity_id).map((r: any) => r.entity_id as string)));
    let expenseMap: Record<string, any> = {};
    if (expenseIds.length) {
      const { data: exps } = await context.supabase
        .from("expenses")
        .select("id, deleted_at, deleted_reason")
        .in("id", expenseIds);
      expenseMap = Object.fromEntries((exps ?? []).map((e: any) => [e.id, e]));
    }

    const real = (rows ?? []).map((r: any) => ({
      ...r,
      lead: r.entity_type === "payment" ? leadMap[r.entity_id] ?? null : null,
      expense_deleted: r.entity_type === "expense" && expenseMap[r.entity_id]?.deleted_at ? true : false,
    }));

    const synthetic = missing.map((l: any) => ({
      id: `synthetic-${l.id}`,
      created_at: l.delivered_at ?? l.updated_at,
      action: "settlement",
      entity_type: "payment",
      entity_id: l.id,
      actor_id: null,
      details: {
        amount: l.payment_amount_gross,
        method: l.payment_method,
        payment_status: l.payment_status,
        synthetic: true,
      },
      lead: leadMap[l.id] ?? null,
      expense_deleted: false,
    }));

    return [...real, ...synthetic].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  });

// ─────────────────────────────────────────────────────────────
// Wartość magazynu — sztywna wycena FIFO:
// SUMA(pozostały tonaż partii × cena zakupu partii)
// ─────────────────────────────────────────────────────────────
export const getWarehouseValue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: bal, error: be } = await context.supabase
      .from("stock_balance")
      .select("product, physical, reserved");
    if (be) throw new Error(be.message);

    const { data: setting } = await context.supabase
      .from("system_settings")
      .select("value")
      .eq("key", "pellet_unit_cost_pln")
      .maybeSingle();
    const unitCost = Number((setting?.value as any)?.pln_per_ton ?? 0);

    const { data: lots } = await context.supabase
      .from("stock_lots")
      .select("product, remaining_quantity, unit_price")
      .gt("remaining_quantity", 0);

    const lotByProduct = new Map<string, { tons: number; value: number }>();
    for (const l of lots ?? []) {
      const p = (l as any).product as string;
      const prev = lotByProduct.get(p) ?? { tons: 0, value: 0 };
      const q = Number((l as any).remaining_quantity ?? 0);
      prev.tons += q;
      prev.value += q * Number((l as any).unit_price ?? 0);
      lotByProduct.set(p, prev);
    }

    const perProduct = (bal ?? []).map((r: any) => {
      const physical = Number(r.physical ?? 0);
      const reserved = Number(r.reserved ?? 0);
      const available = physical - reserved;
      const lot = lotByProduct.get(r.product as string);
      // Towar bez partii FIFO (historyczny) wyceniany stawką z Ustawień.
      const uncoveredTons = Math.max(0, physical - (lot?.tons ?? 0));
      const value = (lot?.value ?? 0) + uncoveredTons * unitCost;
      return { product: r.product as string, physical, reserved, available, lotTons: lot?.tons ?? 0, value };
    });
    const totalTons = perProduct.reduce((s, r) => s + r.available, 0);
    const fifoValue = perProduct.reduce((s, r) => s + r.value, 0);
    const lotTons = perProduct.reduce((s, r) => s + r.lotTons, 0);
    return { unitCost, totalTons, lotTons, totalValue: fifoValue, fifoValue, perProduct };
  });



