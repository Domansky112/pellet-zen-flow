import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Users, Truck, Sparkles, Loader2, Trash2, Eye } from "lucide-react";
import {
  listWaitlist,
  findPoolSuggestions,
  geocodePendingLeads,
  createPool,
  listPools,
  addLeadToPool,
} from "@/lib/pooling.functions";
import { format } from "date-fns";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { PoolManifestDialog } from "@/components/pool-manifest-dialog";
import { CancelPoolDialog } from "@/components/cancel-pool-dialog";
import { pl } from "date-fns/locale";

const PoolingMap = lazy(() => import("@/components/pooling-map"));

export const Route = createFileRoute("/_authenticated/konsolidacja")({
  head: () => ({
    meta: [
      { title: "Wspólny transport — Słoneczny Pellet OS" },
      { name: "description", content: "Konsolidacja leadów: algorytm dobiera transport łączony z podziałem kosztu." },
    ],
  }),
  component: Konsolidacja,
});

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Palety",
  pellet_bigbag: "Big Bag",
  
  inne: "Inne",
};

function Konsolidacja() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listWaitlist);
  const findFn = useServerFn(findPoolSuggestions);
  const geocodeFn = useServerFn(geocodePendingLeads);
  const createFn = useServerFn(createPool);
  const poolsFn = useServerFn(listPools);
  const addToPoolFn = useServerFn(addLeadToPool);

  const { data: waitlist } = useSuspenseQuery({ queryKey: ["waitlist"], queryFn: () => listFn() });
  const { data: pools } = useSuspenseQuery({ queryKey: ["pools"], queryFn: () => poolsFn() });

  const [params, setParams] = useState({ maxDetourKm: 75, capacityTons: 24, minFillTons: 20 });
  const [confirmPoolId, setConfirmPoolId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  const suggestions = useQuery({
    queryKey: ["pool-suggestions", params],
    queryFn: () => (findFn as any)({ data: params }),
  });

  const geocode = useMutation({
    mutationFn: () => geocodeFn(),
    onSuccess: (r: any) => {
      toast.success(`Geokodowanie: ${r.done} ok, ${r.failed} błędów`);
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      suggestions.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createDraft = useMutation({
    mutationFn: (s: any) =>
      createFn({
        data: {
          name: `Wspólny transport → ${s.route_to}`,
          route_to: s.route_to,
          capacity_tons: params.capacityTons,
          estimated_km: s.estimated_km,
          estimated_cost: s.estimated_cost,
          cost_per_ton: s.cost_per_ton,
          items: s.leads.map((l: any, i: number) => ({
            lead_id: l.id,
            tons: l.tons,
            detour_km: l.detour_km,
            share_cost: l.share_cost,
            stop_order: i,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Utworzono draft — potwierdź w panelu poniżej.");
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      qc.invalidateQueries({ queryKey: ["pools"] });
      suggestions.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: (leadId: string) =>
      (addToPoolFn as any)({ data: { pool_id: selectedDraftId!, lead_id: leadId } }),
    onSuccess: () => {
      toast.success("Dodano do transportu");
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      qc.invalidateQueries({ queryKey: ["pools"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsGeocoding = waitlist.filter((l: any) => l.pooling_lat == null).length;
  const activePools = pools.filter((p: any) => p.status !== "anulowany");
  const draftPools = activePools.filter((p: any) => p.status === "draft");

  const mapPoints = useMemo(() => {
    const pts: any[] = [];
    const assignedIds = new Set<string>();
    for (const p of activePools) {
      for (const it of p.transport_pool_items ?? []) {
        const l = it.leads;
        if (!l || l.pooling_lat == null || l.pooling_lng == null) continue;
        assignedIds.add(l.id);
        const isSelected = selectedDraftId && p.id === selectedDraftId;
        pts.push({
          id: l.id,
          name: l.name,
          city: l.city,
          postal_code: l.postal_code,
          product: l.product,
          quantity: it.tons,
          lat: l.pooling_lat,
          lng: l.pooling_lng,
          has_unloading_equipment: (l as any).has_unloading_equipment,
          kind: isSelected ? "assigned" : "pending",
        });
      }
    }
    for (const l of waitlist as any[]) {
      if (assignedIds.has(l.id)) continue;
      if (l.pooling_lat == null || l.pooling_lng == null) continue;
      pts.push({
        id: l.id,
        name: l.name,
        city: l.city,
        postal_code: l.postal_code,
        product: l.product,
        quantity: l.quantity,
        lat: l.pooling_lat,
        lng: l.pooling_lng,
        has_unloading_equipment: l.has_unloading_equipment,
        priority: l.priority,
        status: l.status,
        kind: "waitlist",
      });
    }
    return pts;
  }, [waitlist, activePools, selectedDraftId]);


  return (
    <>
      <PageHeader
        title="Wspólny transport"
        description="Algorytm dobiera klientów w promieniu tras i wypełnia auto do 24 t — koszt dostawy rozbijasz między nich."
        actions={
          <>
            <NewLeadDialog
              defaults={{ source: "telefon", pooling_enabled: true }}
              triggerLabel="Dodaj do poczekalni"
              variant="outline"
            />
            <Button onClick={() => geocode.mutate()} disabled={geocode.isPending} variant="outline">
              {geocode.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
              Geokoduj ({needsGeocoding})
            </Button>
            <Button onClick={() => suggestions.refetch()} disabled={suggestions.isFetching}>
              {suggestions.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Szukaj grup
            </Button>
          </>
        }
      />

      <div className="p-6 space-y-6">
        {/* Parametry */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parametry algorytmu</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Pojemność auta (t)</Label>
              <Input
                type="number"
                value={params.capacityTons}
                min={1}
                max={40}
                step={1}
                onChange={(e) => setParams((p) => ({ ...p, capacityTons: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Min. wypełnienie do sugestii (t)</Label>
              <Input
                type="number"
                value={params.minFillTons}
                min={1}
                max={40}
                step={1}
                onChange={(e) => setParams((p) => ({ ...p, minFillTons: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Max detour od anchora (km)</Label>
              <Input
                type="number"
                value={params.maxDetourKm}
                min={0}
                max={300}
                step={5}
                onChange={(e) => setParams((p) => ({ ...p, maxDetourKm: Number(e.target.value) }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Mapa */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" /> Mapa leadów i transportów
              </CardTitle>
              <CardDescription className="mt-1">
                Wybierz draft transportu, żeby klikać „Dopisz" bezpośrednio na pinesce.
              </CardDescription>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#2563eb]" /> wolny</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#f97316]" /> pilny / w kontakcie</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#16a34a]" /> w wybranym drafcie</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#eab308]" /> w innym drafcie</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#dc2626]" /> baza</span>
              </div>
            </div>
            <div className="w-64 shrink-0">
              <Label className="text-xs">Draft do dopisywania</Label>
              <Select
                value={selectedDraftId ?? "none"}
                onValueChange={(v) => setSelectedDraftId(v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— brak —</SelectItem>
                  {draftPools.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.total_tons}/{p.capacity_tons}t)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ClientOnly fallback={<div className="h-[520px] w-full rounded-md border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Ładowanie mapy…</div>}>
              <Suspense fallback={<div className="h-[520px] w-full rounded-md border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Ładowanie mapy…</div>}>
                <PoolingMap
                  points={mapPoints}
                  selectedPoolId={selectedDraftId}
                  onOpenLead={(id) => navigate({ to: "/crm", search: { lead: id } as any })}
                  onAssignToPool={(id) => assignMut.mutate(id)}
                />
              </Suspense>
            </ClientOnly>
          </CardContent>
        </Card>


        <div className="grid gap-4 lg:grid-cols-2">
          {/* Poczekalnia */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Poczekalnia ({waitlist.length})
              </CardTitle>
              <CardDescription>Leady z zaznaczoną zgodą na wspólny transport.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[520px] overflow-auto">
              {waitlist.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Brak leadów w poczekalni. Zaznaczaj „zgoda na wspólny transport" w formularzu WWW lub CRM.
                </p>
              )}
              {waitlist.map((l: any) => (
                <div key={l.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{l.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[l.postal_code, l.city].filter(Boolean).join(" ") || "—"} · {l.quantity ?? "?"} t · {PRODUCT_LABEL[l.product] ?? "—"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {l.pooling_lat == null ? (
                        <Badge variant="outline" className="text-warning border-warning/40">bez GPS</Badge>
                      ) : (
                        <Badge variant="secondary">{Math.round(l.pooling_km_from_base ?? 0)} km</Badge>
                      )}
                      {l.pooling_wait_until && (
                        <span className="text-[11px] text-muted-foreground">
                          do {format(new Date(l.pooling_wait_until), "d MMM", { locale: pl })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sugestie */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Sugestie algorytmu
              </CardTitle>
              <CardDescription>
                Grupy dopasowane po kierunku i tonażu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[520px] overflow-auto">
              {suggestions.isLoading && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Liczę…
                </p>
              )}
              {!suggestions.isLoading && (suggestions.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Brak grup spełniających kryteria. Zmniejsz min. wypełnienie lub zwiększ detour.
                </p>
              )}
              {(suggestions.data ?? []).map((s: any) => (
                <div key={s.key} className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        Trasa → {s.route_to}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.total_tons} t · {s.leads.length} klientów · ~{s.estimated_km} km
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-lg font-semibold">{s.estimated_cost} zł</div>
                      <div className="text-xs text-muted-foreground">{s.cost_per_ton} zł/t</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {s.leads.map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between text-xs">
                        <span className="truncate">
                          {l.name} · {l.city} · <b>{l.tons} t</b> · +{l.detour_km} km detour
                        </span>
                        <Badge variant="outline">{l.share_cost} zł</Badge>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => createDraft.mutate(s)}
                    disabled={createDraft.isPending}
                  >
                    Utwórz draft transportu
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Drafty i potwierdzone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Drafty i potwierdzone poole ({activePools.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activePools.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Brak draftów.</p>
            )}
            {activePools.map((p: any) => (
              <div
                key={p.id}
                className="rounded-lg border p-4 hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setConfirmPoolId(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setConfirmPoolId(p.id);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.total_tons} t / {p.capacity_tons} t · {p.estimated_km ?? "?"} km · {p.estimated_cost ?? "?"} zł
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Badge
                      variant={p.status === "potwierdzony" ? "default" : "secondary"}
                    >
                      {p.status}
                    </Badge>
                    {p.status === "draft" ? (
                      <>
                        <Button size="sm" onClick={() => setConfirmPoolId(p.id)}>
                          <Eye className="h-4 w-4 mr-1" /> Potwierdź transport
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Usuń transport"
                          onClick={() => setCancelTarget({ id: p.id, name: p.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setConfirmPoolId(p.id)}>
                          <Eye className="h-4 w-4 mr-1" /> Podgląd
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Usuń transport"
                          onClick={() => setCancelTarget({ id: p.id, name: p.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {(p.transport_pool_items ?? []).map((it: any) => (
                    <div key={it.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">
                        {it.leads?.name} · {it.leads?.city} · {it.tons} t · tel. {it.leads?.phone ?? "—"}
                      </span>
                      <Badge variant="outline">{it.share_cost ?? "—"} zł</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <PoolManifestDialog
        poolId={confirmPoolId}
        onClose={() => setConfirmPoolId(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["pools"] });
          qc.invalidateQueries({ queryKey: ["waitlist"] });
          qc.invalidateQueries({ queryKey: ["transports"] });
        }}
      />
      <CancelPoolDialog
        poolId={cancelTarget?.id ?? null}
        poolName={cancelTarget?.name}
        onClose={() => setCancelTarget(null)}
      />
    </>
  );
}
