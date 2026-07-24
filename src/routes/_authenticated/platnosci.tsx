import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet, Truck, MailIcon, MessageSquare, CheckCircle2, FileText, Plus, Trash2, Receipt, History, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import {
  listUpcomingPayments,
  listCompletedPayments,
  listDeliveredLeadsWithoutTransport,
  updateLeadPayment,
  settleTransportWithDriver,
  markPaymentReminderSent,
  listExpenses,
  addExpense,
  deleteExpense,
  getFinancialSummary,
  listPaymentAuditLog,
} from "@/lib/payments.functions";
import { backfillMissingPayments } from "@/lib/leads.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { SettlePaymentButton } from "@/components/settle-payment-button";
import { getWzDocument } from "@/lib/wz.functions";

export const Route = createFileRoute("/_authenticated/platnosci")({
  head: () => ({
    meta: [
      { title: "Płatności i rozliczenia — Słoneczny Pellet OS" },
      { name: "description", content: "Rozliczenia transportów, statusy płatności, koszty, bilans i dziennik operacji finansowych." },
    ],
  }),
  component: PaymentsPage,
});

// ─── Statusy płatności ────────────────────────────────────────
const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  nieoplacone:       { label: "Nieopłacone",              className: "bg-destructive/15 text-destructive border-destructive/30" },
  czeka_przelew:     { label: "Czeka na przelew",         className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  zaliczka:          { label: "Zaliczka opłacona",        className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  oplacone_gotowka:  { label: "Opłacone — gotówka",       className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  oplacone_przelew:  { label: "Opłacone — przelew",       className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  gotowka: "Gotówka u kierowcy",
  karta_blik: "Karta / BLIK u kierowcy",
  przelew: "Przelew bankowy",
  przedplata: "Przedpłata (przelew)",
  termin_7: "Przelew — 7 dni",
  termin_14: "Przelew — 14 dni",
};

const EXPENSE_CATEGORIES = [
  { value: "paliwo", label: "Paliwo" },
  { value: "wynagrodzenia", label: "Wynagrodzenia / kierowca" },
  { value: "eksploatacja", label: "Eksploatacja pojazdu" },
  { value: "biuro", label: "Biuro / administracja" },
  { value: "marketing", label: "Marketing" },
  { value: "podatki", label: "Podatki / opłaty" },
  { value: "inne", label: "Inne" },
];

function PaymentStatusBadge({ status }: { status?: string | null }) {
  const s = status && PAYMENT_STATUS[status];
  if (!s) return <Badge variant="outline" className="text-muted-foreground">— nie ustalono —</Badge>;
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

function leadDisplayName(l: any) {
  return l?.invoice_company || [l?.first_name, l?.last_name].filter(Boolean).join(" ").trim() || l?.name || "—";
}

function extractLeads(rows: any[]): { transport: any; leads: any[] }[] {
  return (rows ?? []).map((t) => ({
    transport: t,
    leads: (t.transport_items ?? []).map((i: any) => i.leads).filter(Boolean),
  }));
}

function LeadLink({ leadId, children }: { leadId?: string | null; children: React.ReactNode }) {
  if (!leadId) return <>{children}</>;
  return (
    <Link
      to="/crm"
      search={{ leadId } as any}
      className="inline-flex items-center gap-1 hover:text-primary underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3 opacity-60" />
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────
function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthAgoIso() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }

function PaymentsPage() {
  const [from, setFrom] = useState(monthAgoIso());
  const [to, setTo] = useState(todayIso());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Płatności i rozliczenia"
        description="Bilans przychodów i kosztów, statusy płatności, gotówka u kierowcy oraz dziennik operacji."
      />

      <BalanceHeader from={from} to={to} setFrom={setFrom} setTo={setTo} />

      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">Nadchodzące transporty</TabsTrigger>
          <TabsTrigger value="completed">Wykonane i rozliczenia</TabsTrigger>
          <TabsTrigger value="expenses">Koszty</TabsTrigger>
          <TabsTrigger value="audit">Dziennik operacji</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming"><UpcomingTab /></TabsContent>
        <TabsContent value="completed"><CompletedTab /></TabsContent>
        <TabsContent value="expenses"><ExpensesTab from={from} to={to} /></TabsContent>
        <TabsContent value="audit"><AuditTab from={from} to={to} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Bilans (przychód − koszty) ──────────────────────────────
function BalanceHeader({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const backfillFn = useServerFn(backfillMissingPayments);
  const q = useQuery({
    queryKey: ["financial-summary", from, to],
    queryFn: () => getFinancialSummary({ data: { from, to } }),
  });
  const s = q.data;

  const backfillM = useMutation({
    mutationFn: async () => backfillFn(),
    onSuccess: (r: any) => {
      toast.success(`Zsynchronizowano płatności (uzupełniono: ${r.backfilled ?? 0})`);
      qc.invalidateQueries({ queryKey: ["financial-summary"] });
      qc.invalidateQueries({ queryKey: ["payments-orphans"] });
      qc.invalidateQueries({ queryKey: ["payments-completed"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["delivery-history"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Bilans finansowy</CardTitle>
            <CardDescription>Wybierz zakres dat aby przeliczyć przychody, koszty i saldo.</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Od</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Do</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setFrom(d.toISOString().slice(0,10)); setTo(d.toISOString().slice(0,10)); }}>Dziś</Button>
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate()-7); setFrom(d.toISOString().slice(0,10)); setTo(todayIso()); }}>7 dni</Button>
              <Button variant="outline" size="sm" onClick={() => { setFrom(monthAgoIso()); setTo(todayIso()); }}>30 dni</Button>
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setFrom(`${d.getFullYear()}-01-01`); setTo(todayIso()); }}>Ten rok</Button>
            </div>
            {isAdmin && (
              <Button size="sm" variant="secondary" onClick={() => backfillM.mutate()} disabled={backfillM.isPending}>
                {backfillM.isPending ? "Synchronizacja…" : "Uzupełnij zaległe płatności"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard title="Przychód (wydane)" value={fmtPLN(s?.income ?? 0)} tone="emerald" />
          <StatCard title="Koszty" value={fmtPLN(s?.totalCosts ?? 0)} tone="amber" />
          <StatCard title="Saldo" value={fmtPLN(s?.balance ?? 0)} tone={(s?.balance ?? 0) >= 0 ? "emerald" : "amber"} />
          <StatCard title="Gotówka/BLIK" value={fmtPLN(s?.cash ?? 0)} />
          <StatCard title="Oczekujące" value={fmtPLN(s?.pending ?? 0)} tone="amber" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Nadchodzące ─────────────────────────────────────────────
function UpcomingTab() {
  const q = useQuery({ queryKey: ["payments-upcoming"], queryFn: () => listUpcomingPayments() });
  const rows = extractLeads(q.data ?? []);

  const totals = useMemo(() => {
    let expected = 0, cash = 0, transfer = 0;
    for (const { leads } of rows) for (const l of leads) {
      const amt = Number(l.payment_amount_gross ?? 0);
      expected += amt;
      if (l.payment_method === "gotowka" || l.payment_method === "karta_blik") cash += amt;
      else if (l.payment_method) transfer += amt;
    }
    return { expected, cash, transfer };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard title="Spodziewane brutto" value={fmtPLN(totals.expected)} />
        <StatCard title="Do pobrania u kierowcy" value={fmtPLN(totals.cash)} tone="emerald" />
        <StatCard title="Do przelewu" value={fmtPLN(totals.transfer)} tone="amber" />
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Ładowanie…</div>}
      {rows.length === 0 && !q.isLoading && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Brak zaplanowanych transportów.</CardContent></Card>
      )}
      <div className="space-y-3">
        {rows.map(({ transport, leads }) => (
          <TransportPaymentCard key={transport.id} transport={transport} leads={leads} mode="upcoming" />
        ))}
      </div>
    </div>
  );
}

// ─── Wykonane ────────────────────────────────────────────────
function CompletedTab() {
  const q = useQuery({ queryKey: ["payments-completed"], queryFn: () => listCompletedPayments() });
  const orphans = useQuery({ queryKey: ["payments-orphans"], queryFn: () => listDeliveredLeadsWithoutTransport() });
  const rows = extractLeads(q.data ?? []);

  // odfiltruj z sierot te, które już siedzą w jakimś transporcie
  const transportLeadIds = new Set<string>(rows.flatMap((r) => r.leads.map((l: any) => l.id)));
  const standaloneLeads = (orphans.data ?? []).filter((l: any) => !transportLeadIds.has(l.id));

  return (
    <div className="space-y-3">
      {(q.isLoading || orphans.isLoading) && <div className="text-sm text-muted-foreground">Ładowanie…</div>}
      {rows.length === 0 && standaloneLeads.length === 0 && !q.isLoading && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Brak zrealizowanych dostaw.</CardContent></Card>
      )}
      {rows.map(({ transport, leads }) => (
        <TransportPaymentCard key={transport.id} transport={transport} leads={leads} mode="completed" />
      ))}
      {standaloneLeads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" />Wydania bez transportu</CardTitle>
            <CardDescription>Leady oznaczone jako „wydane" bez powiązania z konkretnym transportem — np. odbiór własny klienta.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {standaloneLeads.map((l: any) => <LeadPaymentRow key={l.id} lead={l} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── KOSZTY ──────────────────────────────────────────────────
function ExpensesTab({ from, to }: { from: string; to: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["expenses", from, to], queryFn: () => listExpenses({ data: { from, to } }) });
  const addFn = useServerFn(addExpense);
  const delFn = useServerFn(deleteExpense);

  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState("inne");
  const [notes, setNotes] = useState("");

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["financial-summary"] });
    qc.invalidateQueries({ queryKey: ["payment-audit"] });
  };

  const addM = useMutation({
    mutationFn: async () => addFn({ data: { description: desc.trim(), amount: Number(amount.replace(",", ".")), expense_date: date, category, notes: notes || null } }),
    onSuccess: () => {
      toast.success("Dodano koszt");
      setOpen(false); setDesc(""); setAmount(""); setNotes(""); setCategory("inne"); setDate(todayIso());
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Usunięto"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const total = (q.data ?? []).reduce((s, e: any) => s + Number(e.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" />Koszty w zakresie</CardTitle>
              <CardDescription>Zakres pobierany z filtra na górze strony — suma odejmowana od przychodu w bilansie.</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Razem</div>
                <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">{fmtPLN(total)}</div>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Dodaj koszt</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Nowy koszt</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Opis *</Label>
                      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="np. Tankowanie MAN WB123AB" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Kwota (PLN) *</Label>
                        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                      </div>
                      <div className="space-y-1">
                        <Label>Data</Label>
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Kategoria</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Notatka</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Anuluj</Button>
                    <Button onClick={() => addM.mutate()} disabled={addM.isPending || !desc.trim() || !amount.trim()}>Dodaj</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {q.isLoading && <div className="text-sm text-muted-foreground">Ładowanie…</div>}
          {(q.data ?? []).length === 0 && !q.isLoading && (
            <div className="text-sm text-muted-foreground py-6 text-center">Brak kosztów w wybranym zakresie.</div>
          )}
          <div className="divide-y divide-border/40">
            {(q.data ?? []).map((e: any) => {
              const cat = EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category;
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.description}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                      <span>{format(new Date(e.expense_date), "yyyy-MM-dd")}</span>
                      <span>· <Badge variant="outline" className="ml-0">{cat}</Badge></span>
                      {e.notes && <span className="truncate">· {e.notes}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">−{fmtPLN(Number(e.amount))}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Usunąć koszt?")) delM.mutate(e.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AUDIT LOG ───────────────────────────────────────────────
function AuditTab({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ["payment-audit", from, to], queryFn: () => listPaymentAuditLog({ data: { from, to } }) });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-primary" />Dziennik operacji finansowych</CardTitle>
        <CardDescription>Zdarzenia rozliczeń, zmian statusu i kosztów w wybranym zakresie dat.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {q.isLoading && <div className="text-sm text-muted-foreground">Ładowanie…</div>}
        {(q.data ?? []).length === 0 && !q.isLoading && (
          <div className="text-sm text-muted-foreground py-6 text-center">Brak zdarzeń.</div>
        )}
        <div className="divide-y divide-border/40">
          {(q.data ?? []).map((r: any) => {
            const details = (r.details ?? {}) as Record<string, any>;
            const amt = details.amount ? fmtPLN(Number(details.amount)) : null;
            return (
              <div key={r.id} className="py-2 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">{format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}</span>
                  <ActionBadge action={r.action} />
                  {r.lead && (
                    <LeadLink leadId={r.lead.id}>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{r.lead.lead_number ?? "—"}</span>
                      <span className="font-medium">{leadDisplayName(r.lead)}</span>
                    </LeadLink>
                  )}
                  {amt && <span className="font-semibold">{amt}</span>}
                  {details.method && <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[details.method] ?? details.method}</span>}
                  {details.description && <span className="text-muted-foreground truncate">— {details.description}</span>}
                  {details.category && <Badge variant="outline">{details.category}</Badge>}
                  {details.payment_status && <PaymentStatusBadge status={details.payment_status} />}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; className: string }> = {
    settlement:      { label: "Rozliczenie",        className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    payment_update:  { label: "Edycja płatności",   className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
    expense_added:   { label: "+ Koszt",            className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
    expense_deleted: { label: "− Koszt (usunięty)", className: "bg-muted text-muted-foreground" },
  };
  const s = map[action] ?? { label: action, className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

// ─── Karta transportu z leadami ──────────────────────────────
function TransportPaymentCard({ transport, leads, mode }: { transport: any; leads: any[]; mode: "upcoming" | "completed" }) {
  const qc = useQueryClient();
  const settleFn = useServerFn(settleTransportWithDriver);

  const totals = useMemo(() => {
    let gross = 0, cash = 0, transfer = 0, pending = 0;
    for (const l of leads) {
      const amt = Number(l.payment_amount_gross ?? 0);
      gross += amt;
      if (l.payment_status === "oplacone_gotowka") cash += amt;
      else if (l.payment_status === "oplacone_przelew") transfer += amt;
      else pending += amt;
    }
    return { gross, cash, transfer, pending };
  }, [leads]);

  const anySettled = leads.some((l) => l.driver_settled_at);
  const anyCash = leads.some((l) => l.payment_status === "oplacone_gotowka" && !l.driver_settled_at);

  const settleM = useMutation({
    mutationFn: async () => settleFn({ data: { transportId: transport.id } }),
    onSuccess: (r: any) => {
      toast.success(`Rozliczono z kierowcą (${r.settled} pozycji)`);
      qc.invalidateQueries({ queryKey: ["payments-upcoming"] });
      qc.invalidateQueries({ queryKey: ["payments-completed"] });
      qc.invalidateQueries({ queryKey: ["financial-summary"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const wzFn = useServerFn(getWzDocument);
  const openWz = async () => {
    try {
      const res: any = await wzFn({ data: { transportId: transport.id } });
      const html = res?.file?.content ?? res?.file?.html ?? "";
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } catch (e: any) { toast.error(e.message ?? "Błąd WZ"); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              {format(new Date(transport.scheduled_date), "yyyy-MM-dd")} · {transport.city ?? "—"}
              {transport.destination_address ? <span className="text-muted-foreground text-sm font-normal">· {transport.destination_address}</span> : null}
            </CardTitle>
            <CardDescription>
              Kierowca: {transport.driver ?? "—"} · Pojazd: {transport.vehicle ?? "—"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openWz}><FileText className="h-4 w-4 mr-1" />Podgląd WZ</Button>
            {mode === "completed" && anyCash && (
              <Button size="sm" onClick={() => settleM.mutate()} disabled={settleM.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Rozlicz trasę z kierowcą
              </Button>
            )}
            {anySettled && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Rozliczono z kierowcą</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 text-sm">
          <MiniStat label="Wartość brutto" value={fmtPLN(totals.gross)} />
          <MiniStat label="Gotówka/BLIK" value={fmtPLN(totals.cash)} tone="emerald" />
          <MiniStat label="Przelewy zaksięg." value={fmtPLN(totals.transfer)} tone="emerald" />
          <MiniStat label="Oczekujące" value={fmtPLN(totals.pending)} tone="amber" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {leads.map((l) => <LeadPaymentRow key={l.id} lead={l} />)}
        {leads.length === 0 && <div className="text-sm text-muted-foreground">Brak leadów przypisanych do tego transportu.</div>}
      </CardContent>
    </Card>
  );
}

// ─── Wiersz leada ────────────────────────────────────────────
function LeadPaymentRow({ lead }: { lead: any }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const updateFn = useServerFn(updateLeadPayment);
  const reminderFn = useServerFn(markPaymentReminderSent);

  const [status, setStatus] = useState<string>(lead.payment_status ?? "nieoplacone");
  const [invoice, setInvoice] = useState<string>(lead.invoice_number ?? "");
  const [receipt, setReceipt] = useState<string>(lead.receipt_number ?? "");
  const [amount, setAmount] = useState<string>(lead.payment_amount_gross != null ? String(lead.payment_amount_gross) : "");

  const saveM = useMutation({
    mutationFn: async () => updateFn({
      data: {
        leadId: lead.id,
        payment_status: status as any,
        invoice_number: invoice || null,
        receipt_number: receipt || null,
        payment_amount_gross: amount === "" ? null : Number(amount),
      },
    }),
    onSuccess: () => {
      toast.success("Zapisano");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["payments-upcoming"] });
      qc.invalidateQueries({ queryKey: ["payments-completed"] });
      qc.invalidateQueries({ queryKey: ["payments-orphans"] });
      qc.invalidateQueries({ queryKey: ["financial-summary"] });
      qc.invalidateQueries({ queryKey: ["payment-audit"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const needsReminder = ["nieoplacone", "czeka_przelew"].includes(lead.payment_status ?? "");

  const sendReminder = async (channel: "email" | "sms") => {
    const orderNo = lead.lead_number ?? `#${String(lead.id).slice(0, 8)}`;
    const amt = lead.payment_amount_gross ? ` na kwotę ${fmtPLN(lead.payment_amount_gross)}` : "";
    const body = `Dzień dobry, przypominamy o płatności za zamówienie ${orderNo}${amt}. Dane do przelewu: Słoneczny Pellet, konto: 00 0000 0000 0000 0000 0000 0000. Tytuł: ${orderNo}. Pozdrawiamy.`;
    if (channel === "email" && lead.email) {
      window.open(`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(`Przypomnienie o płatności — ${orderNo}`)}&body=${encodeURIComponent(body)}`);
    } else if (channel === "sms" && lead.phone) {
      window.open(`sms:${lead.phone}?body=${encodeURIComponent(body)}`);
    } else {
      toast.error(channel === "email" ? "Brak adresu e-mail" : "Brak numeru telefonu");
      return;
    }
    try {
      await reminderFn({ data: { leadId: lead.id, channel } });
      qc.invalidateQueries({ queryKey: ["payments-upcoming"] });
      qc.invalidateQueries({ queryKey: ["payments-completed"] });
      toast.success("Oznaczono jako wysłane");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-border/40 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <LeadLink leadId={lead.id}>
            {lead.lead_number && <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{lead.lead_number}</span>}
            <span>{leadDisplayName(lead)}</span>
          </LeadLink>
          {lead.urgent_no_fuel && <Badge className="bg-destructive text-destructive-foreground">🚨 PILNE</Badge>}
          <span className="text-xs text-muted-foreground">
            {lead.quantity ? `${lead.quantity} t` : "—"} · {lead.city ?? "—"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{PAYMENT_METHOD_LABEL[lead.payment_method] ?? "brak formy płatności"}</span>
          {lead.invoice_number && <span>· FV: <strong>{lead.invoice_number}</strong></span>}
          {lead.receipt_number && <span>· Paragon: <strong>{lead.receipt_number}</strong></span>}
          {lead.driver_settled_at && <span>· ✅ rozliczono z kierowcą</span>}
          {lead.payment_reminded_at && <span>· ostatnie przypomnienie: {format(new Date(lead.payment_reminded_at), "yyyy-MM-dd HH:mm")}</span>}
        </div>
      </div>
      <div className="text-right shrink-0 w-28">
        <div className="text-sm font-semibold">{fmtPLN(Number(lead.payment_amount_gross ?? 0))}</div>
        <PaymentStatusBadge status={lead.payment_status} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {needsReminder && (
          <>
            <Button size="sm" variant="outline" onClick={() => sendReminder("email")} title="Wyślij e-mail"><MailIcon className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => sendReminder("sms")} title="Wyślij SMS"><MessageSquare className="h-4 w-4" /></Button>
          </>
        )}
        <Button size="sm" onClick={() => setEditOpen(true)}>Edytuj</Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edycja płatności — {leadDisplayName(lead)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Status płatności</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Kwota brutto (PLN)</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Nr faktury</Label>
                <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="FV/…" />
              </div>
              <div className="space-y-1">
                <Label>Nr paragonu</Label>
                <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="PAR/…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Anuluj</Button>
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers UI ──────────────────────────────────────────────
function StatCard({ title, value, tone }: { title: string; value: string; tone?: "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400"
            : tone === "amber"   ? "text-amber-600 dark:text-amber-400"
            : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{title}</CardDescription></CardHeader>
      <CardContent><div className={`text-2xl font-semibold ${cls}`}>{value}</div></CardContent>
    </Card>
  );
}
function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400"
            : tone === "amber"   ? "text-amber-600 dark:text-amber-400"
            : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
function fmtPLN(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(Number(n || 0));
}
