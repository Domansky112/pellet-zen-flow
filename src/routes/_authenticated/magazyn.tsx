import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Minus, Lock, Unlock, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/magazyn")({
  head: () => ({
    meta: [
      { title: "Magazyn — Słoneczny Pellet OS" },
      { name: "description", content: "Silnik magazynowy: palety, big bagi, rezerwacje, sprzedaż — z automatycznym przeliczaniem stanów." },
    ],
  }),
  component: WarehousePage,
});

const state = {
  palety: { fizyczny: 240, rezerwacja: 157.6, dostepny: 82.4, sprzedaz: 412.8 },
  bigbag: { fizyczny: 96, rezerwacja: 65, dostepny: 31, sprzedaz: 188.5 },
};

const history = [
  { date: "16.09 · 10:42", op: "Rezerwacja", typ: "Palety", qty: -8, komentarz: "Drob-Pol · TR-241", user: "Handlowiec 1" },
  { date: "16.09 · 09:15", op: "Dodanie", typ: "Palety", qty: +24, komentarz: "Dostawa producent", user: "Placowy" },
  { date: "15.09 · 16:20", op: "Zwolnienie rez.", typ: "Big Bag", qty: -3, komentarz: "TR-238 zrealizowany", user: "System" },
  { date: "15.09 · 14:08", op: "Rezerwacja", typ: "Big Bag", qty: -5, komentarz: "Anna Zielińska · Lublin", user: "Handlowiec 2" },
  { date: "15.09 · 11:00", op: "Dokupienie", typ: "Palety", qty: +40, komentarz: "Uzupełnienie stanu", user: "Placowy" },
];

function WarehousePage() {
  return (
    <>
      <PageHeader
        title="Magazyn — silnik matematyczny"
        description="Zdarzenie klikasz — system sam przelicza fizyczne / zarezerwowane / dostępne / sprzedane."
        actions={
          <Button variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Przelicz cały arkusz
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        <Tabs defaultValue="palety">
          <TabsList>
            <TabsTrigger value="palety">Palety</TabsTrigger>
            <TabsTrigger value="bigbag">Big Bagi</TabsTrigger>
          </TabsList>
          <TabsContent value="palety" className="mt-4">
            <StockPanel typ="Palety" s={state.palety} />
          </TabsContent>
          <TabsContent value="bigbag" className="mt-4">
            <StockPanel typ="Big Bagi" s={state.bigbag} />
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Historia zdarzeń</CardTitle>
            <CardDescription>Każda operacja zapisana na kolejnym wolnym wierszu, z użytkownikiem i komentarzem.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Operacja</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Ilość (t)</TableHead>
                  <TableHead>Komentarz</TableHead>
                  <TableHead>Kto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{h.date}</TableCell>
                    <TableCell><Badge variant="outline">{h.op}</Badge></TableCell>
                    <TableCell>{h.typ}</TableCell>
                    <TableCell className={`text-right font-medium ${h.qty >= 0 ? "text-success" : "text-primary"}`}>
                      {h.qty > 0 ? "+" : ""}{h.qty}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{h.komentarz}</TableCell>
                    <TableCell className="text-xs">{h.user}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StockPanel({ typ, s }: { typ: string; s: { fizyczny: number; rezerwacja: number; dostepny: number; sprzedaz: number } }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{typ} — bilans</CardTitle>
          <CardDescription>Fizyczny = dostępny + zarezerwowany. Zrealizowane rezerwy przechodzą do „sprzedaży”.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StatRow label="Stan fizyczny" value={s.fizyczny} total={s.fizyczny} tone="bg-primary" />
          <StatRow label="Zarezerwowane" value={s.rezerwacja} total={s.fizyczny} tone="bg-warning" />
          <StatRow label="Dostępne do sprzedaży" value={s.dostepny} total={s.fizyczny} tone="bg-success" />
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Suma sprzedaży (cumulative)</span>
            <span className="font-display text-2xl font-semibold text-foreground">{s.sprzedaz} t</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zdarzenia magazynowe</CardTitle>
          <CardDescription>Klikasz — system przelicza automatycznie.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button className="justify-start"><Plus className="mr-2 h-4 w-4" /> Dodaj {typ.toLowerCase()}</Button>
          <Button variant="outline" className="justify-start"><Minus className="mr-2 h-4 w-4" /> Wyjazd / zdejmij</Button>
          <Button variant="outline" className="justify-start"><Lock className="mr-2 h-4 w-4" /> Rezerwacja</Button>
          <Button variant="outline" className="justify-start"><Unlock className="mr-2 h-4 w-4" /> Zwolnij rez.</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = Math.min(100, (value / total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-display text-lg font-semibold">{value} t</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
