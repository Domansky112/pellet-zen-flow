import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Globe, Building2, Phone, Search, Inbox as InboxIcon, RefreshCw } from "lucide-react";
import { listLeads, updateLeadStatus, assignToMe } from "@/lib/leads.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

const leadsQuery = queryOptions({
  queryKey: ["leads"],
  queryFn: () => listLeads(),
});

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM Inbox — Słoneczny Pellet OS" },
      { name: "description", content: "Centralny inbox zgłoszeń z WWW, e-mail i B2B." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsQuery),
  component: CrmPage,
});

type Lead = Awaited<ReturnType<typeof listLeads>>[number];

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

  useEffect(() => {
    const ch = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
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
              onClick={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
            </Button>
          </>
        }
      />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              Wszystkie <Badge variant="secondary" className="ml-2">{leads.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="www">WWW</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="b2b">B2B</TabsTrigger>
            <TabsTrigger value="nowy">Nowe</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4"><LeadList items={leads} /></TabsContent>
          <TabsContent value="www" className="mt-4"><LeadList items={leads.filter((l) => l.source === "www")} /></TabsContent>
          <TabsContent value="email" className="mt-4"><LeadList items={leads.filter((l) => l.source === "email")} /></TabsContent>
          <TabsContent value="b2b" className="mt-4"><LeadList items={leads.filter((l) => l.source === "b2b")} /></TabsContent>
          <TabsContent value="nowy" className="mt-4"><LeadList items={leads.filter((l) => l.status === "nowy")} /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function LeadList({ items }: { items: Lead[] }) {
  const updateStatus = useServerFn(updateLeadStatus);
  const assign = useServerFn(assignToMe);
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
          <Card key={l.id} className="hover:border-primary/40 transition-colors">
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
            <CardContent className="pt-0">
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
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
