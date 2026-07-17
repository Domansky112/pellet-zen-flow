import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, MapPin, Users, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/transport")({
  head: () => ({
    meta: [
      { title: "Transport — Słoneczny Pellet OS" },
      { name: "description", content: "Kalkulator strefowy dostaw i konsolidacja ładunków po regionach." },
    ],
  }),
  component: TransportPage,
});

const konsolidacje = [
  {
    region: "Dolnośląskie · rejon Złoty Stok / Ząbkowice",
    liczba: 3,
    lacznie: 8.5,
    klienci: ["Piotr Nowak · 5 t", "Krzysztof M. · 2 t", "Ewa S. · 1,5 t"],
    oszczednosc: "≈ 900 zł / klient",
  },
  {
    region: "Zachodniopomorskie · Goleniów + Szczecin",
    liczba: 2,
    lacznie: 27,
    klienci: ["Drob-Pol · 24 t", "GastroPl · 3 t"],
    oszczednosc: "auto 24 t + doładunek",
  },
  {
    region: "Mazowieckie · Radom / Kozienice",
    liczba: 4,
    lacznie: 14,
    klienci: ["Marek K. · 6 t", "Beata W. · 4 t", "AgroFarm · 3 t", "Jan S. · 1 t"],
    oszczednosc: "≈ 650 zł / klient",
  },
];

const strefy = [
  { name: "Strefa I (do 100 km)", stawka: "180 zł/t", eta: "24 h" },
  { name: "Strefa II (100–250 km)", stawka: "260 zł/t", eta: "48 h" },
  { name: "Strefa III (250–450 km)", stawka: "340 zł/t", eta: "48–72 h" },
  { name: "Strefa IV (>450 km)", stawka: "420 zł/t + FTL", eta: "72 h" },
];

function TransportPage() {
  return (
    <>
      <PageHeader
        title="Logistyka i kalkulator dostaw"
        description="Wycena po kodzie pocztowym oraz sugestie konsolidacji ładunków."
      />
      <div className="p-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" /> Kalkulator strefowy
            </CardTitle>
            <CardDescription>Wpisz kod pocztowy klienta i tonaż.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kod">Kod pocztowy</Label>
                <Input id="kod" placeholder="99-320" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tony">Tony</Label>
                <Input id="tony" type="number" placeholder="5" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="miasto">Miejscowość (opcjonalnie)</Label>
              <Input id="miasto" placeholder="Goleniów" />
            </div>
            <Button className="w-full">Oblicz koszt dostawy</Button>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Odległość</span>
                <span className="font-medium">— km</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Strefa</span>
                <span className="font-medium">—</span>
              </div>
              <div className="flex items-center justify-between text-base pt-2 border-t border-border/60">
                <span className="font-medium">Koszt transportu</span>
                <span className="font-display text-2xl font-semibold text-primary">— zł</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Sugestie konsolidacji
            </CardTitle>
            <CardDescription>
              Zapytania z podobnego regionu i tonażu — jedno auto zamiast trzech.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {konsolidacje.map((k, i) => (
              <div key={i} className="rounded-lg border p-4 hover:border-primary/40 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" /> {k.region}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {k.liczba} zgłoszeń · łącznie {k.lacznie} t
                    </p>
                  </div>
                  <Badge className="bg-success/15 text-success border-success/30" variant="outline">
                    <TrendingDown className="mr-1 h-3 w-3" /> {k.oszczednosc}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {k.klienci.map((c, j) => (
                    <Badge key={j} variant="secondary" className="font-normal">{c}</Badge>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm">Utwórz transport zbiorczy</Button>
                  <Button size="sm" variant="outline">Powiadom klientów</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Cennik stref</CardTitle>
            <CardDescription>Bazowa siatka używana przez kalkulator. Nadpisywana ręcznie dla priorytetów.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {strefy.map((s) => (
              <div key={s.name} className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">{s.name}</p>
                <p className="font-display text-xl font-semibold mt-1">{s.stawka}</p>
                <p className="text-xs text-muted-foreground mt-1">ETA {s.eta}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
