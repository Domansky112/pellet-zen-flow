import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addMonths,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Printer, Trash2, Wallet } from "lucide-react";
import {
  deleteWorkLog,
  getProductionHint,
  listAllWorkLogs,
  listEmployees,
  listWorkLogs,
  postPayrollToExpenses,
  saveWorkLog,
} from "@/lib/employees.functions";

const TYPE_LABEL: Record<string, string> = {
  dniowka: "Dniówka",
  akord: "Akord (od palety)",
  wolne: "Dzień wolny",
  nieobecnosc: "Nieobecność",
};

const TYPE_CLASS: Record<string, string> = {
  dniowka: "bg-primary/15 text-primary border-primary/30",
  akord: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  wolne: "bg-muted text-muted-foreground border-border",
  nieobecnosc: "bg-destructive/15 text-destructive border-destructive/30",
};

const pln = (n: number) => n.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function EmployeeCalendarTab() {
  const qc = useQueryClient();
  const employeesFn = useServerFn(listEmployees);
  const logsFn = useServerFn(listWorkLogs);
  const payrollFn = useServerFn(postPayrollToExpenses);

  const [employeeId, setEmployeeId] = useState<string>("");
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => employeesFn() });
  const selected = employees.find((e: any) => e.id === employeeId);

  const from = iso(startOfMonth(month));
  const to = iso(endOfMonth(month));

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["work-logs", employeeId, from],
    queryFn: () => logsFn({ data: { employee_id: employeeId, from, to } }),
    enabled: !!employeeId,
  });

  const byDate = useMemo(() => {
    const m: Record<string, any> = {};
    for (const l of logs as any[]) m[l.work_date] = l;
    return m;
  }, [logs]);

  const summary = useMemo(() => {
    const worked = (logs as any[]).filter((l) => l.entry_type === "dniowka" || l.entry_type === "akord");
    return {
      days: worked.length,
      pallets: (logs as any[]).reduce((s, l) => s + Number(l.pallets_count ?? 0), 0),
      total: (logs as any[]).reduce((s, l) => s + Number(l.amount ?? 0), 0),
      unpaid: (logs as any[])
        .filter((l) => l.status === "do_wyplaty")
        .reduce((s, l) => s + Number(l.amount ?? 0), 0),
    };
  }, [logs]);

  const payroll = useMutation({
    mutationFn: () => payrollFn({ data: { employee_id: employeeId, from, to } }),
    onSuccess: (r: any) => {
      toast.success(`Zaksięgowano ${pln(r.amount)} jako koszt „Wynagrodzenia i Robocizna”`);
      qc.invalidateQueries({ queryKey: ["work-logs"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["financial-summary"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // siatka miesiąca (poniedziałek jako pierwszy dzień)
  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const lead = (getDay(start) + 6) % 7;
    const out: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= end.getDate(); d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    return out;
  }, [month]);

  function printPayslip() {
    if (!selected) return;
    const rows = (logs as any[])
      .filter((l) => Number(l.amount) > 0)
      .map(
        (l) =>
          `<tr><td>${l.work_date}</td><td>${TYPE_LABEL[l.entry_type]}</td><td style="text-align:right">${
            l.entry_type === "akord" ? Number(l.pallets_count) : "—"
          }</td><td style="text-align:right">${Number(l.amount).toFixed(2)} zł</td><td>${
            l.status === "wyplacone" ? "Wypłacone" : "Do wypłaty"
          }</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kwit wypłaty — ${selected.full_name}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border:1px solid #ddd;padding:6px 8px}th{background:#f5f5f5;text-align:left}.sum{margin-top:16px;font-size:16px;font-weight:600}</style>
</head><body>
<h1>Kwit wypłaty — ${selected.full_name}</h1>
<div>Okres: ${from} → ${to}${selected.position ? ` · ${selected.position}` : ""}</div>
<table><thead><tr><th>Data</th><th>Typ</th><th>Palety</th><th>Kwota</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sum">Dni pracy: ${summary.days} · Palety: ${summary.pallets} · Razem: ${summary.total.toFixed(2)} zł</div>
<p style="margin-top:48px">Podpis pracownika: ..............................</p>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Kalendarz pracowniczy i rozliczenia
          </CardTitle>
          <CardDescription>
            Rozliczaj dni pracy (dniówka / akord) i księguj wynagrodzenia jako koszt w module Płatności.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 space-y-1">
              <Label>Pracownik</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz pracownika…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Brak pracowników — dodaj ich w „Użytkownicy CRM → Pracownicy fizyczni”.
                    </div>
                  )}
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                      {e.position ? ` · ${e.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-44 text-center font-medium capitalize">
                {format(month, "LLLL yyyy", { locale: pl })}
              </div>
              <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
                Dziś
              </Button>
            </div>
          </div>

          {employeeId && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Przepracowane dni" value={String(summary.days)} />
              <Kpi label="Spakowane palety" value={summary.pallets.toLocaleString("pl-PL")} />
              <Kpi label="Kwota miesiąca" value={pln(summary.total)} />
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-xs text-muted-foreground">Do wypłaty: {pln(summary.unpaid)}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={printPayslip}>
                    <Printer className="h-4 w-4 mr-1" /> Kwit
                  </Button>
                  <Button
                    size="sm"
                    disabled={summary.unpaid <= 0 || payroll.isPending}
                    onClick={() => {
                      if (confirm(`Zaksięgować ${pln(summary.unpaid)} jako koszt wynagrodzeń?`)) payroll.mutate();
                    }}
                  >
                    {payroll.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wallet className="h-4 w-4 mr-1" />}
                    Księguj
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!employeeId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Wybierz pracownika, aby zobaczyć jego kalendarz rozliczeń.
            </p>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-muted-foreground">
                {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d, i) =>
                  d === null ? (
                    <div key={`e${i}`} />
                  ) : (
                    <button
                      key={iso(d)}
                      type="button"
                      onClick={() => setDayOpen(iso(d))}
                      className={`min-h-20 rounded-md border p-1.5 text-left transition hover:border-primary ${
                        isSameDay(d, new Date()) ? "border-primary" : "border-border"
                      }`}
                    >
                      <div className="text-xs font-medium">{d.getDate()}</div>
                      {byDate[iso(d)] && (
                        <div className="mt-1 space-y-1">
                          <Badge variant="outline" className={`text-[10px] ${TYPE_CLASS[byDate[iso(d)].entry_type]}`}>
                            {TYPE_LABEL[byDate[iso(d)].entry_type]}
                          </Badge>
                          {Number(byDate[iso(d)].amount) > 0 && (
                            <div className="text-[11px] font-medium">{pln(Number(byDate[iso(d)].amount))}</div>
                          )}
                          {byDate[iso(d)].status === "wyplacone" && (
                            <div className="text-[10px] text-emerald-600">wypłacone</div>
                          )}
                        </div>
                      )}
                    </button>
                  ),
                )}
              </div>
              {isLoading && <p className="pt-3 text-xs text-muted-foreground">Ładowanie…</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {dayOpen && selected && (
        <DayDialog
          date={dayOpen}
          employee={selected}
          log={byDate[dayOpen] ?? null}
          onClose={() => setDayOpen(null)}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function DayDialog({
  date,
  employee,
  log,
  onClose,
}: {
  date: string;
  employee: any;
  log: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveWorkLog);
  const delFn = useServerFn(deleteWorkLog);
  const hintFn = useServerFn(getProductionHint);

  const [type, setType] = useState<string>(log?.entry_type ?? "dniowka");
  const [pallets, setPallets] = useState<string>(String(log?.pallets_count ?? 0));
  const [rate, setRate] = useState<string>(
    String(log?.rate ?? (type === "akord" ? employee.pallet_rate : employee.daily_rate) ?? 0),
  );
  const [status, setStatus] = useState<string>(log?.status ?? "do_wyplaty");
  const [notes, setNotes] = useState<string>(log?.notes ?? "");

  const { data: hint } = useQuery({
    queryKey: ["production-hint", date],
    queryFn: () => hintFn({ data: { date } }),
    enabled: type === "akord",
  });

  const num = (s: string) => Number(s.replace(",", ".")) || 0;
  const amount = type === "akord" ? num(pallets) * num(rate) : type === "dniowka" ? num(rate) : 0;

  function onTypeChange(v: string) {
    setType(v);
    if (v === "akord") setRate(String(employee.pallet_rate ?? 0));
    if (v === "dniowka") setRate(String(employee.daily_rate ?? 0));
  }

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          employee_id: employee.id,
          work_date: date,
          entry_type: type as any,
          pallets_count: num(pallets),
          rate: num(rate),
          status: status as any,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Zapisano rozliczenie dnia");
      qc.invalidateQueries({ queryKey: ["work-logs"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id: log.id } }),
    onSuccess: () => {
      toast.success("Usunięto wpis");
      qc.invalidateQueries({ queryKey: ["work-logs"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {employee.full_name} · {format(parseISO(date), "EEEE, d LLLL yyyy", { locale: pl })}
          </DialogTitle>
          <DialogDescription>Rozliczenie dnia pracy.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Typ rozliczenia</Label>
            <Select value={type} onValueChange={onTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "dniowka" && (
            <div className="space-y-1">
              <Label>Kwota dniówki (zł)</Label>
              <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
              <p className="text-xs text-muted-foreground">
                Domyślna stawka z profilu: {pln(Number(employee.daily_rate ?? 0))}
              </p>
            </div>
          )}

          {type === "akord" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Stawka za paletę (zł)</Label>
                  <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <Label>Ilość spakowanych palet</Label>
                  <Input value={pallets} onChange={(e) => setPallets(e.target.value)} inputMode="decimal" />
                </div>
              </div>
              {hint && hint.entries > 0 && (
                <p className="text-xs text-muted-foreground">
                  📦 Logi produkcji z tego dnia: przyjęcia palet {hint.tons.toLocaleString("pl-PL")} t ({hint.entries} wpisów).
                </p>
              )}
            </>
          )}

          {(type === "dniowka" || type === "akord") && (
            <div className="rounded-md border border-border p-3 text-sm">
              Kwota dnia: <span className="font-semibold">{pln(amount)}</span>
            </div>
          )}

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="do_wyplaty">Do wypłaty</SelectItem>
                <SelectItem value="wyplacone">Wypłacone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Notatka / uwagi</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {log && (
            <Button variant="outline" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Usuń wpis
            </Button>
          )}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
