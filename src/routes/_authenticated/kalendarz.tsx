import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { pl } from "date-fns/locale";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  createTransport,
  deleteTransport,
  listTransports,
} from "@/lib/transport-crud.functions";
import { listLeads } from "@/lib/leads.functions";

export const Route = createFileRoute("/_authenticated/kalendarz")({
  head: () => ({
    meta: [
      { title: "Kalendarz transportów — Słoneczny Pellet OS" },
      {
        name: "description",
        content: "Planowanie transportów z rezerwacją magazynu i alertami Telegram T-7 / T-4.",
      },
    ],
  }),
  component: CalendarPage,
});

const productLabel: Record<string, string> = {
  pellet_paleta: "Pellet — paleta",
  pellet_bigbag: "Pellet — big bag",
  
  inne: "Inne",
};

function CalendarPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTransports);
  const delFn = useServerFn(deleteTransport);

  const { data: transports = [], isLoading } = useQuery({
    queryKey: ["transports"],
    queryFn: () => listFn(),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Transport usunięty");
      qc.invalidateQueries({ queryKey: ["transports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = transports.filter(
    (t) => parseISO(t.scheduled_date) >= today,
  );
  const past = transports.filter(
    (t) => parseISO(t.scheduled_date) < today,
  );

  return (
    <>
      <PageHeader
        title="Kalendarz transportów"
        description="Planowane odbiory z automatyczną rezerwacją magazynu i alertami Telegram T-7 / T-4."
        actions={<NewTransportDialog />}
      />
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Nadchodzące ({upcoming.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Ładuję…</p>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Brak zaplanowanych transportów. Kliknij „Nowy transport" żeby dodać.
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((t) => (
                  <TransportRow key={t.id} t={t} onDelete={(id) => del.mutate(id)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {past.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground">Historia ({past.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {past.slice(0, 20).map((t) => (
                <TransportRow key={t.id} t={t} onDelete={(id) => del.mutate(id)} muted />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

type TransportRow = Awaited<ReturnType<typeof listTransports>>[number];

function TransportRow({
  t,
  onDelete,
  muted,
}: {
  t: TransportRow;
  onDelete: (id: string) => void;
  muted?: boolean;
}) {
  const daysLeft = differenceInCalendarDays(parseISO(t.scheduled_date), new Date());
  const item = t.transport_items?.[0];
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border border-border p-3 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">
            {format(parseISO(t.scheduled_date), "EEE, d LLL yyyy", { locale: pl })}
          </span>
          {!muted && daysLeft >= 0 && (
            <Badge variant="outline">
              {daysLeft === 0 ? "dziś" : `T-${daysLeft}`}
            </Badge>
          )}
          <Badge variant="secondary">{t.city}</Badge>
          {item && (
            <Badge variant="outline">
              {Number(item.quantity)} t · {productLabel[item.product] ?? item.product}
            </Badge>
          )}
          {t.telegram_t7_sent_at && (
            <Badge className="bg-info/15 text-info border-info/30">
              <Bell className="h-3 w-3 mr-1" /> T-7 wysłany
            </Badge>
          )}
          {t.telegram_t4_sent_at && (
            <Badge className="bg-warning/15 text-warning-foreground border-warning/40">
              <Bell className="h-3 w-3 mr-1" /> T-4 wysłany
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground truncate">
          📍 {t.destination_address ?? "—"}
          {t.driver && ` · Kierowca: ${t.driver}`}
          {item?.leads?.name && ` · Lead: ${item.leads.name}`}
        </div>
        {t.notes && <div className="text-xs text-muted-foreground">📝 {t.notes}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <WzDownloadButton transportId={t.id} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (confirm(`Usunąć transport ${t.scheduled_date} → ${t.city}?`)) onDelete(t.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function NewTransportDialog() {
  const qc = useQueryClient();
  const createFn = useServerFn(createTransport);
  const leadsFn = useServerFn(listLeads);
  const [open, setOpen] = useState(false);

  const [scheduledDate, setScheduledDate] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [destination, setDestination] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [product, setProduct] = useState<"pellet_paleta" | "pellet_bigbag" | "inne">(
    "pellet_bigbag",
  );
  const [quantity, setQuantity] = useState<number>(20);
  const [leadId, setLeadId] = useState<string>("none");
  const [reserveStock, setReserveStock] = useState(true);
  const [notes, setNotes] = useState("");

  const { data: leads = [] } = useQuery({
    queryKey: ["leads", "for-transport"],
    queryFn: () => leadsFn(),
    enabled: open,
  });

  const openLeads = leads.filter((l) =>
    ["nowy", "w_kontakcie", "oferta"].includes(l.status as string),
  );

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          scheduled_date: scheduledDate,
          city,
          postal_code: postalCode || null,
          destination_address: destination,
          driver: driver || null,
          vehicle: vehicle || null,
          notes: notes || null,
          product,
          quantity,
          lead_id: leadId === "none" ? null : leadId,
          reserve_stock: reserveStock,
        },
      }),
    onSuccess: () => {
      toast.success("Transport dodany + rezerwacja magazynu");
      qc.invalidateQueries({ queryKey: ["transports"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      setOpen(false);
      // reset
      setScheduledDate("");
      setCity("");
      setPostalCode("");
      setDestination("");
      setDriver("");
      setVehicle("");
      setQuantity(20);
      setLeadId("none");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    scheduledDate && city && destination && quantity > 0 && !create.isPending;

  const onLeadChange = (value: string) => {
    setLeadId(value);
    if (value !== "none") {
      const lead = openLeads.find((l) => l.id === value);
      if (lead) {
        if (lead.city) setCity(lead.city);
        if (lead.quantity) setQuantity(Number(lead.quantity));
        if (lead.product) {
          const map: Record<string, typeof product> = {
            pellet_paleta: "pellet_paleta",
            pellet_bigbag: "pellet_bigbag",
            inne: "inne",
          };
          if (map[lead.product]) setProduct(map[lead.product]);
        }
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Nowy transport
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowy transport</DialogTitle>
          <DialogDescription>
            System automatycznie zarezerwuje towar w magazynie i zaplanuje alerty Telegram T-7 / T-4.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Powiąż z leadem (opcjonalnie — auto-uzupełni miasto/tony/produkt)</Label>
            <Select value={leadId} onValueChange={onLeadChange}>
              <SelectTrigger>
                <SelectValue placeholder="Bez leada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— brak —</SelectItem>
                {openLeads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} {l.city ? `· ${l.city}` : ""}{" "}
                    {l.quantity ? `· ${Number(l.quantity)} t` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Data odbioru *</Label>
              <Input
                id="date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Miasto *</Label>
              <Input
                id="city"
                placeholder="np. Wrocław"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dest">Miejsce odbioru — pełny adres *</Label>
            <Input
              id="dest"
              placeholder="np. ul. Legnicka 55, 54-203 Wrocław"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Dokładny adres pod GPS/nawigację dla kierowcy.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="postal">Kod pocztowy</Label>
              <Input
                id="postal"
                placeholder="54-203"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver">Kierowca</Label>
              <Input
                id="driver"
                placeholder="Jan Kowalski"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle">Pojazd</Label>
              <Input
                id="vehicle"
                placeholder="WB 12345"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Produkt *</Label>
              <Select value={product} onValueChange={(v) => setProduct(v as typeof product)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pellet_bigbag">Pellet — big bag</SelectItem>
                  <SelectItem value="pellet_paleta">Pellet — paleta</SelectItem>
                  
                  <SelectItem value="inne">Inne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qty">Tonaż (t) *</Label>
              <Input
                id="qty"
                type="number"
                step={0.5}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reserveStock}
              onChange={(e) => setReserveStock(e.target.checked)}
            />
            Zarezerwuj towar w magazynie od razu
          </label>

          <div className="space-y-2">
            <Label htmlFor="notes">Notatki</Label>
            <Textarea
              id="notes"
              placeholder="Uwagi dla kierowcy, godzina odbioru, kontakt…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Anuluj
          </Button>
          <Button disabled={!canSubmit} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Utwórz transport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
