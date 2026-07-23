import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Globe, Building2, Phone, Inbox as InboxIcon, RefreshCw, PackageCheck, PackageOpen, Trash2, StickyNote, X as XIcon } from "lucide-react";
import { listLeads, listReservedLeads, listCancelledLeads, assignToMe, confirmWydanie, cancelLead } from "@/lib/leads.functions";
import { listLeadStatuses, setLeadStatusKey, type LeadStatus } from "@/lib/lead-statuses.functions";
import { listLeadIdsWithNotes } from "@/lib/notes.functions";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { ImportLeadsDialog } from "@/components/import-leads-dialog";
import { LeadDetailDrawer } from "@/components/lead-detail-drawer";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

const leadsQuery = queryOptions({
  queryKey: ["leads"],
  queryFn: () => listLeads(),
});

const cancelledLeadsQuery = queryOptions({
  queryKey: ["leads-cancelled"],
  queryFn: () => listCancelledLeads(),
});

const statusesQuery = queryOptions({
  queryKey: ["lead-statuses"],
  queryFn: () => listLeadStatuses(),
});

const notesIndexQuery = queryOptions({
  queryKey: ["lead-notes-index"],
  queryFn: () => listLeadIdsWithNotes(),
});

const searchSchema = z.object({
  tab: z.enum(["all", "reserved", "www", "email", "b2b", "nowy", "realized", "cancelled"]).optional(),
  product: z.enum(["pellet_paleta", "pellet_bigbag", "inne"]).optional(),
  leadId: z.string().uuid().optional(),
  status_key: z.string().optional(),
  has_notes: z.enum(["yes", "no"]).optional(),
  sort: z.enum(["smart", "newest", "oldest", "recent_note"]).optional(),
  mine: z.enum(["yes"]).optional(),
});

// A lead is "closed" (realized or cancelled) when either the reservation is
// delivered ("wydany") or the status is wygrany/przegrany. Closed leads are
// excluded from the default "Wszystkie" working view.
function isClosedLead(l: { status?: string | null; status_key?: string | null; reservation_status?: string | null }) {
  const key = (l.status_key ?? l.status ?? "") as string;
  return key === "wygrany" || key === "przegrany" || l.reservation_status === "wydany";
}
function isRealizedLead(l: { status?: string | null; status_key?: string | null; reservation_status?: string | null }) {
  const key = (l.status_key ?? l.status ?? "") as string;
  return key === "wygrany" || l.reservation_status === "wydany";
}

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM Inbox — Słoneczny Pellet OS" },
      { name: "description", content: "Centralny inbox zgłoszeń z WWW, e-mail i B2B." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsQuery),
  component: CrmPage,
});

type Lead = Awaited<ReturnType<typeof listLeads>>[number] & { status_key?: string | null };
type ProductFilter = "all" | "pellet_paleta" | "pellet_bigbag" | "inne";

const channelIcon = { www: Globe, email: Mail, b2b: Building2, telefon: Phone, inne: InboxIcon } as const;
const channelLabel = { www: "WWW", email: "Email", b2b: "B2B", telefon: "Telefon", inne: "Inne" } as const;

function statusStyle(s?: LeadStatus): React.CSSProperties {
  if (!s) return {};
  return {
    backgroundColor: `${s.color}22`,
    color: s.color,
    borderColor: `${s.color}55`,
  };
}

function CrmPage() {
  const { data: leads } = useSuspenseQuery(leadsQuery);
  const statuses = useQuery(statusesQuery);
  const notesIndex = useQuery(notesIndexQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const tab = search.tab ?? "all";
  const productFilter: ProductFilter = search.product ?? "all";
  const sort = search.sort ?? "smart";
  const statusFilter = search.status_key ?? "all";
  const hasNotesFilter = search.has_notes ?? "any";

  const statusMap = useMemo(() => {
    const m = new Map<string, LeadStatus>();
    for (const s of statuses.data ?? []) m.set(s.key, s);
    return m;
  }, [statuses.data]);

  const notesByLead = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of notesIndex.data ?? []) m.set(r.lead_id, r.last_at);
    return m;
  }, [notesIndex.data]);

  const reserved = useQuery({
    queryKey: ["reserved-leads", productFilter],
    queryFn: () =>
      listReservedLeads({
        data: productFilter === "all" ? {} : { product: productFilter },
      }),
  });

  const cancelled = useQuery({
    ...cancelledLeadsQuery,
    enabled: tab === "cancelled",
  });

  // Active vs closed split for the working "Wszystkie" view.
  const activeLeads = useMemo(() => (leads as Lead[]).filter((l) => !isClosedLead(l)), [leads]);
  const realizedLeads = useMemo(() => (leads as Lead[]).filter((l) => isRealizedLead(l)), [leads]);

  useEffect(() => {
    if (!search.leadId) return;
    const found =
      (leads as Lead[]).find((l) => l.id === search.leadId)
      ?? (reserved.data ?? []).find((l) => l.id === search.leadId)
      ?? (cancelled.data ?? []).find((l) => l.id === search.leadId);
    if (found) {
      setOpenLead(found as Lead);
      navigate({ search: (p: Record<string, unknown>) => ({ ...p, leadId: undefined }), replace: true });
    }
  }, [search.leadId, leads, reserved.data, cancelled.data, navigate]);

  useEffect(() => {
    const ch = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          queryClient.invalidateQueries({ queryKey: ["leads-cancelled"] });
          queryClient.invalidateQueries({ queryKey: ["reserved-leads"] });
          if (payload.eventType === "INSERT") {
            const n = (payload.new as { name?: string })?.name ?? "Nowe zgłoszenie";
            toast.success(`Nowy lead: ${n}`);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, ...patch }) });

  const currentUser = useCurrentUser();
  const mineOnly = search.mine === "yes";

  const filtersActive =
    !!search.status_key || !!search.has_notes || (sort !== "smart") || mineOnly;

  function applyFilters(items: Lead[]): Lead[] {
    let out = items;
    if (search.status_key) {
      out = out.filter((l) => (l.status_key ?? l.status) === search.status_key);
    }
    if (search.has_notes === "yes") {
      out = out.filter((l) => notesByLead.has(l.id));
    } else if (search.has_notes === "no") {
      out = out.filter((l) => !notesByLead.has(l.id));
    }
    if (mineOnly && currentUser?.id) {
      out = out.filter((l) => (l as Lead & { assigned_to?: string | null }).assigned_to === currentUser.id);
    }
    return sortItems(out);
  }


  function sortItems(items: Lead[]): Lead[] {
    const copy = [...items];
    const byCreated = (a: Lead, b: Lead) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const lastActivity = (l: Lead) =>
      new Date(notesByLead.get(l.id) ?? l.created_at).getTime();

    if (sort === "newest") copy.sort(byCreated);
    else if (sort === "oldest") copy.sort((a, b) => -byCreated(a, b));
    else if (sort === "recent_note") copy.sort((a, b) => lastActivity(b) - lastActivity(a));
    else {
      // smart: w_kontakcie first (by last activity), then rest by last activity/created
      copy.sort((a, b) => {
        const ak = (a.status_key ?? a.status) === "w_kontakcie" ? 1 : 0;
        const bk = (b.status_key ?? b.status) === "w_kontakcie" ? 1 : 0;
        if (ak !== bk) return bk - ak;
        return lastActivity(b) - lastActivity(a);
      });
    }
    return copy;
  }

  return (
    <>
      <PageHeader
        title="CRM Inbox — Omnichannel"
        description="Wszystkie zgłoszenia z formularza WWW, e-maila i B2B. Aktualizacja na żywo."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["leads"] });
                queryClient.invalidateQueries({ queryKey: ["leads-cancelled"] });
                queryClient.invalidateQueries({ queryKey: ["reserved-leads"] });
                queryClient.invalidateQueries({ queryKey: ["lead-notes-index"] });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
            </Button>
            <ImportLeadsDialog />
            <NewLeadDialog />
          </>
        }
      />
      <div className="p-6 space-y-4">
        {/* Filtry i sortowanie */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Filtry:</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => setSearch({ status_key: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {(statuses.data ?? []).filter((s) => s.is_active).map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={hasNotesFilter}
            onValueChange={(v) => setSearch({ has_notes: v === "any" ? undefined : (v as "yes" | "no") })}
          >
            <SelectTrigger className="h-8 w-[190px]">
              <SelectValue placeholder="Notatki" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Notatki: dowolnie</SelectItem>
              <SelectItem value="yes">Z notatkami / aktywnością</SelectItem>
              <SelectItem value="no">Bez notatek</SelectItem>
            </SelectContent>
          </Select>
          <div className="mx-2 h-6 w-px bg-border" />
          <Button
            size="sm"
            variant={mineOnly ? "default" : "outline"}
            onClick={() => setSearch({ mine: mineOnly ? undefined : "yes" })}
            disabled={!currentUser}
            title="Pokaż tylko leady przypisane do mnie"
          >
            Moje leady
          </Button>
          <div className="mx-2 h-6 w-px bg-border" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Sortuj:</span>
          <Select
            value={sort}
            onValueChange={(v) => setSearch({ sort: v === "smart" ? undefined : (v as typeof sort) })}
          >
            <SelectTrigger className="h-8 w-[240px]">
              <SelectValue placeholder="Sortowanie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="smart">Inteligentnie („W kontakcie" na górze)</SelectItem>
              <SelectItem value="newest">Data dodania: od najnowszych</SelectItem>
              <SelectItem value="oldest">Data dodania: od najstarszych</SelectItem>
              <SelectItem value="recent_note">Ostatnia notatka / kontakt</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() =>
                navigate({
                  search: (p: Record<string, unknown>) => ({
                    ...p,
                    status_key: undefined,
                    has_notes: undefined,
                    sort: undefined,
                    mine: undefined,
                  }),
                })
              }
            >
              <XIcon className="h-4 w-4 mr-1" /> Wyczyść filtry
            </Button>
          )}
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ search: (p: Record<string, unknown>) => ({ ...p, tab: v === "all" ? undefined : (v as typeof tab) }) })
          }
        >
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="all">
              Wszystkie <Badge variant="secondary" className="ml-2">{activeLeads.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="reserved">
              Z rezerwacją{" "}
              <Badge className="ml-2 bg-primary/15 text-primary border-primary/30" variant="outline">
                {reserved.data?.length ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="www">WWW</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="b2b">B2B</TabsTrigger>
            <TabsTrigger value="nowy">Nowe</TabsTrigger>
            <TabsTrigger value="realized">
              Zrealizowane{" "}
              <Badge variant="outline" className="ml-2 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                {realizedLeads.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              Anulowane{" "}
              <Badge variant="outline" className="ml-2 border-destructive/40 text-destructive bg-destructive/10">
                {cancelled.data?.length ?? 0}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4">
            <LeadList items={applyFilters(activeLeads)} onOpen={setOpenLead} statusMap={statusMap} statuses={statuses.data ?? []} notesByLead={notesByLead} />
          </TabsContent>
          <TabsContent value="reserved" className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {([
                { key: "all", label: "Wszystkie" },
                { key: "pellet_paleta", label: "Palety" },
                { key: "pellet_bigbag", label: "Big Bagi" },
                { key: "inne", label: "Inne" },
              ] as { key: ProductFilter; label: string }[]).map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={productFilter === f.key ? "default" : "outline"}
                  onClick={() =>
                    navigate({
                      search: (p: Record<string, unknown>) => ({ ...p, product: f.key === "all" ? undefined : f.key }),
                    })
                  }
                >
                  {f.label}
                </Button>
              ))}
              {reserved.data && reserved.data.length > 0 && (
                <div className="ml-auto text-sm text-muted-foreground self-center">
                  Suma: <span className="font-semibold text-foreground">
                    {reserved.data.reduce((s, l) => s + Number(l.quantity ?? 0), 0).toFixed(1)} t
                  </span>{" "}
                  · {reserved.data.length} leadów
                </div>
              )}
            </div>
            <ReservedList items={reserved.data ?? []} onOpen={setOpenLead} />
          </TabsContent>
          <TabsContent value="www" className="mt-4"><LeadList items={applyFilters(activeLeads.filter((l) => l.source === "www"))} onOpen={setOpenLead} statusMap={statusMap} statuses={statuses.data ?? []} notesByLead={notesByLead} /></TabsContent>
          <TabsContent value="email" className="mt-4"><LeadList items={applyFilters(activeLeads.filter((l) => l.source === "email"))} onOpen={setOpenLead} statusMap={statusMap} statuses={statuses.data ?? []} notesByLead={notesByLead} /></TabsContent>
          <TabsContent value="b2b" className="mt-4"><LeadList items={applyFilters(activeLeads.filter((l) => l.source === "b2b"))} onOpen={setOpenLead} statusMap={statusMap} statuses={statuses.data ?? []} notesByLead={notesByLead} /></TabsContent>
          <TabsContent value="nowy" className="mt-4"><LeadList items={applyFilters(activeLeads.filter((l) => (l.status_key ?? l.status) === "nowy"))} onOpen={setOpenLead} statusMap={statusMap} statuses={statuses.data ?? []} notesByLead={notesByLead} /></TabsContent>
          <TabsContent value="realized" className="mt-4">
            <div className="mb-3 text-sm text-muted-foreground">
              Leady zakończone sprzedażą (status <b>Wygrany</b> lub wydanie z magazynu).
            </div>
            <LeadList items={applyFilters(realizedLeads)} onOpen={setOpenLead} statusMap={statusMap} statuses={statuses.data ?? []} notesByLead={notesByLead} />
          </TabsContent>
          <TabsContent value="cancelled" className="mt-4">
            <div className="mb-3 text-sm text-muted-foreground">
              Leady anulowane — rezerwacje zostały zwolnione, dane pozostają w archiwum.
            </div>
            {cancelled.isLoading ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Wczytywanie…
              </div>
            ) : (
              <LeadList items={applyFilters((cancelled.data ?? []) as Lead[])} onOpen={setOpenLead} statusMap={statusMap} statuses={statuses.data ?? []} notesByLead={notesByLead} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <LeadDetailDrawer
        lead={openLead}
        open={!!openLead}
        onOpenChange={(o) => !o && setOpenLead(null)}
      />
    </>
  );
}

function LeadList({
  items,
  onOpen,
  statusMap,
  statuses,
  notesByLead,
}: {
  items: Lead[];
  onOpen: (l: Lead) => void;
  statusMap: Map<string, LeadStatus>;
  statuses: LeadStatus[];
  notesByLead: Map<string, string>;
}) {
  const setStatusFn = useServerFn(setLeadStatusKey);
  const assign = useServerFn(assignToMe);
  const cancelFn = useServerFn(cancelLead);
  const qc = useQueryClient();

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Brak zgłoszeń pasujących do filtrów.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((l) => {
        const Icon = channelIcon[l.source] ?? InboxIcon;
        const highPriority = l.priority >= 2;
        const currentKey = (l.status_key ?? l.status) as string;
        const currentStatus = statusMap.get(currentKey);
        const hasNotes = notesByLead.has(l.id);
        return (
          <Card
            key={l.id}
            className="hover:border-primary/40 transition-colors cursor-pointer"
            onClick={() => onOpen(l)}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${highPriority ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {(l as any).lead_number && (
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        {(l as any).lead_number}
                      </span>
                    )}
                    {(l as any).urgent_no_fuel && (
                      <Badge className="bg-destructive text-destructive-foreground animate-pulse" variant="default">
                        🚨 PILNE
                      </Badge>
                    )}
                    <span className="truncate">{l.name}</span>
                    {highPriority && (
                      <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                        Priorytet
                      </Badge>
                    )}
                    {(l as any).reservation_status === "zarezerwowany" && (
                      <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                        <PackageCheck className="h-3 w-3 mr-1" /> Rezerwacja
                      </Badge>
                    )}
                    {hasNotes && (
                      <Badge variant="outline" className="border-sky-500/40 text-sky-600 bg-sky-500/10">
                        <StickyNote className="h-3 w-3 mr-1" /> Notatki
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{channelLabel[l.source]}</span>
                    {l.city && <span>· {l.city}</span>}
                    {l.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {l.phone}
                      </span>
                    )}
                    <span>· {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: pl })}</span>
                  </CardDescription>
                </div>
              </div>
              <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={currentKey}
                  onValueChange={async (v) => {
                    // Zamykanie leada na "Zrealizowany" wymaga potwierdzenia kwoty → otwórz kartę leada
                    if (v === "wygrany" && currentKey !== "wygrany") {
                      onOpen(l);
                      toast.message("Potwierdź kwotę rozliczenia w karcie leada");
                      return;
                    }
                    try {
                      await setStatusFn({ data: { id: l.id, status_key: v } });
                      qc.invalidateQueries({ queryKey: ["leads"] });
                      toast.success(`Status: ${statusMap.get(v)?.label ?? v}`);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <SelectTrigger
                    className="h-8 min-w-[170px] border font-medium"
                    style={statusStyle(currentStatus)}
                  >
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.filter((s) => s.is_active || s.key === currentKey).map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0" onClick={(e) => e.stopPropagation()}>
              {l.notes && <p className="text-sm text-muted-foreground line-clamp-2">{l.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-4 text-xs">
                {l.quantity && <span><b className="text-foreground">{l.quantity} t</b></span>}
                {l.product && <span>Produkt: <b className="text-foreground">{l.product}</b></span>}
                {l.email && <span className="text-muted-foreground">{l.email}</span>}
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await assign({ data: { id: l.id } });
                    qc.invalidateQueries({ queryKey: ["leads"] });
                    toast.success("Przypisano do Ciebie");
                  }}
                >
                  Przypisz do mnie
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onOpen(l)}>
                  Otwórz
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
                  onClick={async () => {
                    if (!confirm(`Anulować lead "${l.name}"?${(l as any).reservation_status === "zarezerwowany" ? " Rezerwacja zostanie zwolniona." : ""}`)) return;
                    try {
                      await cancelFn({ data: { lead_id: l.id, reason: "" } });
                      qc.invalidateQueries({ queryKey: ["leads"] });
                      qc.invalidateQueries({ queryKey: ["reserved-leads"] });
                      qc.invalidateQueries({ queryKey: ["stock-balance"] });
                      qc.invalidateQueries({ queryKey: ["stock-events"] });
                      toast.success("Lead anulowany");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Usuń
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ReservedList({ items, onOpen }: { items: Lead[]; onOpen: (l: Lead) => void }) {
  const qc = useQueryClient();
  const wydFn = useServerFn(confirmWydanie);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Brak leadów z aktywną rezerwacją magazynu.
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {items.map((l) => (
        <Card key={l.id} className="border-primary/30 cursor-pointer hover:border-primary/60" onClick={() => onOpen(l)}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <PackageCheck className="h-4 w-4 text-primary" />
                {(l as any).lead_number && (
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{(l as any).lead_number}</span>
                )}
                {(l as any).urgent_no_fuel && (
                  <Badge className="bg-destructive text-destructive-foreground" variant="default">🚨 PILNE</Badge>
                )}
                <span className="truncate">{l.name}</span>
                <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                  {l.quantity} t · {l.product}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                {[l.phone, l.email, l.city].filter(Boolean).join(" · ")} ·{" "}
                {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: pl })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={async () => {
                if (!confirm(`Wydać ${l.quantity} t z magazynu dla ${l.name}? To zdejmie towar ze stanu i oznaczy lead jako wygrany.`)) return;
                try {
                  await wydFn({ data: { lead_id: l.id } });
                  toast.success(`Wydano ${l.quantity} t`);
                  qc.invalidateQueries({ queryKey: ["leads"] });
                  qc.invalidateQueries({ queryKey: ["reserved-leads"] });
                  qc.invalidateQueries({ queryKey: ["stock-balance"] });
                  qc.invalidateQueries({ queryKey: ["stock-events"] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <PackageOpen className="h-4 w-4 mr-2" /> Wydaj z magazynu
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpen(l)}>
              Otwórz szczegóły
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
