import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { checkTransportConflicts, listPlanningFleet } from "@/lib/drafts.functions";

export const NONE = "__none__";

export const vehicleLabel = (v: any) =>
  [v.registration, [v.brand, v.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

export const driverLabel = (d: any) => [d.first_name, d.last_name].filter(Boolean).join(" ");

/** Wybór ciągnika i kierowcy z floty (lub „bez wyboru”). */
export function FleetPicker({
  driver,
  vehicle,
  onDriver,
  onVehicle,
  disabled,
}: {
  driver: string;
  vehicle: string;
  onDriver: (v: string) => void;
  onVehicle: (v: string) => void;
  disabled?: boolean;
}) {
  const fleetFn = useServerFn(listPlanningFleet);
  const fleet = useQuery({ queryKey: ["planning-fleet"], queryFn: () => fleetFn() });
  const vehicles = (fleet.data as any)?.vehicles ?? [];
  const drivers = (fleet.data as any)?.drivers ?? [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label>Ciągnik / pojazd</Label>
        <Select value={vehicle} onValueChange={onVehicle} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Bez wyboru" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Bez wyboru</SelectItem>
            {vehicles.map((v: any) => (
              <SelectItem key={v.id} value={vehicleLabel(v)}>
                {vehicleLabel(v)}
                {v.capacity_tons ? ` (${v.capacity_tons} t)` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Kierowca</Label>
        <Select value={driver} onValueChange={onDriver} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Bez wyboru" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Bez wyboru</SelectItem>
            {drivers.map((d: any) => (
              <SelectItem key={d.id} value={driverLabel(d)}>
                {driverLabel(d)}
                {d.phone ? ` · ${d.phone}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export type Conflicts = {
  sameDay: any[];
  driverConflicts: any[];
  vehicleConflicts: any[];
};

/**
 * Sprawdza kolizje terminów przed zapisem. Pierwszy klik pokazuje ostrzeżenie,
 * drugi klik zatwierdza mimo kolizji.
 */
export function useConflictGuard(date: string, driver: string, vehicle: string) {
  const conflictFn = useServerFn(checkTransportConflicts);
  const [conflicts, setConflicts] = useState<Conflicts | null>(null);
  const [checking, setChecking] = useState(false);

  // Zmiana terminu/zasobu resetuje potwierdzenie
  useEffect(() => {
    setConflicts(null);
  }, [date, driver, vehicle]);

  async function guard(submit: () => void) {
    if (conflicts) {
      submit();
      return;
    }
    setChecking(true);
    try {
      const res = (await conflictFn({
        data: {
          scheduled_date: date,
          driver: driver && driver !== NONE ? driver : null,
          vehicle: vehicle && vehicle !== NONE ? vehicle : null,
        },
      })) as unknown as Conflicts;
      if (res?.sameDay?.length) {
        setConflicts(res);
        return;
      }
    } catch {
      /* brak blokady, gdy sprawdzenie się nie powiedzie */
    } finally {
      setChecking(false);
    }
    submit();
  }

  return { conflicts, checking, guard, reset: () => setConflicts(null) };
}

export function ConflictWarning({ conflicts }: { conflicts: Conflicts | null }) {
  if (!conflicts || !conflicts.sameDay.length) return null;
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-1">
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" />
        Na ten dzień są już zaplanowane transporty ({conflicts.sameDay.length})
      </div>
      <ul className="list-disc pl-5 text-muted-foreground">
        {conflicts.sameDay.slice(0, 5).map((t: any) => (
          <li key={t.id}>
            {t.city ?? "—"}
            {t.driver ? ` · ${t.driver}` : ""}
            {t.vehicle ? ` · ${t.vehicle}` : ""}
          </li>
        ))}
      </ul>
      {(conflicts.driverConflicts.length > 0 || conflicts.vehicleConflicts.length > 0) && (
        <p className="text-destructive">
          Wybrany {conflicts.driverConflicts.length > 0 ? "kierowca" : "pojazd"} ma już kurs tego
          dnia — czy na pewno się wyrobi?
        </p>
      )}
      <p className="text-muted-foreground">Kliknij ponownie, aby zatwierdzić mimo to.</p>
    </div>
  );
}
