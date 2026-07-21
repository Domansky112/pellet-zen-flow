import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Globe, Building2, Phone, Search, Inbox as InboxIcon, RefreshCw, PackageCheck, PackageOpen, Trash2 } from "lucide-react";
import { listLeads, listReservedLeads, updateLeadStatus, assignToMe, confirmWydanie, cancelLead } from "@/lib/leads.functions";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { LeadDetailDrawer } from "@/components/lead-detail-drawer";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

const leadsQuery = queryOptions({
  queryKey: ["leads"],
  queryFn: () => listLeads(),
});

const searchSchema = z.object({
  tab: z.enum(["all", "reserved", "www", "email", "b2b", "nowy"]).optional(),
  product: z.enum(["pellet_paleta", "pellet_bigbag", "inne"]).optional(),
  leadId: z.string().uuid().optional(),
});

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

type Lead = Awaited<ReturnType<typeof listLeads>>[number];
type ProductFilter = "all" | "pellet_paleta" | "pellet_bigbag" | "inne";

const channelIcon = { www: Globe, email: Mail, b2b: Building2, telefon: Phone, inne: InboxIcon } as const;
const channelLabel = { www: "WWW", email: "Email", b2b: "B2B", telefon: "Telefon", inne: "Inne" } as const;
const statusLabel: Record<Lead["status"], string> = {
  nowy: "Nowe",
  w_kontakcie: "W kontakcie",
  oferta: "Oferta",
  wygrany: "Wygrany",
  przegrany: "Przegrany",
};

function CrmPage() {
  const { data: leads } = useSuspenseQuery(leadsQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const tab = search.tab ?? "all";
  const productFilter: ProductFilter = search.product ?? "all";

  const reserved = useQuery({
    queryKey: ["reserved-leads", productFilter],
    queryFn: () =>
      listReservedLeads({
        data: productFilter === "all" ? {} : { product: productFilter },
      }),
  });


  useEffect(() => {
    const ch = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
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

  return (
    <>
      <PageHeader
        title="CRM Inbox — Omnichannel"
        description="Wszystkie zgłoszenia z formularza WWW, e-maila i B2B. Aktualizacja na żywo."
        actions={
          <>
            <div className="relative hidden md:block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Szukaj…" className="pl-8 w-64" />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["leads"] });
                queryClient.invalidateQueries({ queryKey: ["reserved-leads"] });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
            </Button>
            <NewLeadDialog />
          </>
        }
      />
      <div className="p-6 space-y-4">
        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ search: (p: Record<string, unknown>) => ({ ...p, tab: v === "all" ? undefined : (v as typeof tab) }) })
          }
        >
          <TabsList>
            <TabsTrigger value="all">
              Wszystkie <Badge variant="secondary" className="ml-2">{leads.length}</Badge>
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
          </TabsList>
          <TabsContent value="all" className="mt-4"><LeadList items={leads} onOpen={setOpenLead} /></TabsContent>
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
          <TabsContent value="www" className="mt-4"><LeadList items={leads.filter((l) => l.source === "www")} onOpen={setOpenLead} /></TabsContent>
          <TabsContent value="email" className="mt-4"><LeadList items={leads.filter((l) => l.source === "email")} onOpen={setOpenLead} /></TabsContent>
          <TabsContent value="b2b" className="mt-4"><LeadList items={leads.filter((l) => l.source === "b2b")} onOpen={setOpenLead} /></TabsContent>
          <TabsContent value="nowy" className="mt-4"><LeadList items={leads.filter((l) => l.status === "nowy")} onOpen={setOpenLead} /></TabsContent>
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

function LeadList({ items, onOpen }: { items: Lead[]; onOpen: (l: Lead) => void }) {
  const updateStatus = useServerFn(updateLeadStatus);
  const assign = useServerFn(assignToMe);
  const cancelFn = useServerFn(cancelLead);
  const qc = useQueryClient();

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Brak zgłoszeń w tej zakładce. Prześlij testowe przez{" "}
        <a href="/formularz" className="text-primary underline">/formularz</a>.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((l) => {
        const Icon = channelIcon[l.source] ?? InboxIcon;
        const highPriority = l.priority >= 2;
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
              <div className="text-right shrink-0">
                <Badge variant={l.status === "nowy" ? "default" : "secondary"}>
                  {statusLabel[l.status]}
                </Badge>
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
                  onClick={async () => {
                    await updateStatus({ data: { id: l.id, status: "w_kontakcie" } });
                    qc.invalidateQueries({ queryKey: ["leads"] });
                    toast.success("Oznaczono jako w kontakcie");
                  }}
                  disabled={l.status !== "nowy"}
                >
                  Odbierz
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await updateStatus({ data: { id: l.id, status: "oferta" } });
                    qc.invalidateQueries({ queryKey: ["leads"] });
                  }}
                >
                  Wyślij ofertę
                </Button>
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
