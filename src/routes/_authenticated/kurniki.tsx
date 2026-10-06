import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Bird, Loader2, Phone, Search, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PoultryCalendar } from "@/components/poultry-calendar";
import { listPoultryFarms } from "@/lib/kurniki.functions";

export const Route = createFileRoute("/_authenticated/kurniki")({
  head: () => ({
    meta: [
      { title: "Kurniki — Słoneczny Pellet OS" },
      { name: "description", content: "Fermy drobiu: historia zamówień, cykle wstawień i przypomnienia." },
      { property: "og:title", content: "Kurniki — Słoneczny Pellet OS" },
      { property: "og:description", content: "Fermy drobiu: historia zamówień, cykle wstawień i przypomnienia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KurnikiPage,
});

const fmtD = (d: string | null) => (d ? format(parseISO(d), "d LLL yyyy", { locale: pl }) : "—");
const zl = (n: number) => n.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) + " zł";

function KurnikiPage() {
  const fn = useServerFn(listPoultryFarms);
  const { data: farms = [], isLoading } = useQuery({ queryKey: ["poultry_farms"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(
    () => farms.filter((f: any) => `${f.name} ${f.nip ?? ""} ${String(f.nip ?? "").replace(/\D/g, "")} ${f.city ?? ""} ${f.phone ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [farms, q],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Kurniki" description="Fermy B2B: historia zamówień (duplikaty leadów), cykle i przypomnienia o wstawieniach." />
      <Tabs defaultValue="farms">
        <TabsList>
          <TabsTrigger value="farms">Fermy ({farms.length})</TabsTrigger>
          <TabsTrigger value="reminders">Kalendarz wstawień</TabsTrigger>
        </TabsList>
        <TabsContent value="farms" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Szukaj po firmie, NIP, mieście, telefonie…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Ładuję…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak leadów oznaczonych jako kurnik.</p>
          ) : (
            list.map((f: any) => {
              const isOpen = open === f.rootId;
              return (
                <Card key={f.rootId}>
                  <CardContent className="p-4 space-y-3">
                    <button className="flex w-full flex-wrap items-center justify-between gap-3 text-left" onClick={() => setOpen(isOpen ? null : f.rootId)}>
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <Bird className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium">{f.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {f.nip ? `NIP ${f.nip} · ` : ""}{f.city ?? "—"}{f.cycle_days ? ` · cykl ${f.cycle_days} dni` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <Stat label="Zamówienia" value={`${f.delivered}/${f.orders}`} />
                        <Stat label="Tonaż" value={`${f.tons} t`} />
                        <Stat label="Przychód" value={zl(f.revenue)} />
                        <Stat label="Ostatnia dostawa" value={fmtD(f.last_delivery)} />
                        <Stat label="Następne wstawienie" value={fmtD(f.next_reminder)} />
                      </div>
                    </button>
                    {f.phone && (
                      <a href={`tel:${f.phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Phone className="h-3 w-3" /> {f.phone}
                      </a>
                    )}
                    {isOpen && (
                      <ol className="border-l border-border pl-4 space-y-2 overflow-x-auto">
                        {f.leads.map((l: any) => (
                          <li key={l.id} className="grid grid-cols-[90px_70px_150px_60px_150px_minmax(0,1fr)_80px] items-center gap-2 text-sm">
                            <span className="text-xs text-muted-foreground">{fmtD(l.created_at)}</span>
                            <Link to="/crm" search={{ leadId: l.id } as any} className="font-medium text-primary hover:underline">
                              {l.lead_number ?? l.id.slice(0, 8)}
                            </Link>
                            <span><Badge variant="outline">{l.status_key ?? l.status}</Badge></span>
                            <span className="text-right tabular-nums">{l.quantity != null ? `${l.quantity} t` : "—"}</span>
                            <span className="text-xs text-muted-foreground">{l.delivered_at ? `dostawa ${fmtD(l.delivered_at)}` : ""}</span>
                            <span className="truncate text-xs">{[l.street, l.postal_code, l.city].filter(Boolean).join(", ") || "—"}</span>
                            <span>{l.id === f.rootId && <Badge variant="secondary">pierwsze</Badge>}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        <TabsContent value="reminders"><PoultryCalendar /></TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
