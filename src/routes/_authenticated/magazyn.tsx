import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Lock, Unlock, RefreshCw } from "lucide-react";
import {
  listStockBalance,
  listStockEvents,
  addStockEvent,
  reserveForLead,
  releaseReservation,
  listOpenLeads,
} from "@/lib/stock.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

const balanceQuery = queryOptions({ queryKey: ["stock", "balance"], queryFn: () => listStockBalance() });
const eventsQuery = queryOptions({ queryKey: ["stock", "events"], queryFn: () => listStockEvents() });
const openLeadsQuery = queryOptions({ queryKey: ["leads", "open"], queryFn: () => listOpenLeads() });

export const Route = createFileRoute("/_authenticated/magazyn")({
  head: () => ({
    meta: [
      { title: "Magazyn — Słoneczny Pellet OS" },
      { name: "description", content: "Silnik magazynowy: zdarzenia → saldo, rezerwacje pod lead." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(balanceQuery),
      context.queryClient.ensureQueryData(eventsQuery),
      context.queryClient.ensureQueryData(openLeadsQuery),
    ]);
  },
  component: WarehousePage,
});

type Product = "pellet_paleta" | "pellet_bigbag" | "inne";
const PRODUCTS: { key: Product; label: string; unit: string }[] = [
  { key: "pellet_paleta", label: "Palety", unit: "t" },
  { key: "pellet_bigbag", label: "Big Bagi", unit: "t" },
  { key: "brykiet", label: "Brykiet", unit: "t" },
];

const txnLabel: Record<string, string> = {
  przyjecie: "Przyjęcie",
  wydanie: "Wydanie",
  rezerwacja: "Rezerwacja",
  zwolnienie_rez: "Zwolnienie rez.",
  korekta: "Korekta",
};

function WarehousePage() {
  const qc = useQueryClient();
  const { data: balance } = useSuspenseQuery(balanceQuery);
  const { data: events } = useSuspenseQuery(eventsQuery);
  const { data: openLeads } = useSuspenseQuery(openLeadsQuery);

  useEffect(() => {
    const channel = supabase
      .channel("stock-events-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_events" }, () => {
        qc.invalidateQueries({ queryKey: ["stock"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const byProduct = useMemo(() => {
    const m = new Map<string, { physical: number; reserved: number }>();
    for (const r of balance) m.set(r.product as string, { physical: Number(r.physical), reserved: Number(r.reserved) });
    return m;
  }, [balance]);

  return (
    <>
      <PageHeader
        title="Magazyn — silnik matematyczny"
        description="Zdarzenia trafiają do bazy, saldo (fizyczne / zarezerwowane / dostępne) liczy się samo w widoku."
        actions={
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["stock"] })}>
            <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        <Tabs defaultValue="pellet_paleta">
          <TabsList>
            {PRODUCTS.map((p) => (
              <TabsTrigger key={p.key} value={p.key}>{p.label}</TabsTrigger>
            ))}
          </TabsList>
          {PRODUCTS.map((p) => {
            const b = byProduct.get(p.key) ?? { physical: 0, reserved: 0 };
            return (
              <TabsContent key={p.key} value={p.key} className="mt-4">
                <StockPanel product={p} balance={b} openLeads={openLeads} />
              </TabsContent>
            );
          })}
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Historia zdarzeń</CardTitle>
            <CardDescription>Ostatnie 100 operacji — na żywo (realtime).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kiedy</TableHead>
                  <TableHead>Operacja</TableHead>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Ilość</TableHead>
                  <TableHead>Referencja / lead</TableHead>
                  <TableHead>Notatka</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Brak zdarzeń — dodaj pierwsze powyżej.</TableCell></TableRow>
                )}
                {events.map((e: any) => {
                  const positive = e.txn_type === "przyjecie" || e.txn_type === "zwolnienie_rez" || (e.txn_type === "korekta" && Number(e.quantity) > 0);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: pl })}
                      </TableCell>
                      <TableCell><Badge variant="outline">{txnLabel[e.txn_type] ?? e.txn_type}</Badge></TableCell>
                      <TableCell>{PRODUCTS.find((p) => p.key === e.product)?.label ?? e.product}</TableCell>
                      <TableCell className={`text-right font-medium ${positive ? "text-success" : "text-primary"}`}>
                        {positive ? "+" : "−"}{Number(e.quantity)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.leads?.name ? <span className="font-medium">{e.leads.name}</span> : e.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.note ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StockPanel({
  product,
  balance,
  openLeads,
}: {
  product: { key: Product; label: string; unit: string };
  balance: { physical: number; reserved: number };
  openLeads: Array<{ id: string; name: string; city: string | null; product: string | null; quantity: number | null }>;
}) {
  const physical = balance.physical;
  const reserved = balance.reserved;
  const available = physical - reserved;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{product.label} — bilans</CardTitle>
          <CardDescription>Dostępny = fizyczny − zarezerwowany. Wszystko liczone z tabeli zdarzeń.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StatRow label="Stan fizyczny" value={physical} total={Math.max(physical, 1)} tone="bg-primary" />
          <StatRow label="Zarezerwowane" value={reserved} total={Math.max(physical, 1)} tone="bg-warning" />
          <StatRow label="Dostępne do sprzedaży" value={available} total={Math.max(physical, 1)} tone="bg-success" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nowe zdarzenie</CardTitle>
          <CardDescription>Rezerwacja spina się z leadem.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <PhysicalDialog product={product} type="przyjecie" label="Przyjęcie" icon={<Plus className="mr-2 h-4 w-4" />} />
          <PhysicalDialog product={product} type="wydanie" label="Wydanie" icon={<Minus className="mr-2 h-4 w-4" />} variant="outline" />
          <ReserveDialog product={product} openLeads={openLeads.filter((l) => !l.product || l.product === product.key)} available={available} />
          <ReleaseDialog product={product} openLeads={openLeads.filter((l) => !l.product || l.product === product.key)} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = Math.min(100, Math.max(0, (value / total) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-display text-lg font-semibold">{value} t</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PhysicalDialog({
  product,
  type,
  label,
  icon,
  variant = "default",
}: {
  product: { key: Product; label: string };
  type: "przyjecie" | "wydanie";
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const submit = useServerFn(addStockEvent);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    if (!q || q <= 0) { toast.error("Podaj ilość > 0"); return; }
    setBusy(true);
    try {
      await submit({ data: { product: product.key, txn_type: type, quantity: q, reference: reference || null, note: note || null } });
      toast.success(`${label}: ${q} t (${product.label})`);
      setOpen(false); setQty(""); setReference(""); setNote("");
      qc.invalidateQueries({ queryKey: ["stock"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Błąd — brak uprawnień?");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} className="justify-start">{icon}{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} — {product.label}</DialogTitle>
          <DialogDescription>Wymaga roli warehouse lub admin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-1.5"><Label>Ilość (t)</Label><Input type="number" step="0.01" min="0" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></div>
          <div className="grid gap-1.5"><Label>Referencja (opcj.)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="np. WZ-123, dostawca X" /></div>
          <div className="grid gap-1.5"><Label>Notatka</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Zapisuję…" : "Zapisz zdarzenie"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReserveDialog({
  product, openLeads, available,
}: {
  product: { key: Product; label: string };
  openLeads: Array<{ id: string; name: string; city: string | null; quantity: number | null }>;
  available: number;
}) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const submit = useServerFn(reserveForLead);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId) { toast.error("Wybierz leada"); return; }
    const q = Number(qty);
    if (!q || q <= 0) { toast.error("Podaj ilość"); return; }
    setBusy(true);
    try {
      await submit({ data: { lead_id: leadId, product: product.key, quantity: q, note: note || null } });
      toast.success(`Zarezerwowano ${q} t pod leada`);
      setOpen(false); setLeadId(""); setQty(""); setNote("");
      qc.invalidateQueries({ queryKey: ["stock"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Błąd rezerwacji");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-start"><Lock className="mr-2 h-4 w-4" />Rezerwacja</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rezerwacja — {product.label}</DialogTitle>
          <DialogDescription>Dostępne do rezerwacji: <span className="font-semibold text-foreground">{available} t</span></DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Lead</Label>
            <Select value={leadId} onValueChange={(v) => { setLeadId(v); const l = openLeads.find((x) => x.id === v); if (l?.quantity && !qty) setQty(String(l.quantity)); }}>
              <SelectTrigger><SelectValue placeholder={openLeads.length ? "Wybierz leada…" : "Brak otwartych leadów"} /></SelectTrigger>
              <SelectContent>
                {openLeads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}{l.city ? ` · ${l.city}` : ""}{l.quantity ? ` · ${l.quantity} t` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Ilość (t)</Label><Input type="number" step="0.01" min="0" max={available} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Notatka</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="submit" disabled={busy || available <= 0}>{busy ? "Rezerwuję…" : "Zarezerwuj"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDialog({
  product, openLeads,
}: {
  product: { key: Product; label: string };
  openLeads: Array<{ id: string; name: string; city: string | null; quantity: number | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const submit = useServerFn(releaseReservation);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId) { toast.error("Wybierz leada"); return; }
    const q = Number(qty);
    if (!q || q <= 0) { toast.error("Podaj ilość"); return; }
    setBusy(true);
    try {
      await submit({ data: { lead_id: leadId, product: product.key, quantity: q, note: note || null } });
      toast.success(`Zwolniono ${q} t z rezerwacji`);
      setOpen(false); setLeadId(""); setQty(""); setNote("");
      qc.invalidateQueries({ queryKey: ["stock"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Błąd");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-start"><Unlock className="mr-2 h-4 w-4" />Zwolnij rez.</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Zwolnij rezerwację — {product.label}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Lead</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger><SelectValue placeholder="Wybierz leada…" /></SelectTrigger>
              <SelectContent>
                {openLeads.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}{l.city ? ` · ${l.city}` : ""}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Ilość (t) do zwolnienia</Label><Input type="number" step="0.01" min="0" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Notatka</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Zapisuję…" : "Zwolnij"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
