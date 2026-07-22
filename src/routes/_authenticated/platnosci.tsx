import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet, Truck, MailIcon, MessageSquare, CheckCircle2, FileText, Printer } from "lucide-react";
import { format } from "date-fns";
import {
  listUpcomingPayments,
  listCompletedPayments,
  updateLeadPayment,
  settleTransportWithDriver,
  markPaymentReminderSent,
} from "@/lib/payments.functions";
import { getWzDocument } from "@/lib/wz.functions";

export const Route = createFileRoute("/_authenticated/platnosci")({
  head: () => ({
    meta: [
      { title: "Płatności i rozliczenia — Słoneczny Pellet OS" },
      { name: "description", content: "Rozliczenia transportów, statusy płatności, gotówka u kierowcy, faktury i przypomnienia." },
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
  przedplata: "Przedpłata (przelew)",
  termin_7: "Przelew — 7 dni",
  termin_14: "Przelew — 14 dni",
};

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

// ─── Page ────────────────────────────────────────────────────
function PaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Płatności i rozliczenia"
        description="Podgląd nadchodzących transportów, statusy płatności zrealizowanych dostaw oraz rozliczenia gotówki z kierowcą."
      />
      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">Nadchodzące transporty</TabsTrigger>
          <TabsTrigger value="completed">Wykonane i rozliczenia</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming"><UpcomingTab /></TabsContent>
        <TabsContent value="completed"><CompletedTab /></TabsContent>
      </Tabs>
    </div>
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
  const rows = extractLeads(q.data ?? []);

  return (
    <div className="space-y-3">
      {q.isLoading && <div className="text-sm text-muted-foreground">Ładowanie…</div>}
      {rows.length === 0 && !q.isLoading && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Brak zrealizowanych transportów.</CardContent></Card>
      )}
      {rows.map(({ transport, leads }) => (
        <TransportPaymentCard key={transport.id} transport={transport} leads={leads} mode="completed" />
      ))}
    </div>
  );
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
    },
    onError: (e: any) => toast.error(e.message),
  });

  const wzFn = useServerFn(generateWzForTransport);
  const openWz = async () => {
    try {
      const data: any = await wzFn({ data: { transportId: transport.id } });
      const html = data?.html ?? "";
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
          {lead.lead_number && <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{lead.lead_number}</span>}
          {lead.urgent_no_fuel && <Badge className="bg-destructive text-destructive-foreground">🚨 PILNE</Badge>}
          <span>{leadDisplayName(lead)}</span>
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
