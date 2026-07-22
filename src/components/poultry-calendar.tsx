import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bird, Loader2, Phone, Trash2, ArrowRight } from "lucide-react";
import {
  listPoultryReminders,
  updatePoultryReminder,
  deletePoultryReminder,
} from "@/lib/poultry.functions";

const STATUS_LABELS: Record<string, string> = {
  do_zadzwonienia: "Do zadzwonienia",
  w_trakcie: "W trakcie",
  zatwierdzone: "Zatwierdzone",
  odrzucone: "Odrzucone",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  do_zadzwonienia: "default",
  w_trakcie: "secondary",
  zatwierdzone: "outline",
  odrzucone: "destructive",
};

export function PoultryCalendar() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPoultryReminders);
  const updateFn = useServerFn(updatePoultryReminder);
  const deleteFn = useServerFn(deletePoultryReminder);

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["poultry_reminders"],
    queryFn: () => listFn(),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; status?: string; reminder_date?: string; notes?: string | null }) =>
      updateFn({ data: v as any }),
    onSuccess: () => {
      toast.success("Zaktualizowano");
      qc.invalidateQueries({ queryKey: ["poultry_reminders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["poultry_reminders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [filter, setFilter] = useState<string>("aktywne");

  const filtered = useMemo(() => {
    if (filter === "aktywne") {
      return reminders.filter((r: any) => r.status === "do_zadzwonienia" || r.status === "w_trakcie");
    }
    if (filter === "wszystkie") return reminders;
    return reminders.filter((r: any) => r.status === filter);
  }, [reminders, filter]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground">Filtr statusu:</div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="aktywne">Aktywne (do zadzwonienia + w trakcie)</SelectItem>
            <SelectItem value="wszystkie">Wszystkie</SelectItem>
            <SelectItem value="do_zadzwonienia">Do zadzwonienia</SelectItem>
            <SelectItem value="w_trakcie">W trakcie</SelectItem>
            <SelectItem value="zatwierdzone">Zatwierdzone</SelectItem>
            <SelectItem value="odrzucone">Odrzucone</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bird className="h-5 w-5 text-primary" />
            Kalendarz Wstawień — Kurniki ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Ładuję…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak przypomnień. Pojawią się automatycznie po wydaniu towaru dla klientów B2B — Kurnik.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r: any) => {
                const daysLeft = differenceInCalendarDays(parseISO(r.reminder_date), today);
                const overdue = daysLeft < 0 && r.status !== "zatwierdzone" && r.status !== "odrzucone";
                const soon = daysLeft >= 0 && daysLeft <= 3 && r.status !== "zatwierdzone" && r.status !== "odrzucone";
                const lead = r.leads;
                const displayName = lead?.invoice_company || lead?.name || r.farm_name || "—";
                return (
                  <div
                    key={r.id}
                    className={`rounded-md border p-3 space-y-2 ${
                      overdue ? "border-destructive/60 bg-destructive/5" : soon ? "border-amber-500/60 bg-amber-500/5" : "border-border/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Bird className="h-4 w-4 text-primary" />
                        <div>
                          <div className="text-sm font-medium">
                            {displayName}
                            {lead?.lead_number && (
                              <span className="ml-2 text-xs text-muted-foreground">{lead.lead_number}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {lead?.city ?? "—"}
                            {r.tonnage != null && <> · {r.tonnage} t poprzednio</>}
                            {lead?.cycle_days && <> · cykl {lead.cycle_days} dni</>}
                          </div>
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Termin:</span>
                        <Input
                          type="date"
                          className="h-8 w-[150px]"
                          value={r.reminder_date}
                          onChange={(e) => update.mutate({ id: r.id, reminder_date: e.target.value })}
                        />
                        {overdue && <span className="text-destructive font-medium">spóźnione o {-daysLeft} dni</span>}
                        {soon && <span className="text-amber-700 font-medium">za {daysLeft} dni</span>}
                        {!overdue && !soon && daysLeft > 3 && (
                          <span className="text-muted-foreground">
                            {format(parseISO(r.reminder_date), "d LLL yyyy", { locale: pl })}
                          </span>
                        )}
                      </div>
                      {lead?.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                          <Phone className="h-3 w-3" /> {lead.phone}
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={r.status}
                        onValueChange={(v) => update.mutate({ id: r.id, status: v })}
                      >
                        <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="do_zadzwonienia">Do zadzwonienia</SelectItem>
                          <SelectItem value="w_trakcie">W trakcie</SelectItem>
                          <SelectItem value="zatwierdzone">Zatwierdzone (nowe zamówienie)</SelectItem>
                          <SelectItem value="odrzucone">Odrzucone / brak zainteresowania</SelectItem>
                        </SelectContent>
                      </Select>

                      {lead?.id && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`/crm?lead=${lead.id}`}>
                            <ArrowRight className="h-3 w-3 mr-1" /> Otwórz lead
                          </a>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-destructive"
                        onClick={() => {
                          if (confirm("Usunąć przypomnienie?")) del.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
