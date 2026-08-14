import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileDown, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getFinancialReport } from "@/lib/report.functions";

type Variant = "summary" | "full";
type Preset = "current_month" | "prev_month" | "quarter" | "custom";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "prev_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(from), to: iso(to) };
  }
  if (preset === "quarter") {
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: iso(from), to: iso(now) };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(from), to: iso(now) };
}

export function FinancialReportDialog({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<Variant>("summary");
  const [preset, setPreset] = useState<Preset>("current_month");
  const [custom, setCustom] = useState({
    from: defaultFrom ?? presetRange("current_month").from,
    to: defaultTo ?? presetRange("current_month").to,
  });
  const [anonymize, setAnonymize] = useState(false);
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  const fetchReport = useServerFn(getFinancialReport);
  const range = preset === "custom" ? custom : presetRange(preset);

  const run = async (mode: "download" | "print") => {
    setBusy(mode);
    try {
      const data = await fetchReport({ data: { from: range.from, to: range.to, anonymize } });
      const { buildReportPdf, reportFileName } = await import("@/lib/pdf-report");
      const doc = await buildReportPdf(data as any, variant);
      if (mode === "download") {
        doc.save(reportFileName(data as any, variant));
        toast.success("Raport PDF pobrany");
      } else {
        const url = doc.output("bloburl");
        window.open(url as unknown as string, "_blank");
      }
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się wygenerować raportu");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileDown className="h-4 w-4 mr-2" />
          Generuj Raport PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raport finansowo-operacyjny</DialogTitle>
          <DialogDescription>
            Wybierz zakres i typ raportu — dokument A4 z KPI, wolumenem, magazynem i cashflow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Typ raportu</Label>
            <Select value={variant} onValueChange={(v) => setVariant(v as Variant)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Skrócony (Executive Summary — 1 strona A4)</SelectItem>
                <SelectItem value="full">Pełny (szczegółowy, z tabelą zleceń)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Zakres dat</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Bieżący miesiąc</SelectItem>
                <SelectItem value="prev_month">Poprzedni miesiąc</SelectItem>
                <SelectItem value="quarter">Ostatni kwartał (3 miesiące)</SelectItem>
                <SelectItem value="custom">Własny zakres</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Od</Label>
                <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Do</Label>
                <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border p-3">
            <Checkbox
              id="anon"
              checked={anonymize}
              onCheckedChange={(v) => setAnonymize(v === true)}
            />
            <Label htmlFor="anon" className="text-sm font-normal leading-snug">
              Ukryj dane wrażliwe klientów
              <span className="block text-xs text-muted-foreground">
                W tabeli zleceń zostaną tylko numer zlecenia oraz miasto / kod pocztowy.
              </span>
            </Label>
          </div>

          <p className="text-xs text-muted-foreground">
            Zakres: {range.from} → {range.to}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => run("print")} disabled={busy !== null}>
            {busy === "print" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            Drukuj / Podgląd
          </Button>
          <Button onClick={() => run("download")} disabled={busy !== null}>
            {busy === "download" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Pobierz plik PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
