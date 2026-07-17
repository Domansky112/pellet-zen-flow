import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import {
  Inbox,
  Warehouse,
  Truck,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  Package,
  Boxes,
} from "lucide-react";
import { listLeads } from "@/lib/leads.functions";
import { listStockBalance } from "@/lib/stock.functions";
import { listTransports } from "@/lib/transport-crud.functions";
import { format, isToday, isYesterday, startOfDay, addDays, differenceInCalendarDays } from "date-fns";
import { pl } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Słoneczny Pellet OS" },
      { name: "description", content: "Przegląd operacyjny: zgłoszenia, magazyn, transporty i alerty." },
    ],
  }),
  component: Dashboard,
});

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Palety",
  pellet_bigbag: "Big Bag",
  
  inne: "Inne",
};

const SOURCE_LABEL: Record<string, string> = {
  www_quick: "WWW",
  www_detailed: "B2B",
  email: "Email",
  telegram: "Telegram",
  telefon: "Telefon",
  inne: "Inne",
};

function Dashboard() {
  const leadsFn = useServerFn(listLeads);
  const stockFn = useServerFn(listStockBalance);
  const transportsFn = useServerFn(listTransports);

  const { data: leads } = useSuspenseQuery({ queryKey: ["leads"], queryFn: () => leadsFn() });
  const { data: stock } = useSuspenseQuery({ queryKey: ["stock-balance"], queryFn: () => stockFn() });
  const { data: transports } = useSuspenseQuery({ queryKey: ["transports"], queryFn: () => transportsFn() });

  // KPIs
  const today = startOfDay(new Date());
  const in7 = addDays(today, 7);
  const leadsToday = leads.filter((l: any) => isToday(new Date(l.created_at))).length;
  const leadsYesterday = leads.filter((l: any) => isYesterday(new Date(l.created_at))).length;
  const deltaLeads = leadsToday - leadsYesterday;

  const balByProduct: Record<string, { physical: number; reserved: number; available: number }> = {};
  for (const b of stock as any[]) {
    balByProduct[b.product] = {
      physical: Number(b.physical ?? 0),
      reserved: Number(b.reserved ?? 0),
      available: Number(b.available ?? 0),
    };
  }
  const palety = balByProduct["pellet_paleta"] ?? { physical: 0, reserved: 0, available: 0 };
  const bigbag = balByProduct["pellet_bigbag"] ?? { physical: 0, reserved: 0, available: 0 };
  

  const transportsThisWeek = (transports as any[]).filter((t) => {
    const d = new Date(t.scheduled_date);
    return d >= today && d <= in7;
  });
  const needT4 = transportsThisWeek.filter((t) => {
    const diff = differenceInCalendarDays(new Date(t.scheduled_date), today);
    return diff <= 4 && !t.telegram_t4_sent_at;
  }).length;

  const kpis = [
    {
      label: "Nowe zgłoszenia dziś",
      value: String(leadsToday),
      change: deltaLeads === 0 ? "bez zmian vs wczoraj" : `${deltaLeads > 0 ? "+" : ""}${deltaLeads} vs wczoraj`,
      icon: Inbox,
      tone: "text-primary",
    },
    {
      label: "Dostępne palety (t)",
      value: palety.available.toFixed(1),
      change: `z ${palety.physical.toFixed(1)} t fizycznie`,
      icon: Package,
      tone: "text-info",
    },
    {
      label: "Dostępne Big Bagi (t)",
      value: bigbag.available.toFixed(1),
      change: `z ${bigbag.physical.toFixed(1)} t fizycznie`,
      icon: Boxes,
      tone: "text-warning",
    },
    {
      label: "Transporty w tym tygodniu",
      value: String(transportsThisWeek.length),
      change: needT4 > 0 ? `${needT4} wymaga alertu T-4` : "wszystkie zaplanowane",
      icon: Truck,
      tone: "text-success",
    },
  ];

  // Feed — ostatnie leady
  const feed = (leads as any[]).slice(0, 6).map((l) => ({
    time: format(new Date(l.created_at), "HH:mm"),
    date: format(new Date(l.created_at), "d MMM", { locale: pl }),
    type: SOURCE_LABEL[l.source] ?? l.source ?? "—",
    who: [l.name, l.city, l.quantity ? `${l.quantity} t` : null].filter(Boolean).join(" · "),
    label: PRODUCT_LABEL[l.product] ?? l.product ?? "—",
    tag: l.priority === "wysoki" ? "Priorytet" : l.status ?? "Nowe",
    priority: l.priority,
  }));

  // Alerty
  const alerts: { text: string; level: "warning" | "info" }[] = [];
  transportsThisWeek.forEach((t) => {
    const diff = differenceInCalendarDays(new Date(t.scheduled_date), today);
    if (diff <= 4 && diff >= 0 && !t.telegram_t4_sent_at) {
      alerts.push({
        text: `Transport ${format(new Date(t.scheduled_date), "d MMM", { locale: pl })} → ${t.city} — ${diff} ${
          diff === 1 ? "dzień" : "dni"
        } do wyjazdu`,
        level: "warning",
      });
    }
  });
  if (palety.available < 20)
    alerts.push({ text: `Palety: dostępne ${palety.available.toFixed(1)} t (<20 t) — warto uzupełnić`, level: "warning" });
  if (bigbag.available < 20)
    alerts.push({ text: `Big Bag: dostępne ${bigbag.available.toFixed(1)} t (<20 t) — warto uzupełnić`, level: "warning" });
  const openB2B = (leads as any[]).filter(
    (l) => l.source === "www_detailed" && ["nowy", "w_kontakcie", "oferta"].includes(l.status),
  ).length;
  if (openB2B >= 3)
    alerts.push({ text: `${openB2B} otwartych leadów B2B — kandydat do konsolidacji auta 24 t`, level: "info" });
  if (alerts.length === 0) alerts.push({ text: "Brak alertów — wszystko pod kontrolą.", level: "info" });

  const upcoming = transportsThisWeek.slice(0, 6);

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
              <CardDescription>Najnowsze zgłoszenia z WWW, e-mail, B2B i innych kanałów.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {feed.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Brak zgłoszeń. <Link to="/formularz" className="text-primary underline">Przetestuj formularz</Link>.
                </p>
              )}
              {feed.map((f, i) => (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="text-xs text-muted-foreground w-16 shrink-0 mt-0.5">
                    {f.date} {f.time}
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {f.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.who || "—"}</p>
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                  </div>
                  <Badge
                    className="shrink-0"
                    variant={f.priority === "wysoki" ? "default" : "secondary"}
                  >
                    {f.tag}
                  </Badge>
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
              <CardDescription>Dostępne / fizyczne (t)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { label: "Palety", bal: palety },
                { label: "Big Bagi", bal: bigbag },
                
              ].map((row) => {
                const pct = row.bal.physical > 0 ? (row.bal.available / row.bal.physical) * 100 : 0;
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted-foreground">
                        {row.bal.available.toFixed(1)} t / {row.bal.physical.toFixed(1)} t
                      </span>
                    </div>
                    <Progress value={Math.max(0, Math.min(100, pct))} />
                    {row.bal.reserved > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Zarezerwowane: {row.bal.reserved.toFixed(1)} t
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Ten tydzień
              </CardTitle>
              <CardDescription>Najbliższe 7 dni</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcoming.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Brak transportów.{" "}
                  <Link to="/kalendarz" className="text-primary underline">
                    Dodaj nowy
                  </Link>
                  .
                </p>
              )}
              {upcoming.map((t: any) => {
                const items = t.transport_items ?? [];
                const tons = items.reduce((s: number, i: any) => s + Number(i.quantity ?? 0), 0);
                const products = [...new Set(items.map((i: any) => PRODUCT_LABEL[i.product] ?? i.product))].join(", ");
                return (
                  <Link
                    key={t.id}
                    to="/kalendarz"
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium">
                      {format(new Date(t.scheduled_date), "EEE d.MM", { locale: pl })}
                    </span>
                    <span className="text-sm text-muted-foreground truncate ml-3">
                      {t.city} · {tons.toFixed(1)} t{products ? ` · ${products}` : ""}
                      {t.driver ? ` · ${t.driver}` : ""}
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
