import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyPlus, Undo2 } from "lucide-react";

type RealizedLeaveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadLabel: string;
  quantity?: number | null;
  paymentAmount?: number | null;
  busy?: boolean;
  onDecision: (decision: "rollback" | "duplicate") => void;
};

export function RealizedLeaveDialog({
  open,
  onOpenChange,
  leadLabel,
  quantity,
  paymentAmount,
  busy,
  onDecision,
}: RealizedLeaveDialogProps) {
  const qty = quantity != null && Number(quantity) > 0 ? `${Number(quantity)} t` : null;
  const amount =
    paymentAmount != null && Number(paymentAmount) > 0
      ? `${Number(paymentAmount).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
      : null;
  const operations = [qty ? `wydanie z magazynu: ${qty}` : null, amount ? `rozliczenie: ${amount}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lead zrealizowany — co dalej?</DialogTitle>
          <DialogDescription>
            {leadLabel} ma już zapisane operacje{operations ? `: ${operations}` : ""}. Wybierz, jak
            obsłużyć zmianę statusu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecision("rollback")}
            className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:opacity-60"
          >
            <Undo2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <span>
              <span className="block font-medium">Cofnij operacje i zmień status</span>
              <span className="block text-sm text-muted-foreground">
                Towar wraca na stan magazynu (wydanie zostaje usunięte), rozliczenie płatności jest
                kasowane, a lead przechodzi na nowy status.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onDecision("duplicate")}
            className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:opacity-60"
          >
            <CopyPlus className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
            <span>
              <span className="block font-medium">Utwórz duplikat i zmień status</span>
              <span className="block text-sm text-muted-foreground">
                Tworzy powtórne zamówienie z danymi klienta. Bieżący lead zmienia status, a wydanie i
                płatność pozostają bez zmian.
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
