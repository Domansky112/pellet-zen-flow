import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Plus } from "lucide-react";

const BASE_LAT = 51.9861;
const BASE_LNG = 22.9575;

const PRODUCT_LABEL: Record<string, string> = {
  pellet_paleta: "Pellet — Paleta",
  pellet_bigbag: "Pellet — Big Bag",
  inne: "Inne",
};

export type MapPoint = {
  id: string;
  name: string;
  city: string | null;
  postal_code?: string | null;
  product: string | null;
  quantity: number | null;
  lat: number;
  lng: number;
  has_unloading_equipment?: boolean | null;
  status?: string | null;
  priority?: string | null;
  kind: "waitlist" | "assigned" | "pending";
};

function makeIcon(color: string) {
  return L.divIcon({
    className: "pooling-map-pin",
    html: `<div style="
      background:${color};
      width:22px;height:22px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });
}

const ICONS = {
  waitlist: makeIcon("#2563eb"), // niebieski
  assigned: makeIcon("#16a34a"), // zielony
  pending: makeIcon("#eab308"), // żółty
  urgent: makeIcon("#f97316"), // pomarańczowy
  base: makeIcon("#dc2626"), // baza
};

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    if (points.length === 0) return;
    const b = L.latLngBounds([[BASE_LAT, BASE_LNG], ...points.map((p) => [p.lat, p.lng] as [number, number])]);
    map.fitBounds(b.pad(0.15));
    first.current = false;
  }, [points, map]);
  return null;
}

export default function PoolingMap({
  points,
  selectedPoolId,
  onAssignToPool,
  onOpenLead,
}: {
  points: MapPoint[];
  selectedPoolId: string | null;
  onAssignToPool: (leadId: string) => void;
  onOpenLead: (leadId: string) => void;
}) {
  const valid = useMemo(() => points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)), [points]);

  return (
    <div className="h-[520px] w-full rounded-md overflow-hidden border">
      <MapContainer
        center={[52.1, 19.4]}
        zoom={6}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={valid} />

        <Marker position={[BASE_LAT, BASE_LNG]} icon={ICONS.base}>
          <Popup>
            <div className="text-xs">
              <b>Baza — Witoroża</b>
              <br />
              21-570 Drelów
            </div>
          </Popup>
        </Marker>

        {valid.map((p) => {
          const icon =
            p.kind === "assigned"
              ? ICONS.assigned
              : p.kind === "pending"
                ? ICONS.pending
                : p.priority === "wysoki" || p.status === "w_kontakcie"
                  ? ICONS.urgent
                  : ICONS.waitlist;
          return (
            <Marker key={`${p.kind}-${p.id}`} position={[p.lat, p.lng]} icon={icon}>
              <Popup>
                <div className="text-xs space-y-1 min-w-[220px]">
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-muted-foreground">
                    {[p.postal_code, p.city].filter(Boolean).join(" ") || "—"}
                  </div>
                  <div>
                    <b>{p.quantity ?? "?"} t</b> · {PRODUCT_LABEL[p.product ?? ""] ?? p.product ?? "—"}
                  </div>
                  <div>
                    Rozładunek własny:{" "}
                    <Badge variant={p.has_unloading_equipment ? "default" : "outline"}>
                      {p.has_unloading_equipment ? "TAK" : "NIE"}
                    </Badge>
                  </div>
                  <div className="flex gap-1 pt-2">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onOpenLead(p.id)}>
                      <ExternalLink className="h-3 w-3 mr-1" /> Lead
                    </Button>
                    {p.kind !== "assigned" && (
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={!selectedPoolId}
                        title={selectedPoolId ? "Dodaj do wybranego draftu" : "Wybierz draft transportu poniżej"}
                        onClick={() => onAssignToPool(p.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Dopisz
                      </Button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
