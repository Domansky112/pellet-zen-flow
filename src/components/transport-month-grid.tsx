import { useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransportDetailDialog } from "@/components/transport-detail-dialog";

type T = {
  id: string;
  scheduled_date: string;
  city: string | null;
  transport_items?: any[] | null;
};

export function TransportMonthGrid({ transports }: { transports: T[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);

  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const byDay = new Map<string, T[]>();
  for (const t of transports) {
    const k = t.scheduled_date.slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const today = new Date();
  const weekdays = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold capitalize">
            {format(month, "LLLL yyyy", { locale: pl })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Dziś
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {weekdays.map((w) => (
          <div key={w} className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(format(d, "yyyy-MM-dd")) ?? [];
          const inMonth = isSameMonth(d, month);
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`min-h-[96px] bg-card p-1.5 ${inMonth ? "" : "opacity-40"}`}
            >
              <div
                className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
                }`}
              >
                {format(d, "d")}
              </div>
              <div className="space-y-1">
                {list.map((t) => {
                  const items = t.transport_items ?? [];
                  const tons = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
                  const name = items.length === 1 ? items[0]?.leads?.name : `${items.length} leadów`;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelected(t.id)}
                      className="block w-full truncate rounded border border-primary/30 bg-primary/10 px-1.5 py-1 text-left text-[11px] leading-tight text-foreground hover:bg-primary/20"
                      title={`${t.city ?? ""} · ${tons} t`}
                    >
                      <span className="font-medium">{t.city ?? "—"}</span>
                      <span className="text-muted-foreground"> · {tons.toLocaleString("pl-PL")} t</span>
                      {name && <div className="truncate text-muted-foreground">{name}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <TransportDetailDialog
        transportId={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
