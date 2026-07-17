import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { Inbox, Warehouse, Truck, CalendarDays, TrendingUp, AlertTriangle, Package, Boxes } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Słoneczny Pellet OS" },
      { name: "description", content: "Przegląd operacyjny: zgłoszenia, magazyn, transporty i alerty." },
    ],
  }),
  component: Dashboard,
});

const kpis = [
  { label: "Nowe zgłoszenia dziś", value: "14", change: "+3 vs wczoraj", icon: Inbox, tone: "text-primary" },
  { label: "Dostępne palety (t)", value: "82,4", change: "z 240 t fizycznie", icon: Package, tone: "text-info" },
  { label: "Dostępne Big Bagi (t)", value: "31,0", change: "z 96 t fizycznie", icon: Boxes, tone: "text-warning" },
  { label: "Transporty w tym tygodniu", value: "7", change: "2 wymagają alertu 4-dni", icon: Truck, tone: "text-success" },
];

const feed = [
  { time: "10:42", type: "WWW", label: "quick-quote", who: "Marek Kowalski · 480 m²", tag: "Nowe" },
  { time: "10:31", type: "Email", label: "formularz@", who: "Anna Zielińska · tel. 512-***-201", tag: "Do oddzwonienia" },
  { time: "09:58", type: "B2B", label: "detailed-contact", who: "Drob-Pol Sp. z o.o. · Goleniów · 24 t", tag: "Priorytet" },
  { time: "09:12", type: "Telegram", label: "Bot Magazyn", who: "Placowy: +8 palet · komentarz „dostawa Radom”", tag: "Magazyn" },
  { time: "08:44", type: "WWW", label: "quick-quote", who: "Piotr Nowak · Złoty Stok · 5 t", tag: "Transport" },
];

const alerts = [
  { text: "Transport #TR-241 do Goleniowa — 4 dni do wyjazdu", level: "warning" },
  { text: "Big Bag: stan dostępny <20 t — warto uzupełnić", level: "warning" },
  { text: "3 zgłoszenia z woj. dolnośląskiego — kandydat do konsolidacji auta 24 t", level: "info" },
];

function Dashboard() {
  return (
    <>
      <PageHeader
        title="Dashboard operacyjny"
        description="Cały ruch handlowy, magazynowy i logistyczny w jednym miejscu."
      />
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
                <k.icon className={`h-4 w-4 ${k.tone}`} />
              </CardHeader>
              <CardContent>
                <div className="font-display text-3xl font-semibold">{k.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{k.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" /> Feed omnichannel
              </CardTitle>
              <CardDescription>
                Zgłoszenia WWW, e-mail (formularz@pelletdrob.pl), B2B i akcje Telegram — na żywo.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {feed.map((f, i) => (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="text-xs text-muted-foreground w-12 shrink-0 mt-0.5">{f.time}</div>
                  <Badge variant="outline" className="shrink-0">{f.type}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.who}</p>
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                  </div>
                  <Badge className="shrink-0" variant="secondary">{f.tag}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" /> Alerty
              </CardTitle>
              <CardDescription>Sygnały wymagające decyzji</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 text-sm ${
                    a.level === "warning"
                      ? "border-warning/40 bg-warning/10"
                      : "border-info/40 bg-info/10"
                  }`}
                >
                  {a.text}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-primary" /> Bilans magazynu
              </CardTitle>
              <CardDescription>Fizyczny / zarezerwowany / dostępny</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">Palety</span>
                  <span className="text-muted-foreground">82,4 t / 240 t</span>
                </div>
                <Progress value={(82.4 / 240) * 100} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">Big Bagi</span>
                  <span className="text-muted-foreground">31,0 t / 96 t</span>
                </div>
                <Progress value={(31 / 96) * 100} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Ten tydzień
              </CardTitle>
              <CardDescription>Poniedziałek – niedziela</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { d: "Pon 15.09", t: "TR-238 · Radom · 8 t · Palety" },
                { d: "Wt 16.09", t: "TR-240 · Lublin · 5 t · Big Bag" },
                { d: "Czw 18.09", t: "TR-241 · Goleniów · 24 t · Palety (konsolidacja)" },
                { d: "Pt 19.09", t: "TR-243 · Złoty Stok · 3 t · Big Bag" },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50">
                  <span className="text-sm font-medium">{row.d}</span>
                  <span className="text-sm text-muted-foreground">{row.t}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
