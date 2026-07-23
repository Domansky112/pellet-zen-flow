import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, PackageOpen, Wallet } from "lucide-react";

export type SettlementResult = {
  payment_amount_gross: number;
  payment_method: "gotowka" | "karta_blik" | "przelew";
  collected_on_site: boolean;
};

const methodLabel: Record<SettlementResult["payment_method"], string> = {
  gotowka: "Gotówka u kierowcy",
  karta_blik: "Karta / BLIK u kierowcy",
  przelew: "Przelew bankowy",
};

export function SettlementDialog({
  open,
  onOpenChange,
  leadName,
  quantity,
  defaultAmount,
  defaultMethod,
  submitting,
  onConfirm,
  title = "Rozliczenie zamówienia",
  description = "Podaj ostateczną kwotę, jaką zapłacił / ma zapłacić klient za to zamówienie.",
  confirmLabel = "Zatwierdź i przenieś do Zrealizowanych",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadName?: string | null;
  quantity?: number | null;
  defaultAmount?: number | null;
  defaultMethod?: SettlementResult["payment_method"] | null;
  submitting?: boolean;
  onConfirm: (r: SettlementResult) => void | Promise<void>;
  title?: string;
  description?: string;
  confirmLabel?: string;
}) {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<SettlementResult["payment_method"]>("gotowka");
  const [collected, setCollected] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(defaultAmount != null && Number.isFinite(defaultAmount) ? String(defaultAmount) : "");
      setMethod(defaultMethod ?? "gotowka");
      setCollected(true);
      setError(null);
    }
  }, [open, defaultAmount, defaultMethod]);

  useEffect(() => {
    // przelew defaults to "oczekuje" (nie pobrane na miejscu)
    if (method === "przelew") setCollected(false);
    else setCollected(true);
  }, [method]);

  const submit = async () => {
    const raw = amount.trim().replace(",", ".");
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0) {
      setError("Podaj poprawną kwotę (liczba ≥ 0).");
      return;
    }
    setError(null);
    await onConfirm({ payment_amount_gross: n, payment_method: method, collected_on_site: collected });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!submitting ? onOpenChange(o) : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
            {(leadName || quantity != null) && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {leadName ? <span className="font-medium text-foreground">{leadName}</span> : null}
                {quantity != null ? ` · ${quantity} t` : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="settlement-amount">Kwota ostateczna (Brutto) [PLN]</Label>
            <Input
              id="settlement-amount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            {defaultAmount != null && (
              <p className="text-[11px] text-muted-foreground">
                Wartość wstępna z kalkulatora / oferty — możesz ją zmienić.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Forma płatności</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as SettlementResult["payment_method"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gotowka">{methodLabel.gotowka}</SelectItem>
                <SelectItem value="karta_blik">{methodLabel.karta_blik}</SelectItem>
                <SelectItem value="przelew">{methodLabel.przelew}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="collected" className="text-sm font-medium">
                {collected ? "Płatność pobrana na miejscu" : "Oczekuje na przelew"}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {collected
                  ? "Środki fizycznie odebrane od klienta."
                  : "Płatność jeszcze nie wpłynęła — pojawi się w oczekujących."}
              </p>
            </div>
            <Switch id="collected" checked={collected} onCheckedChange={setCollected} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Anuluj
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageOpen className="h-4 w-4 mr-2" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
