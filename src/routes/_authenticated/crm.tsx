import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Globe, Building2, Phone, Send, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM Inbox — Słoneczny Pellet OS" },
      { name: "description", content: "Centralny inbox zgłoszeń: WWW, email, B2B — z automatyczną segmentacją i alertami Telegram." },
    ],
  }),
  component: CrmPage,
});

type Lead = {
  id: string;
  channel: "www" | "email" | "b2b";
  form: "quick-quote" | "detailed-contact";
  name: string;
  company?: string;
  city?: string;
  email: string;
  phone: string;
  area?: number;
  tons?: number;
  message: string;
  received: string;
  status: "Nowe" | "W kontakcie" | "Wycena" | "Zamknięte";
  priority: "wysoki" | "średni" | "niski";
};

const leads: Lead[] = [
  { id: "L-1042", channel: "b2b", form: "detailed-contact", name: "Katarzyna Wojtczak", company: "Drob-Pol Sp. z o.o.", city: "Goleniów", email: "k.wojtczak@drobpol.pl", phone: "+48 601 200 300", tons: 24, message: "Zainteresowani stałą współpracą, palety, dostawa co 2 tyg.", received: "10 min temu", status: "Nowe", priority: "wysoki" },
  { id: "L-1041", channel: "www", form: "quick-quote", name: "Marek Kowalski", city: "Radom", email: "m.kowalski@wp.pl", phone: "+48 512 003 201", area: 480, message: "Hala 480 m², zapytanie o pellet luzem.", received: "24 min temu", status: "Nowe", priority: "średni" },
  { id: "L-1040", channel: "email", form: "detailed-contact", name: "Anna Zielińska", city: "Lublin", email: "a.zielinska@gmail.com", phone: "+48 502 118 004", area: 220, message: "Wycena palety + transport, prosze o kontakt telefoniczny.", received: "1 h temu", status: "W kontakcie", priority: "średni" },
  { id: "L-1039", channel: "www", form: "quick-quote", name: "Piotr Nowak", city: "Złoty Stok", email: "p.nowak@op.pl", phone: "+48 505 442 118", tons: 5, message: "Ile wyjdzie transport 5 ton do Złotego Stoku?", received: "2 h temu", status: "Wycena", priority: "wysoki" },
  { id: "L-1038", channel: "email", form: "detailed-contact", name: "Tomasz Bąk", city: "Kielce", email: "tomek@bak.pl", phone: "+48 511 002 900", area: 150, message: "Koszt dostawy 700 zł go przeraził, prośba o alternatywę.", received: "5 h temu", status: "W kontakcie", priority: "wysoki" },
];

const channelIcon = { www: Globe, email: Mail, b2b: Building2 } as const;
const channelLabel = { www: "WWW", email: "Email", b2b: "B2B" } as const;

function CrmPage() {
  return (
    <>
      <PageHeader
        title="CRM Inbox — Omnichannel"
        description="Wszystkie zgłoszenia z WWW, e-mail formularz@pelletdrob.pl i formularzy B2B."
        actions={
          <>
            <div className="relative hidden md:block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Szukaj klienta, miasta…" className="pl-8 w-64" />
            </div>
            <Button>
              <Send className="mr-2 h-4 w-4" /> Nowa wiadomość
            </Button>
          </>
        }
      />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Wszystkie <Badge variant="secondary" className="ml-2">{leads.length}</Badge></TabsTrigger>
            <TabsTrigger value="www">WWW</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="b2b">B2B — priorytet</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <LeadList items={leads} />
          </TabsContent>
          <TabsContent value="www" className="mt-4"><LeadList items={leads.filter((l) => l.channel === "www")} /></TabsContent>
          <TabsContent value="email" className="mt-4"><LeadList items={leads.filter((l) => l.channel === "email")} /></TabsContent>
          <TabsContent value="b2b" className="mt-4"><LeadList items={leads.filter((l) => l.channel === "b2b")} /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function LeadList({ items }: { items: Lead[] }) {
  return (
    <div className="grid gap-3">
      {items.map((l) => {
        const Icon = channelIcon[l.channel];
        return (
          <Card key={l.id} className="hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${l.channel === "b2b" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    <span className="truncate">{l.name}</span>
                    {l.company && <span className="text-muted-foreground font-normal">· {l.company}</span>}
                    {l.priority === "wysoki" && <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">Priorytet</Badge>}
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{channelLabel[l.channel]} · {l.form}</span>
                    {l.city && <span>· {l.city}</span>}
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>
                    <span>· {l.received}</span>
                  </CardDescription>
                </div>
              </div>
              <div className="text-right shrink-0">
                <Badge variant={l.status === "Nowe" ? "default" : "secondary"}>{l.status}</Badge>
                <div className="mt-2 text-xs text-muted-foreground">{l.id}</div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground line-clamp-2">{l.message}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs">
                {l.area && <span><b className="text-foreground">{l.area} m²</b> powierzchnia hali</span>}
                {l.tons && <span><b className="text-foreground">{l.tons} t</b> zapotrzebowanie</span>}
                <span className="text-muted-foreground">{l.email}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm">Odpowiedz</Button>
                <Button size="sm" variant="outline">Wyceń transport</Button>
                <Button size="sm" variant="ghost">Alert Telegram</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
