import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Check, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const zl = (n: number) =>
  n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

type Person = { id: string; full_name: string; notes: string | null; is_active: boolean };
type Entry = {
  id: string; creditor_id: string; debtor_id: string; amount: number; entry_date: string;
  description: string; status: string; settled_at: string | null;
};

export function CorrectionsTab() {
  const qc = useQueryClient();
  const people = useQuery({
    queryKey: ["correction-people"],
    queryFn: async () => {
      const { data, error } = await supabase.from("correction_people").select("*").order("full_name");
      if (error) throw error;
      return data as Person[];
    },
  });
  const entries = useQuery({
    queryKey: ["correction-entries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("correction_entries").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["correction-people"] });
    qc.invalidateQueries({ queryKey: ["correction-entries"] });
  };
  const nameOf = (id: string) => people.data?.find((p) => p.id === id)?.full_name ?? "—";

  const [newName, setNewName] = useState("");
  const addPerson = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("correction_people").insert({ full_name: newName.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setNewName(""); refresh(); toast.success("Dodano osobę"); },
    onError: (e: any) => toast.error(e.message),
  });
  const delPerson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("correction_people").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Usunięto osobę"); },
    onError: () => toast.error("Nie można usunąć osoby, która ma wpisy"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ creditor_id: "", debtor_id: "", amount: "", entry_date: today, description: "" });
  const addEntry = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount.replace(",", "."));
      if (!form.creditor_id || !form.debtor_id) throw new Error("Wybierz obie osoby");
      if (form.creditor_id === form.debtor_id) throw new Error("Osoby muszą być różne");
      if (!(amount > 0)) throw new Error("Kwota musi być większa od zera");
      if (form.description.trim().length < 2) throw new Error("Dodaj opis");
      const { error } = await supabase.from("correction_entries").insert({
        creditor_id: form.creditor_id, debtor_id: form.debtor_id, amount,
        entry_date: form.entry_date, description: form.description.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => { setForm({ ...form, amount: "", description: "" }); refresh(); toast.success("Dodano wpis"); },
    onError: (e: any) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, settled }: { id: string; settled: boolean }) => {
      const { error } = await supabase.from("correction_entries").update({
        status: settled ? "rozliczone" : "otwarte", settled_at: settled ? today : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message),
  });
  const delEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("correction_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message),
  });

  // Saldo netto (otwarte): dodatnie = osobie należy się, ujemne = osoba jest winna
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries.data ?? []) {
      if (e.status !== "otwarte") continue;
      m.set(e.creditor_id, (m.get(e.creditor_id) ?? 0) + Number(e.amount));
      m.set(e.debtor_id, (m.get(e.debtor_id) ?? 0) - Number(e.amount));
    }
    return m;
  }, [entries.data]);

  const [filter, setFilter] = useState<"all" | "otwarte" | "rozliczone">("otwarte");
  const shown = (entries.data ?? []).filter((e) => filter === "all" || e.status === filter);
  const active = (people.data ?? []).filter((p) => p.is_active);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Osoby</CardTitle>
            <CardDescription>Saldo z nierozliczonych wpisów: plus = należy się, minus = winien.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Imię i nazwisko" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button disabled={newName.trim().length < 2 || addPerson.isPending} onClick={() => addPerson.mutate()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {(people.data ?? []).map((p) => {
              const b = balances.get(p.id) ?? 0;
              return (
                <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{p.full_name}</span>
                  <div className="flex items-center gap-2">
                    <span className={b > 0 ? "text-primary font-medium" : b < 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {b > 0 ? "+" : ""}{zl(b)}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => confirm(`Usunąć ${p.full_name}?`) && delPerson.mutate(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {people.data?.length === 0 && <p className="text-sm text-muted-foreground">Dodaj pierwszą osobę.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nowy rachunek / zadłużenie</CardTitle>
            <CardDescription>Kto komu jest winien, ile, za co i kiedy.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Wystawia (należy mu się)</Label>
              <Select value={form.creditor_id} onValueChange={(v) => setForm({ ...form, creditor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Wybierz osobę" /></SelectTrigger>
                <SelectContent>{active.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Dla (jest winien)</Label>
              <Select value={form.debtor_id} onValueChange={(v) => setForm({ ...form, debtor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Wybierz osobę" /></SelectTrigger>
                <SelectContent>{active.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Kwota (zł)</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Opis</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="np. zaliczka, tankowanie prywatne…" />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={() => addEntry.mutate()} disabled={addEntry.isPending}>Dodaj wpis</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Rejestr korekt</CardTitle>
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="otwarte">Nierozliczone</SelectItem>
              <SelectItem value="rozliczone">Rozliczone</SelectItem>
              <SelectItem value="all">Wszystkie</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Wystawia</TableHead><TableHead>Winien</TableHead>
                <TableHead>Opis</TableHead><TableHead className="text-right">Kwota</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.entry_date}</TableCell>
                  <TableCell>{nameOf(e.creditor_id)}</TableCell>
                  <TableCell>{nameOf(e.debtor_id)}</TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap">{e.description}</TableCell>
                  <TableCell className="text-right font-medium">{zl(Number(e.amount))}</TableCell>
                  <TableCell>
                    {e.status === "rozliczone"
                      ? <Badge variant="secondary">Rozliczone {e.settled_at ?? ""}</Badge>
                      : <Badge variant="outline">Otwarte</Badge>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: e.id, settled: e.status !== "rozliczone" })}>
                      {e.status === "rozliczone" ? <><Undo2 className="h-4 w-4 mr-1" />Cofnij</> : <><Check className="h-4 w-4 mr-1" />Rozlicz</>}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm("Usunąć wpis?") && delEntry.mutate(e.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Brak wpisów</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
