import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/kalendarz")({
  head: () => ({
    meta: [
      { title: "Kalendarz transportów — Słoneczny Pellet OS" },
      { name: "description", content: "Harmonogram odbiorów z inteligentnymi alertami 7 i 4 dni na Telegram." },
    ],
  }),
  component: CalendarPage,
});

const dni = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
const daty = ["15.09", "16.09", "17.09", "18.09", "19.09", "20.09", "21.09"];

type Ev = { id: string; klient: string; ton: number; miasto: string; status: "planowany" | "oczekiwanie" | "zrealizowany"; alert?: "7d" | "4d" };

const week: Record<number, Ev[]> = {
  0: [{ id: "TR-238", klient: "AgroFarm", ton: 8, miasto: "Radom", status: "oczekiwanie" }],
  1: [{ id: "TR-240", klient: "Anna Zielińska", ton: 5, miasto: "Lublin", status: "planowany" }],
  3: [{ id: "TR-241", klient: "Drob-Pol", ton: 24, miasto: "Goleniów", status: "planowany", alert: "4d" }],
  4: [{ id: "TR-243", klient: "Piotr Nowak", ton: 3, miasto: "Złoty Stok", status: "planowany", alert: "7d" }],
  5: [{ id: "TR-245", klient: "GastroPl", ton: 3, miasto: "Szczecin", status: "planowany" }],
};

const statusColor = {
  planowany: "bg-info/15 text-info border-info/30",
  oczekiwanie: "bg-warning/15 text-warning-foreground border-warning/40",
  zrealizowany: "bg-success/15 text-success border-success/30",
} as const;

function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Kalendarz transportów"
        description="Alerty 7-dni i 4-dni idą automatycznie na Telegram. Niedziela → alert przenoszony na poniedziałek rano."
        actions={
          <Button variant="outline">
            <Send className="mr-2 h-4 w-4" /> Wyślij raport tygodniowy
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bieżący tydzień · 15–21.09</CardTitle>
            <CardDescription>Poniedziałek – niedziela, mapowane na polskie nazwy dni.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {dni.map((d, i) => (
                <div key={d} className="rounded-lg border bg-card min-h-[160px] flex flex-col">
                  <div className={`px-3 py-2 border-b border-border/60 ${i === 6 ? "text-muted-foreground" : ""}`}>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{d}</div>
                    <div className="font-display font-semibold">{daty[i]}</div>
                  </div>
                  <div className="p-2 space-y-2 flex-1">
                    {(week[i] || []).map((ev) => (
                      <div key={ev.id} className={`rounded-md border p-2 text-xs ${statusColor[ev.status]}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{ev.id}</span>
                          {ev.alert && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-primary/40 text-primary">
                              <Bell className="mr-0.5 h-2.5 w-2.5" /> {ev.alert}
                            </Badge>
                          )}
                        </div>
                        <div className="font-medium mt-0.5 text-foreground">{ev.klient}</div>
                        <div className="text-muted-foreground">{ev.ton} t · {ev.miasto}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" /> Kolejka alertów Telegram
              </CardTitle>
              <CardDescription>Kanał PELLET_CHAT_ID · powiadomienia o 07:30</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AlertRow when="Dziś 16:00" what="TR-243 · Złoty Stok · 3 t" tag="7 dni przed" />
              <AlertRow when="Jutro 07:30" what="TR-241 · Goleniów · 24 t" tag="4 dni przed" />
              <AlertRow when="Pon 22.09 · 07:30" what="Raport tygodniowy 22–28.09" tag="Zestawienie" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logika czasowa</CardTitle>
              <CardDescription>Kiedy system wysyła powiadomienia</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>· <b>7 dni przed</b> — pierwsze przypomnienie do zespołu i klienta B2B.</p>
              <p>· <b>4 dni przed</b> — drugie przypomnienie, potwierdzenie okna dostawy.</p>
              <p>· <b>Logika niedzieli</b> — jeśli 3-dniowe przypomnienie wypada w niedzielę, alert idzie w poniedziałek rano zamiast weekendem.</p>
              <p>· <b>Poniedziałek 07:30</b> — automatyczny raport tygodniowy w polskim formacie (Pon–Nd).</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function AlertRow({ when, what, tag }: { when: string; what: string; tag: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <div className="text-xs text-muted-foreground">{when}</div>
        <div className="text-sm font-medium mt-0.5">{what}</div>
      </div>
      <Badge variant="secondary">{tag}</Badge>
    </div>
  );
}
