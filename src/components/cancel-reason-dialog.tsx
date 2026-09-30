import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CancelReasonDialog({
  open,
  onOpenChange,
  leadLabel,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadLabel: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const ok = reason.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anulowanie leada</DialogTitle>
          <DialogDescription>
            {leadLabel} — dodaj komentarz, dlaczego lead jest anulowany. Zapisze się w notatkach leada.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={4}
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
          placeholder="np. klient kupił gdzie indziej, za drogi transport…"
        />
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Wróć
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => onConfirm(reason.trim())}>
            Anuluj lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
