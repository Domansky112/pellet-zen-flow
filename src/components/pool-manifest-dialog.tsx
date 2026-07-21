import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Loader2,
  Truck,
  Printer,
  MapPin,
  Package,
  ExternalLink,
  User,
  Phone,
  Calendar as CalIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPoolManifest, confirmPool } from "@/lib/pooling.functions";

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Paleta pelletu (960 kg)",
  pellet_bigbag: "Big Bag pelletu (1000 kg)",
  inne: "Inne",
};

const PRODUCT_SHORT: Record<string, string> = {
  pellet_paleta: "Paleta",
  pellet_bigbag: "Big Bag",
  inne: "Inne",
};

export function PoolManifestDialog({
  poolId,
  onClose,
  onDone,
}: {
  poolId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const manifestFn = useServerFn(getPoolManifest);
  const confirmFn = useServerFn(confirmPool);

  const [date, setDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));
  const [time, setTime] = useState("08:00");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [zone, setZone] = useState("");

  const manifest = useQuery({
    queryKey: ["pool-manifest", poolId],
    queryFn: () => manifestFn({ data: { id: poolId! } }),
    enabled: !!poolId,
  });

  const isReadonly = manifest.data?.pool.status !== "draft";

  const mut = useMutation({
    mutationFn: () =>
      confirmFn({
        data: {
          id: poolId!,
          scheduled_date: date,
          scheduled_time: time || null,
          driver: driver || null,
          vehicle: vehicle || null,
          destination_zone: zone || null,
          reserve_stock: true,
        },
      }),
    onSuccess: () => {
      toast.success("Transport zaplanowany, magazyn zarezerwowany");
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      qc.invalidateQueries({ queryKey: ["transports"] });
      qc.invalidateQueries({ queryKey: ["stock-balances"] });
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalTons = useMemo(
    () => (manifest.data?.items ?? []).reduce((s, i) => s + i.tons, 0),
    [manifest.data],
  );

  const handlePrint = () => {
    if (!manifest.data) return;
    printManifest({
      pool: manifest.data.pool,
      items: manifest.data.items,
      aggregate: manifest.data.aggregate,
      scheduled_date: date,
      scheduled_time: time,
      driver,
      vehicle,
      zone,
    });
  };

  return (
    <Dialog open={!!poolId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            {manifest.data?.pool.name ?? "Wspólny transport"}
          </DialogTitle>
          <DialogDescription>
            {isReadonly
              ? "Podgląd transportu — dane zaplanowane. Możesz wydrukować list załadunkowy."
              : "Uzupełnij dane załadunku i zatwierdź — system utworzy transport i zarezerwuje magazyn."}
          </DialogDescription>
        </DialogHeader>

        {manifest.isLoading || !manifest.data ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-5">
              {/* Formularz organizacji */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="date" className="flex items-center gap-1.5 text-xs">
                    <CalIcon className="h-3.5 w-3.5" /> Data załadunku
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={isReadonly}
                  />
                </div>
                <div>
                  <Label htmlFor="time" className="text-xs">
                    Godzina załadunku
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={isReadonly}
                  />
                </div>
                <div>
                  <Label htmlFor="driver" className="flex items-center gap-1.5 text-xs">
                    <User className="h-3.5 w-3.5" /> Kierowca
                  </Label>
                  <Input
                    id="driver"
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    placeholder="Imię i nazwisko"
                    disabled={isReadonly}
                  />
                </div>
                <div>
                  <Label htmlFor="vehicle" className="flex items-center gap-1.5 text-xs">
                    <Truck className="h-3.5 w-3.5" /> Pojazd
                  </Label>
                  <Input
                    id="vehicle"
                    value={vehicle}
                    onChange={(e) => setVehicle(e.target.value)}
                    placeholder="np. Scania R450 · LUB 12345"
                    disabled={isReadonly}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="zone" className="flex items-center gap-1.5 text-xs">
                    <MapPin className="h-3.5 w-3.5" /> Strefa dostawy / kierunek
                  </Label>
                  <Input
                    id="zone"
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    placeholder={`np. ${manifest.data.pool.route_to}`}
                    disabled={isReadonly}
                  />
                </div>
              </section>

              <Separator />

              {/* Agregacja produktów */}
              <section>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Zestawienie załadunkowe
                </h3>
                <div className="rounded-lg border bg-primary/5 divide-y">
                  {manifest.data.aggregate.map((a) => (
                    <div
                      key={a.product}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <div className="font-medium text-sm">
                        {PRODUCT_LABEL[a.product] ?? a.product}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        {a.total_pieces !== null && (
                          <Badge variant="secondary" className="font-mono">
                            {a.total_pieces} szt
                          </Badge>
                        )}
                        <span className="font-mono font-semibold">
                          {a.total_tons.toFixed(3)} t
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 bg-primary/10 font-semibold">
                    <span>Łączna waga</span>
                    <span className="font-mono text-primary">
                      {totalTons.toFixed(3)} t / {manifest.data.pool.capacity_tons} t
                    </span>
                  </div>
                </div>
              </section>

              {/* Pozycje per lead */}
              <section>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Rozdział na klientów ({manifest.data.items.length})
                </h3>
                <div className="space-y-2">
                  {manifest.data.items.map((it, idx) => (
                    <div
                      key={it.item_id}
                      className="rounded-md border p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              #{idx + 1}
                            </Badge>
                            <span className="font-medium truncate">{it.lead_full_name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {it.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {it.phone}
                              </span>
                            )}
                            {(it.postal_code || it.city) && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {[it.postal_code, it.city].filter(Boolean).join(" ")}
                              </span>
                            )}
                          </div>
                          <div className="text-sm mt-2 font-medium text-primary">
                            {it.pieces !== null
                              ? `${it.pieces}× ${PRODUCT_SHORT[it.product] ?? it.product} (${it.piece_kg} kg)`
                              : PRODUCT_LABEL[it.product] ?? it.product}
                            <span className="text-muted-foreground font-normal ml-2">
                              = {it.tons} t
                            </span>
                          </div>
                        </div>
                        {it.lead_id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Otwórz leada"
                            onClick={() => {
                              onClose();
                              navigate({ to: "/crm", search: { leadId: it.lead_id ?? undefined } });
                            }}
                            className="shrink-0"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handlePrint} disabled={!manifest.data}>
            <Printer className="h-4 w-4 mr-2" /> Drukuj list załadunkowy
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
          {!isReadonly && (
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !manifest.data}>
              {mut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Zatwierdź i przygotuj do załadunku
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- print helper -----
function printManifest(args: {
  pool: { name: string; route_to: string };
  items: Array<{
    lead_full_name: string;
    phone: string | null;
    postal_code: string | null;
    city: string | null;
    product: string;
    tons: number;
    pieces: number | null;
    piece_kg: number | null;
  }>;
  aggregate: Array<{ product: string; total_tons: number; total_pieces: number | null }>;
  scheduled_date: string;
  scheduled_time: string;
  driver: string;
  vehicle: string;
  zone: string;
}) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) {
    toast.error("Zablokowano popup — zezwól na wyskakujące okna dla druku.");
    return;
  }
  const dateStr = args.scheduled_date
    ? format(new Date(args.scheduled_date), "d MMMM yyyy", { locale: pl })
    : "—";
  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8" />
<title>List załadunkowy — ${escapeHtml(args.pool.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #111; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #f6f6f6; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .summary { background: #fff4e6; padding: 12px 14px; border-radius: 6px; margin-top: 12px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin-top: 12px; font-size: 13px; }
  .grid div span { color: #666; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; gap: 40px; font-size: 12px; color: #555; }
  .sign div { flex: 1; border-top: 1px solid #999; padding-top: 6px; text-align: center; }
  @media print { body { padding: 12mm; } }
</style></head><body>
<h1>List załadunkowy</h1>
<div class="meta">Słoneczny Pellet · Witoroża 21-570 Drelów</div>

<div class="grid">
  <div><span>Transport:</span> <b>${escapeHtml(args.pool.name)}</b></div>
  <div><span>Trasa / strefa:</span> <b>${escapeHtml(args.zone || args.pool.route_to)}</b></div>
  <div><span>Data:</span> <b>${dateStr}</b></div>
  <div><span>Godzina:</span> <b>${escapeHtml(args.scheduled_time || "—")}</b></div>
  <div><span>Kierowca:</span> <b>${escapeHtml(args.driver || "—")}</b></div>
  <div><span>Pojazd:</span> <b>${escapeHtml(args.vehicle || "—")}</b></div>
</div>

<h2>Zestawienie zbiorcze</h2>
<table>
  <thead><tr><th>Produkt</th><th class="num">Ilość</th><th class="num">Waga</th></tr></thead>
  <tbody>
    ${args.aggregate
      .map(
        (a) => `<tr>
      <td>${escapeHtml(PRODUCT_LABEL[a.product] ?? a.product)}</td>
      <td class="num">${a.total_pieces !== null ? a.total_pieces + " szt" : "—"}</td>
      <td class="num">${a.total_tons.toFixed(3)} t</td>
    </tr>`,
      )
      .join("")}
  </tbody>
</table>
<div class="summary">Łączna waga: ${args.items.reduce((s, i) => s + i.tons, 0).toFixed(3)} t</div>

<h2>Rozdział na klientów</h2>
<table>
  <thead><tr><th style="width:32px">#</th><th>Klient</th><th>Adres</th><th>Produkt</th><th class="num">Waga</th></tr></thead>
  <tbody>
    ${args.items
      .map(
        (it, i) => `<tr>
      <td>${i + 1}</td>
      <td><b>${escapeHtml(it.lead_full_name)}</b>${it.phone ? "<br/><span style=\"color:#666\">" + escapeHtml(it.phone) + "</span>" : ""}</td>
      <td>${escapeHtml([it.postal_code, it.city].filter(Boolean).join(" ") || "—")}</td>
      <td>${
        it.pieces !== null
          ? `${it.pieces}× ${escapeHtml(PRODUCT_SHORT[it.product] ?? it.product)} (${it.piece_kg} kg)`
          : escapeHtml(PRODUCT_LABEL[it.product] ?? it.product)
      }</td>
      <td class="num">${it.tons} t</td>
    </tr>`,
      )
      .join("")}
  </tbody>
</table>

<div class="sign">
  <div>Wydał (magazynier)</div>
  <div>Odebrał (kierowca)</div>
</div>

<script>window.onload = () => { window.print(); }</script>
</body></html>`;
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
