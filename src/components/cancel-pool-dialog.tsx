import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelPool } from "@/lib/pooling.functions";

type Props = {
  poolId: string | null;
  poolName?: string;
  onClose: () => void;
  onDone?: () => void;
};

export function CancelPoolDialog({ poolId, poolName, onClose, onDone }: Props) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelPool);
  const [releaseReservations, setReleaseReservations] = useState(false);
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      cancelFn({
        data: {
          id: poolId!,
          releaseReservations,
          reason: reason.trim() || null,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(
        r.released
          ? `Usunięto transport i anulowano ${r.leads} lead(y) (rezerwacje zwolnione).`
          : `Usunięto transport. ${r.leads} lead(y) wróciło do poczekalni.`,
      );
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      qc.invalidateQueries({ queryKey: ["transports"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stock-balance"] });
      setReleaseReservations(false);
      setReason("");
      onDone?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={!!poolId} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć wspólny transport?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Czy na pewno chcesz usunąć <strong>{poolName ?? "ten wspólny transport"}</strong>? Akcja wycofa
                przypisanie leadów do tej trasy. Powiązany transport z kalendarza zostanie usunięty.
              </p>
              <p className="text-sm">
                Domyślnie leady wracają do <strong>„Leady z rezerwacją"</strong> i pozostają zarezerwowane w magazynie —
                gotowe do wpięcia w inny transport.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="release-res"
              checked={releaseReservations}
              onCheckedChange={(v) => setReleaseReservations(!!v)}
            />
            <div className="grid gap-1 leading-tight">
              <Label htmlFor="release-res" className="cursor-pointer">
                Zwolnij również rezerwacje magazynowe (anuluj leady)
              </Label>
              <p className="text-xs text-muted-foreground">
                Zaznacz gdy klienci całkowicie rezygnują z zamówienia. Leady zostaną oznaczone jako „przegrany".
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="reason" className="text-xs">
              Powód (opcjonalnie — zapisany w audit logu)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. Przeplanowanie na przyszły tydzień, zmiana kierowcy…"
              rows={2}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mut.isPending}>Nie usuwaj</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
            disabled={mut.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mut.isPending ? "Usuwanie…" : "Usuń transport"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
