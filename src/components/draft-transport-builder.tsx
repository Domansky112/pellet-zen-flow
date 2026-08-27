import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { FileStack, Loader2, Plus, Route as RouteIcon, Trash2, Truck, X } from "lucide-react";
import {
  addLeadToDraft,
  confirmDraft,
  createDraft,
  deleteDraft,
  listDraftCandidates,
  listDrafts,
  recalcDraftRoute,
  removeLeadFromDraft,
  updateDraft,
} from "@/lib/drafts.functions";
import { VEHICLE_CLASSES } from "@/lib/vehicle-classes";

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Palety",
  pellet_bigbag: "Big Bag",
  inne: "Inne",
};

export function DraftTransportBuilder() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDrafts);
  const candidatesFn = useServerFn(listDraftCandidates);
  const createFn = useServerFn(createDraft);
  const updateFn = useServerFn(updateDraft);
  const deleteFn = useServerFn(deleteDraft);
  const addFn = useServerFn(addLeadToDraft);
  const removeFn = useServerFn(removeLeadFromDraft);
  const recalcFn = useServerFn(recalcDraftRoute);
  const confirmFn = useServerFn(confirmDraft);

  const drafts = useQuery({ queryKey: ["transport-drafts"], queryFn: () => listFn() });
  const candidates = useQuery({
    queryKey: ["draft-candidates"],
    queryFn: () => candidatesFn(),
  });

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [vehicleClass, setVehicleClass] = useState<"male" | "srednie" | "duzy">("duzy");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [deliveryWindow, setDeliveryWindow] = useState("");
  const [driver, setDriver] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transport-drafts"] });
    qc.invalidateQueries({ queryKey: ["transports"] });
    qc.invalidateQueries({ queryKey: ["draft-candidates"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
  };

  const create = useMutation({
    mutationFn: () => {
      const cls = VEHICLE_CLASSES.find((v) => v.key === vehicleClass)!;
      return createFn({
        data: {
          name: name.trim() || `Wersja robocza ${new Date().toLocaleDateString("pl-PL")}`,
          vehicle_class: vehicleClass,
          capacity_tons: cls.capacity,
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success("Utworzono wersję roboczą transportu");
      setNewOpen(false);
      setName("");
      setActiveId(r.id);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLead = useMutation({
    mutationFn: (v: { draft_id: string; lead_id: string; batch_id?: string | null }) =>
      addFn({ data: v }),
    onSuccess: (r: any) => {
      if (r?.routeError) toast.warning(`Lead dodany, ale trasa: ${r.routeError}`);
      else toast.success("Lead dodany — trasa przeliczona");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeLead = useMutation({
    mutationFn: (v: { draft_id: string; item_id: string }) => removeFn({ data: v }),
    onSuccess: () => {
      toast.success("Lead usunięty — trasa przeliczona");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeVehicle = useMutation({
    mutationFn: (v: { id: string; vehicle_class: "male" | "srednie" | "duzy" }) =>
      updateFn({
        data: {
          id: v.id,
          vehicle_class: v.vehicle_class,
          capacity_tons: VEHICLE_CLASSES.find((c) => c.key === v.vehicle_class)!.capacity,
        },
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const recalculate = useMutation({
    mutationFn: (id: string) => recalcFn({ data: { draft_id: id } }),
    onSuccess: () => {
      toast.success("Trasa przeliczona");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDraft = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Wersja robocza usunięta");
      setActiveId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirm = useMutation({
    mutationFn: (id: string) =>
      confirmFn({
        data: {
          draft_id: id,
          scheduled_date: date,
          delivery_window: deliveryWindow || null,
          driver: driver || null,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`Transport ${r.transport_no} utworzony w Kalendarzu (${r.total_tons} t)`);
      setConfirmFor(null);
      setDate("");
      setDeliveryWindow("");
      setDriver("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDrafts = (drafts.data ?? []).filter((d: any) => d.status === "draft");
  const active = useMemo(
    () => openDrafts.find((d: any) => d.id === activeId) ?? openDrafts[0] ?? null,
    [openDrafts, activeId],
  );

  const items = active ? [...(active.transport_draft_items ?? [])].sort((a: any, b: any) => a.stop_order - b.stop_order) : [];
  const loaded = items.reduce((s: number, i: any) => s + Number(i.tons ?? 0), 0);
  const capacity = Number(active?.capacity_tons ?? 0);
  const free = Math.max(0, capacity - loaded);
  const pct = capacity > 0 ? Math.min(100, (loaded / capacity) * 100) : 0;

  const usedBatchIds = new Set(items.filter((i: any) => i.batch_id).map((i: any) => i.batch_id));
  const usedLeadIds = new Set(items.filter((i: any) => !i.batch_id).map((i: any) => i.lead_id));

  // Poczekalnia: lead z partiami rozbija się na osobne pozycje (np. #1080/1, #1080/2).
  const available = (candidates.data ?? []).flatMap((l: any) => {
    const batches = ((l.lead_batches ?? []) as any[]).filter(
      (b) => !b.transport_id && b.status !== "zrealizowana" && b.status !== "anulowana",
    );
    if (batches.length > 0) {
      return batches
        .filter((b) => !usedBatchIds.has(b.id))
        .sort((a, b) => a.batch_no - b.batch_no)
        .map((b) => ({
          key: b.id,
          lead: l,
          batch_id: b.id as string,
          title: `${l.lead_number ? `${l.lead_number}/${b.batch_no} · ` : ""}${l.name}`,
          tons: Number(b.tons),
        }));
    }
    if (usedLeadIds.has(l.id)) return [];
    return [
      {
        key: l.id,
        lead: l,
        batch_id: null,
        title: `${l.lead_number ? `${l.lead_number} · ` : ""}${l.name}`,
        tons: Number(l.quantity ?? 0),
      },
    ];
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="h-5 w-5 text-primary" />
            Wersje robocze transportów
          </CardTitle>
          <CardDescription>
            Skomponuj ładunek, sprawdź wolne miejsce i optymalną trasę — zatwierdzenie dopiero
            rezerwuje termin w Kalendarzu.
          </CardDescription>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Utwórz wersję roboczą transportu
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {openDrafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak wersji roboczych. Kliknij „Utwórz wersję roboczą transportu”.
          </p>
        ) : (
          <>
            {openDrafts.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {openDrafts.map((d: any) => (
                  <Button
                    key={d.id}
                    size="sm"
                    variant={d.id === active?.id ? "default" : "outline"}
                    onClick={() => setActiveId(d.id)}
                  >
                    {d.name}
                  </Button>
                ))}
              </div>
            )}

            {active && (
              <>
                {/* Capacity indicator */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{active.name}</div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={active.vehicle_class}
                        onValueChange={(v) =>
                          changeVehicle.mutate({ id: active.id, vehicle_class: v as any })
                        }
                      >
                        <SelectTrigger className="w-[210px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VEHICLE_CLASSES.map((v) => (
                            <SelectItem key={v.key} value={v.key}>
                              {v.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Przelicz trasę"
                        onClick={() => recalculate.mutate(active.id)}
                        disabled={recalculate.isPending}
                      >
                        {recalculate.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RouteIcon className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (globalThis.confirm(`Usunąć wersję roboczą „${active.name}”?`))
                            removeDraft.mutate(active.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Progress value={pct} className="h-3" />
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">
                      Załadowano: {loaded.toLocaleString("pl-PL")} t / {capacity} t
                    </span>
                    <Badge variant={free > 0 ? "secondary" : "outline"}>
                      Wolne miejsce: {free.toLocaleString("pl-PL")} t
                    </Badge>
                    <Badge variant="outline">{items.length} przystanków</Badge>
                    {active.route_km ? (
                      <>
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                          {active.route_km} km
                        </Badge>
                        <Badge variant="outline">
                          {Math.floor((active.route_minutes ?? 0) / 60)}h{" "}
                          {(active.route_minutes ?? 0) % 60}m
                        </Badge>
                        <Badge variant="outline">
                          {Number(active.route_cost ?? 0).toLocaleString("pl-PL")} zł
                          {active.cost_per_km ? ` (${active.cost_per_km} zł/km)` : ""}
                        </Badge>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Trasa policzy się po dodaniu leadów z adresem.
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Loaded leads */}
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Ładunek (kolejność optymalna)
                    </Label>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Brak leadów — dodaj z listy obok.
                      </p>
                    ) : (
                      items.map((it: any, idx: number) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{idx + 1}</Badge>
                              <span className="font-medium truncate">
                                {it.leads?.lead_number ? `${it.leads.lead_number} · ` : ""}
                                {it.leads?.name}
                              </span>
                              <Badge variant="secondary">{Number(it.tons)} t</Badge>
                              {it.leads?.product && (
                                <Badge variant="outline">
                                  {PRODUCT_LABEL[it.leads.product] ?? it.leads.product}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              📍 {it.leads?.invoice_address ||
                                [it.leads?.postal_code, it.leads?.city].filter(Boolean).join(" ") ||
                                "brak adresu"}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeLead.mutate({ draft_id: active.id, item_id: it.id })
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Candidates */}
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Dostępne leady (poczekalnia)
                    </Label>
                    <div className="max-h-[320px] overflow-auto space-y-2 pr-1">
                      {available.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Brak dostępnych pozycji.</p>
                      ) : (
                        available.map((c: any) => {
                          const l = c.lead;
                          const tons = c.tons;
                          const fits = tons <= free + 0.001;
                          return (
                            <div
                              key={c.key}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate text-sm">
                                  {c.title}
                                  {c.batch_id && (
                                    <Badge variant="outline" className="ml-2">partia</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {tons} t · {PRODUCT_LABEL[l.product] ?? l.product ?? "—"} ·{" "}
                                  {l.city ?? "brak miasta"}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant={fits ? "outline" : "ghost"}
                                disabled={!fits || addLead.isPending}
                                title={fits ? "Dodaj do wersji roboczej" : "Nie mieści się"}
                                onClick={() =>
                                  addLead.mutate({
                                    draft_id: active.id,
                                    lead_id: l.id,
                                    batch_id: c.batch_id,
                                  })
                                }
                              >
                                {addLead.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full"
                  disabled={items.length === 0}
                  onClick={() => setConfirmFor(active.id)}
                >
                  <Truck className="mr-2 h-4 w-4" /> Zatwierdź i utwórz transport
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>

      {/* New draft dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowa wersja robocza transportu</DialogTitle>
            <DialogDescription>
              Wersja robocza nie blokuje terminu w Kalendarzu ani nie generuje dokumentów wydania.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="draft-name">Nazwa</Label>
              <Input
                id="draft-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Trasa zachód — tydzień 33"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Pojazd / ładowność</Label>
              <Select value={vehicleClass} onValueChange={(v) => setVehicleClass(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_CLASSES.map((v) => (
                    <SelectItem key={v.key} value={v.key}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Utwórz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={!!confirmFor} onOpenChange={(o) => !o && setConfirmFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zatwierdź i utwórz transport</DialogTitle>
            <DialogDescription>
              Transport trafi do Kalendarza, leady zostaną przypisane i zarezerwowane w magazynie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="draft-date">Data dostawy</Label>
              <Input
                id="draft-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-window">Okno dostawy (opcjonalnie)</Label>
              <Input
                id="draft-window"
                value={deliveryWindow}
                onChange={(e) => setDeliveryWindow(e.target.value)}
                placeholder="np. 8:00–12:00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-driver">Kierowca (opcjonalnie)</Label>
              <Input
                id="draft-driver"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!date || confirm.isPending}
              onClick={() => confirmFor && confirm.mutate(confirmFor)}
            >
              {confirm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zatwierdź transport
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
