import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getTransportById } from "@/lib/transport-crud.functions";
import { Truck, MapPin, User, Calendar, Package } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

const productLabel: Record<string, string> = {
  pellet_paleta: "Pellet paleta",
  pellet_bigbag: "Pellet big-bag",
  inne: "Inne",
};

export function TransportDetailDialog({
  transportId,
  open,
  onOpenChange,
}: {
  transportId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ["transport-detail", transportId],
    queryFn: () => getTransportById({ data: { id: transportId! } }),
    enabled: open && !!transportId,
  });

  const t = q.data as any;
  const items = (t?.transport_items ?? []) as any[];
  const totalT = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Transport {t?.pool_id ? "wspólny" : "indywidualny"}
          </DialogTitle>
          <DialogDescription>
            {q.isLoading ? "Ładowanie…" : q.error ? "Nie udało się załadować." : t?.city}
          </DialogDescription>
        </DialogHeader>

        {t && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Data
                </div>
                <div className="font-medium">
                  {t.scheduled_date ? format(new Date(t.scheduled_date), "d MMM yyyy", { locale: pl }) : "—"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase">Status</div>
                <Badge variant="outline" className="mt-1">{t.status ?? "—"}</Badge>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                  <User className="h-3 w-3" /> Kierowca
                </div>
                <div>{t.driver || "—"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase">Pojazd</div>
                <div>{t.vehicle || "—"}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Trasa / adresy rozładunku
              </div>
              <div className="rounded-md border p-3 whitespace-pre-wrap">
                {t.destination_address || t.city}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <Package className="h-3 w-3" /> Pozycje ({items.length}) · łącznie {totalT.toFixed(2)} t
              </div>
              <div className="rounded-md border divide-y">
                {items.map((i) => (
                  <div key={i.id} className="p-2 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {i.leads
                          ? [i.leads.first_name, i.leads.last_name].filter(Boolean).join(" ") || i.leads.name
                          : "—"}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {i.address || [i.leads?.postal_code, i.leads?.city].filter(Boolean).join(" ") || "—"}
                        {i.leads?.phone ? ` · ${i.leads.phone}` : ""}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="font-medium">{Number(i.quantity).toFixed(2)} t</div>
                      <div className="text-muted-foreground">{productLabel[i.product] ?? i.product}</div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">Brak pozycji.</div>
                )}
              </div>
            </div>

            {t.notes && (
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">Notatki</div>
                <div className="rounded-md border p-3 whitespace-pre-wrap text-muted-foreground">{t.notes}</div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
