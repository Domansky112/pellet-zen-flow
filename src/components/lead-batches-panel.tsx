import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lightbulb, Loader2, Plus, Split, X } from "lucide-react";
import { listLeadBatches, saveLeadBatches } from "@/lib/batches.functions";
import { MAX_LOAD_TONS, suggestSplit } from "@/lib/batch-split";

type Props = {
  leadId: string;
  leadNumber?: string | null;
  quantity?: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  oczekuje: "W poczekalni",
  zaplanowana: "Zaplanowana",
  zrealizowana: "Zrealizowana",
  anulowana: "Anulowana",
};

export function LeadBatchesPanel({ leadId, leadNumber, quantity }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadBatches);
  const saveFn = useServerFn(saveLeadBatches);

  const batches = useQuery({
    queryKey: ["lead-batches", leadId],
    queryFn: () => listFn({ data: { lead_id: leadId } }),
  });

  const rows = (batches.data ?? []) as any[];
  const locked = rows.filter((b) => b.transport_id || b.status === "zrealizowana");
  const pending = rows.filter((b) => !b.transport_id && b.status !== "zrealizowana");

  const total = Number(quantity ?? 0);
  const lockedTons = locked.reduce((s, b) => s + Number(b.tons), 0);
  const remaining = Math.max(0, Math.round((total - lockedTons) * 1000) / 1000);

  const [draft, setDraft] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(pending.map((b) => String(b.tons)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches.dataUpdatedAt, editing]);

  const draftSum = useMemo(
    () => draft.reduce((s, v) => s + (Number(String(v).replace(",", ".")) || 0), 0),
    [draft],
  );

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          lead_id: leadId,
          tons: draft
            .map((v) => Number(String(v).replace(",", ".")))
            .filter((n) => Number.isFinite(n) && n > 0),
        },
      }),
    onSuccess: () => {
      toast.success("Partie dostaw zapisane");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["lead-batches", leadId] });
      qc.invalidateQueries({ queryKey: ["draft-candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsSplit = remaining > MAX_LOAD_TONS + 0.001;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
          <Split className="h-3.5 w-3.5" /> Partie dostaw
        </Label>
        {batches.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {needsSplit && pending.length <= 1 && (
        <div className="flex items-start gap-2 rounded-md bg-primary/10 p-2 text-xs text-primary">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Tonaż {remaining} t przekracza dopuszczalną ładowność zestawu ({MAX_LOAD_TONS} t).
            Podziel zamówienie na transporty — proponuję{" "}
            <strong>{suggestSplit(remaining).map((t) => `${t} t`).join(" + ")}</strong>.
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div className="space-y-1">
          {locked.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <span className="font-medium">
                {leadNumber ?? "Lead"}/{b.batch_no}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{Number(b.tons)} t</Badge>
                <Badge variant="outline">{STATUS_LABEL[b.status] ?? b.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {!editing ? (
        <>
          {pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Brak partii — zamówienie pojedzie jako jeden transport.
            </p>
          ) : (
            <div className="space-y-1">
              {pending.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-md border border-dashed border-border px-2 py-1.5 text-sm"
                >
                  <span className="font-medium">
                    {leadNumber ?? "Lead"}/{b.batch_no}
                  </span>
                  <Badge variant="secondary">{Number(b.tons)} t</Badge>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {pending.length ? "Edytuj podział" : "Podziel na partie"}
            </Button>
            {needsSplit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDraft(suggestSplit(remaining).map((t) => String(t)));
                  setEditing(true);
                }}
              >
                Użyj propozycji
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {draft.map((v, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                Dostawa {locked.length + idx + 1}
              </span>
              <Input
                inputMode="decimal"
                value={v}
                onChange={(e) => {
                  const next = [...draft];
                  next[idx] = e.target.value;
                  setDraft(next);
                }}
                className="h-8"
              />
              <span className="text-xs text-muted-foreground">t</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setDraft(draft.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setDraft([...draft, ""])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Dodaj partię
          </Button>
          <div className="text-xs text-muted-foreground">
            Suma partii: <strong>{draftSum.toFixed(3).replace(/\.?0+$/, "")} t</strong> z {remaining} t
            do rozplanowania
            {Math.abs(draftSum - remaining) > 0.001 && (
              <span className="text-destructive"> — nie zgadza się z tonażem zamówienia</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Zapisz partie
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Anuluj
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
