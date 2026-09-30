import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ENTITY_LABEL: Record<string, string> = {
  leads: "Lead", lead: "Lead", transports: "Transport", transport_items: "Pozycja transportu",
  stock_events: "Magazyn", stock_event: "Magazyn", stock_lots: "Partia PZ", lead_notes: "Notatka",
  lead_batches: "Partia dostawy", expenses: "Koszt", expense: "Koszt", employees: "Pracownik",
  employee_work_logs: "Czas pracy", fixed_assets: "Środek trwały", affiliate_commissions: "Prowizja",
  affiliate: "Afiliacja", offer_templates: "Szablon", lead_statuses: "Status leada",
  pickup_locations: "Miejsce odbioru", system_settings: "Ustawienia", payment: "Płatność",
  payroll: "Wypłata", transport_pool: "Wspólny transport",
};
const ACTION_LABEL: Record<string, string> = { insert: "Dodano", update: "Zmieniono", delete: "Usunięto" };
const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  insert: "default", update: "secondary", delete: "destructive",
};

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function label(d: any): string | null {
  const row = d?.new ?? d?.old;
  return d?.label ?? row?.lead_number ?? row?.name ?? row?.description ?? row?.full_name ?? null;
}

export function UserActivityDialog({
  user, onClose,
}: { user: { id: string; email: string; full_name?: string | null } | null; onClose: () => void }) {
  const [limit, setLimit] = useState(100);
  const { data = [], isLoading } = useQuery({
    queryKey: ["user-activity", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, entity_type, entity_id, details, created_at")
        .eq("actor_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historia działań — {user?.full_name || user?.email}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {!isLoading && data.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak zapisanych działań tego użytkownika.</p>
        )}
        <div className="space-y-2">
          {data.map((e: any) => {
            const changes = e.details?.changes as Record<string, { from: unknown; to: unknown }> | undefined;
            const name = label(e.details);
            return (
              <div key={e.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(e.created_at).toLocaleString("pl-PL")}
                  </span>
                  <Badge variant={ACTION_VARIANT[e.action] ?? "secondary"}>
                    {ACTION_LABEL[e.action] ?? e.action}
                  </Badge>
                  <span className="font-medium">{ENTITY_LABEL[e.entity_type] ?? e.entity_type}</span>
                  {name && <span className="text-muted-foreground truncate">{name}</span>}
                </div>
                {changes && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {Object.entries(changes).map(([k, v]) => (
                      <li key={k} className="break-all">
                        <span className="font-mono text-muted-foreground">{k}</span>: {fmt(v.from)} → <b>{fmt(v.to)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        {data.length >= limit && (
          <Button variant="outline" size="sm" onClick={() => setLimit(limit + 200)}>Pokaż więcej</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
