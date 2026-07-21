import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calculator,
  MapPin,
  Loader2,
  Users,
  Fuel,
  RotateCcw,
  PencilLine,
} from "lucide-react";
import { toast } from "sonner";
import {
  calculateTransport,
  suggestConsolidation,
} from "@/lib/transport.functions";
import { getLatestFuelPrice } from "@/lib/fuel.functions";

export const Route = createFileRoute("/_authenticated/transport")({
  head: () => ({
    meta: [
      { title: "Transport — Słoneczny Pellet OS" },
      {
        name: "description",
        content:
          "Kalkulator transportu od bazy Witoroża 21-570 — km, paliwo, koszt.",
      },
    ],
  }),
  component: TransportPage,
});

type CalcResult = Awaited<ReturnType<typeof calculateTransport>>;

function TransportPage() {
  const calcFn = useServerFn(calculateTransport);
  const consolidationFn = useServerFn(suggestConsolidation);
  const fuelFn = useServerFn(getLatestFuelPrice);

  const fuelQuery = useQuery({
    queryKey: ["fuel-price", "latest"],
    queryFn: () => fuelFn(),
    staleTime: 5 * 60 * 1000,
  });

  const [destination, setDestination] = useState("");
  const [tons, setTons] = useState(24);
  const [driverDays, setDriverDays] = useState(1);
  const [fuelPrice, setFuelPrice] = useState(6.8);
  const [fuelOverridden, setFuelOverridden] = useState(false);
  const [consumption, setConsumption] = useState(30);
  const [perKmRate, setPerKmRate] = useState(0.4);
  const [driverDayRate, setDriverDayRate] = useState(350);
  const [roundTrip, setRoundTrip] = useState(true);
  const [result, setResult] = useState<CalcResult | null>(null);

  // Synchronizuj domyślną cenę z bazy dopóki użytkownik jej nie nadpisał ręcznie.
  useEffect(() => {
    if (!fuelOverridden && fuelQuery.data?.price_per_liter) {
      setFuelPrice(fuelQuery.data.price_per_liter);
    }
  }, [fuelQuery.data, fuelOverridden]);


  const calc = useMutation({
    mutationFn: () =>
      calcFn({
        data: {
          destination,
          tons,
          driverDays,
          fuelPrice,
          consumption,
          perKmRate,
          driverDayRate,
          roundTrip,
        },
      }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const consolidation = useQuery({
    queryKey: ["transport", "consolidation"],
    queryFn: () => consolidationFn(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport"
        description="Kalkulator kosztu transportu od bazy Witoroża, 21-570 Drelów."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Kalkulator trasy
            </CardTitle>
            <CardDescription>
              Podaj adres docelowy — Google Maps policzy km od bazy, a system
              rozbije koszt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dest">Adres docelowy</Label>
              <Input
                id="dest"
                placeholder="np. Wrocław, ul. Legnicka 55"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tony" value={tons} onChange={setTons} step={0.5} />
              <Field
                label="Dni kierowcy"
                value={driverDays}
                onChange={setDriverDays}
                step={1}
              />
              <Field
                label="Cena paliwa (zł/l)"
                value={fuelPrice}
                onChange={setFuelPrice}
                step={0.1}
              />
              <Field
                label="Spalanie (l/100km)"
                value={consumption}
                onChange={setConsumption}
                step={1}
              />
              <Field
                label="Stawka zł/km"
                value={perKmRate}
                onChange={setPerKmRate}
                step={0.1}
              />
              <Field
                label="Stawka kierowcy zł/dzień"
                value={driverDayRate}
                onChange={setDriverDayRate}
                step={10}
              />

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={roundTrip}
                    onChange={(e) => setRoundTrip(e.target.checked)}
                  />
                  Trasa w obie strony
                </label>
              </div>
            </div>

            <Button
              onClick={() => calc.mutate()}
              disabled={!destination || calc.isPending}
              className="w-full"
            >
              {calc.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="mr-2 h-4 w-4" />
              )}
              Policz trasę i koszt
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wynik</CardTitle>
            <CardDescription>
              {result ? result.destination : "Wypełnij formularz i policz."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Metric
                    label={roundTrip ? "Km (tam-powrót)" : "Km"}
                    value={`${result.km}`}
                  />
                  <Metric label="Jednokierunkowo" value={`${result.oneWayKm} km`} />
                  <Metric
                    label="Czas jazdy"
                    value={`${Math.floor(result.durationMin / 60)}h ${result.durationMin % 60}m`}
                  />
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <Row label="Paliwo" value={result.breakdown.fuel} />
                  <Row label="Amortyzacja/opłaty (zł/km)" value={result.breakdown.km} />
                  <Row label="Kierowca (dni × stawka)" value={result.breakdown.driver} />

                  <Separator />
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Razem</span>
                    <span className="text-primary">
                      {result.total.toLocaleString("pl-PL")} zł
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Koszt za tonę</span>
                    <span>{result.perTon.toLocaleString("pl-PL")} zł/t</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Baza:{" "}
                <span className="font-medium text-foreground">
                  Witoroża, 21-570 Drelów
                </span>
                . Trasa liczona przez Google Maps.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Konsolidacja
          </CardTitle>
          <CardDescription>
            Otwarte leady zgrupowane po mieście — kandydaci do wspólnego kursu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consolidation.isLoading ? (
            <p className="text-sm text-muted-foreground">Ładuję…</p>
          ) : consolidation.data && consolidation.data.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {consolidation.data.map((g) => (
                <div
                  key={g.city}
                  className="rounded-lg border border-border p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{g.city}</div>
                    <Badge variant="secondary">
                      {g.totalTons.toLocaleString("pl-PL")} t
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {g.leads.length} lead(ów)
                  </p>
                  <ul className="text-xs space-y-1">
                    {g.leads.slice(0, 5).map((l) => (
                      <li key={l.id} className="flex justify-between">
                        <span>{l.name}</span>
                        <span className="text-muted-foreground">
                          {Number(l.quantity ?? 0)} t
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setDestination(g.city);
                      setTons(g.totalTons);
                      toast.info(`Wstawiono ${g.city} do kalkulatora`);
                    }}
                  >
                    Policz kurs
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Brak otwartych leadów z miastem do zgrupowania.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value.toLocaleString("pl-PL")} zł</span>
    </div>
  );
}
