import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/lib/pooling.functions";
import { format } from "date-fns";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { PoolManifestDialog } from "@/components/pool-manifest-dialog";
import { CancelPoolDialog } from "@/components/cancel-pool-dialog";
import { pl } from "date-fns/locale";

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
  const listFn = useServerFn(listWaitlist);
  const findFn = useServerFn(findPoolSuggestions);
  const geocodeFn = useServerFn(geocodePendingLeads);
  const createFn = useServerFn(createPool);
  const poolsFn = useServerFn(listPools);
  

  const { data: waitlist } = useSuspenseQuery({ queryKey: ["waitlist"], queryFn: () => listFn() });
  const { data: pools } = useSuspenseQuery({ queryKey: ["pools"], queryFn: () => poolsFn() });

  const [params, setParams] = useState({ maxDetourKm: 75, capacityTons: 24, minFillTons: 20 });
  const [confirmPoolId, setConfirmPoolId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string } | null>(null);

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



  const needsGeocoding = waitlist.filter((l: any) => l.pooling_lat == null).length;
  const activePools = pools.filter((p: any) => p.status !== "anulowany");

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
                        <Button size="sm" variant="ghost" onClick={() => doCancel.mutate(p.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirmPoolId(p.id)}>
                        <Eye className="h-4 w-4 mr-1" /> Podgląd
                      </Button>
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
    </>
  );
}
