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
import { Search, PackageOpen, Users, MapPin, Calendar, RefreshCw, Truck, ExternalLink, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { listDeliveryHistory, getDeliveryHistoryConsistency, syncDeliveryHistory } from "@/lib/leads.functions";
import { TransportDetailDialog } from "@/components/transport-detail-dialog";
import { SettlePaymentButton } from "@/components/settle-payment-button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";


export const Route = createFileRoute("/_authenticated/historia")({
  head: () => ({
    meta: [
      { title: "Historia transportów — Słoneczny Pellet OS" },
      { name: "description", content: "Zrealizowane dostawy pelletu: klient, adres, tonaż, wspólny transport." },
    ],
  }),
  component: HistoriaPage,
});

function HistoriaPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [poolingOnly, setPoolingOnly] = useState(false);
  const [openTransportId, setOpenTransportId] = useState<string | null>(null);
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  const filters = useMemo(
    () => ({ from: from || null, to: to || null, search: search || null, pooling_only: poolingOnly }),
    [from, to, search, poolingOnly],
  );

  const q = useQuery({
    queryKey: ["delivery-history", filters],
    queryFn: () => listDeliveryHistory({ data: filters }),
  });

  const consistencyFn = useServerFn(getDeliveryHistoryConsistency);
  const consistency = useQuery({
    queryKey: ["delivery-history-consistency"],
    queryFn: () => consistencyFn(),
  });

  const syncFn = useServerFn(syncDeliveryHistory);
  const syncM = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Zsynchronizowano historię dostaw (uzupełniono: ${r.fixed})`);
      qc.invalidateQueries({ queryKey: ["delivery-history"] });
      qc.invalidateQueries({ queryKey: ["delivery-history-consistency"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalTons = (q.data ?? []).reduce((s, r) => s + Number(r.quantity ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Historia transportów"
        description="Zrealizowane dostawy — po wydaniu towaru z magazynu lub oznaczeniu leada jako Zrealizowany."
        actions={
          <Button variant="outline" onClick={() => { q.refetch(); consistency.refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
          </Button>
        }
      />
      <div className="p-6 space-y-4">
        {/* Consistency counter (X vs Y) */}
        <Card
          className={
            consistency.data?.in_sync
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-amber-500/50 bg-amber-500/5"
          }
        >
          <CardContent className="p-4 flex flex-wrap items-center gap-4 justify-between">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {consistency.data?.in_sync ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              <span>
                Liczba zrealizowanych leadów:{" "}
                <b className="text-foreground">{consistency.data?.realized ?? "…"}</b>
              </span>
              <span>·</span>
              <span>
                Liczba wpisów w historii:{" "}
                <b className="text-foreground">{consistency.data?.history ?? "…"}</b>
              </span>
              {consistency.data && (
                consistency.data.in_sync ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">Spójność 100%</Badge>
                ) : (
                  <Badge variant="destructive">
                    Rozbieżność: brakuje {consistency.data.missing} wpis(ów)
                  </Badge>
                )
              )}
            </div>
            {consistency.data && !consistency.data.in_sync && isAdmin && (
              <Button size="sm" onClick={() => syncM.mutate()} disabled={syncM.isPending}>
                {syncM.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Synchronizuj Historię Dostaw
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>

          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="h-from">Od</Label>
              <Input id="h-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-to">Do</Label>
              <Input id="h-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="h-search">Klient / miasto / telefon</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="h-search"
                  className="pl-8"
                  placeholder="Szukaj…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input
                id="h-pool"
                type="checkbox"
                checked={poolingOnly}
                onChange={(e) => setPoolingOnly(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Label htmlFor="h-pool" className="cursor-pointer">Tylko wspólne</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>
            Znalezionych dostaw: <b className="text-foreground">{q.data?.length ?? 0}</b>
          </span>
          <span>·</span>
          <span>
            Łącznie: <b className="text-foreground">{totalTons.toFixed(2)} t</b>
          </span>
        </div>

        <div className="grid gap-3">
          {(q.data ?? []).map((l) => (
            <Card key={l.id} className="hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      <PackageOpen className="h-4 w-4 text-primary" />
                      <span className="truncate">
                        {[l.first_name, l.last_name].filter(Boolean).join(" ") || l.name}
                      </span>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        {l.quantity} t · {l.product ?? "—"}
                      </Badge>
                      {l.shared_transport && (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                          <Users className="h-3 w-3 mr-1" /> Wspólny transport
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {l.delivered_at && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(l.delivered_at), "d MMM yyyy, HH:mm", { locale: pl })}
                        </span>
                      )}
                      {(l.city || l.postal_code) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[l.postal_code, l.city].filter(Boolean).join(" ")}
                        </span>
                      )}
                      {l.phone && <span>· {l.phone}</span>}
                      {l.email && <span>· {l.email}</span>}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2 text-sm">
                {(l.invoice_address || l.city) && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adres dostawy</div>
                    <div>{l.invoice_address || [l.postal_code, l.city].filter(Boolean).join(" ")}</div>
                  </div>
                )}
                {l.transport_partners.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Połączone z</div>
                    <ul className="list-disc pl-5">
                      {l.transport_partners.map((p, i) => (
                        <li key={i}>
                          {p.name}
                          {p.quantity ? ` — ${p.quantity} t` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-1 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/crm" search={{ leadId: l.id }}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Przejdź do leada
                    </Link>
                  </Button>
                  {l.transport_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenTransportId(l.transport_id as string)}
                    >
                      <Truck className="mr-2 h-4 w-4" /> Zobacz transport
                    </Button>
                  )}
                  {!(l as any).payment_amount_gross && (
                    <SettlePaymentButton
                      leadId={l.id}
                      leadName={[l.first_name, l.last_name].filter(Boolean).join(" ") || l.name}
                      quantity={l.quantity ?? null}
                      postalCode={(l as any).postal_code ?? null}
                      city={(l as any).city ?? null}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {q.data && q.data.length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Brak zrealizowanych dostaw w wybranym zakresie.
            </div>
          )}
        </div>
      </div>

      <TransportDetailDialog
        transportId={openTransportId}
        open={!!openTransportId}
        onOpenChange={(o) => !o && setOpenTransportId(null)}
      />
    </>

  );
}
