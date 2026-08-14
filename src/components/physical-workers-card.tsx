import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HardHat, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteEmployee, listEmployees, upsertEmployee } from "@/lib/employees.functions";

const pln = (n: number) => n.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });

export function PhysicalWorkersCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployees);
  const saveFn = useServerFn(upsertEmployee);
  const delFn = useServerFn(deleteEmployee);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ["employees"], queryFn: () => listFn() });

  const save = useMutation({
    mutationFn: (v: any) => saveFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Zapisano pracownika");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Usunięto pracownika");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5" /> Użytkownicy bez konta / Pracownicy fizyczni
          </CardTitle>
          <CardDescription>
            Stawki dniówkowe i akordowe używane w „Kalendarzu pracowniczym”.
          </CardDescription>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Dodaj pracownika
            </Button>
          </DialogTrigger>
          <EmployeeDialog editing={editing} onSave={(v) => save.mutate(v)} pending={save.isPending} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pracownik</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Stawka dzienna</TableHead>
              <TableHead>Stawka / paleta</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center">
                  Ładowanie…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Brak pracowników fizycznych
                </TableCell>
              </TableRow>
            )}
            {data.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">
                  {e.full_name}
                  {e.position && <div className="text-xs text-muted-foreground">{e.position}</div>}
                </TableCell>
                <TableCell className="text-sm">{e.phone ?? "—"}</TableCell>
                <TableCell>{pln(Number(e.daily_rate ?? 0))}</TableCell>
                <TableCell>{pln(Number(e.pallet_rate ?? 0))}</TableCell>
                <TableCell>
                  <Badge variant="outline">{e.status}</Badge>
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditing(e);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Usunąć ${e.full_name}? Rozliczenia dni zostaną usunięte.`)) del.mutate(e.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmployeeDialog({
  editing,
  onSave,
  pending,
}: {
  editing: any | null;
  onSave: (v: any) => void;
  pending: boolean;
}) {
  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [position, setPosition] = useState(editing?.position ?? "");
  const [daily, setDaily] = useState(String(editing?.daily_rate ?? 0));
  const [pallet, setPallet] = useState(String(editing?.pallet_rate ?? 0));
  const [status, setStatus] = useState(editing?.status ?? "aktywny");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  return (
    <DialogContent key={editing?.id ?? "new"}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edytuj pracownika" : "Nowy pracownik fizyczny"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Imię i nazwisko *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefon</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Stanowisko</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="np. Pakowacz" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Stawka dzienna (zł)</Label>
            <Input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label>Stawka za paletę (zł)</Label>
            <Input value={pallet} onChange={(e) => setPallet(e.target.value)} inputMode="decimal" />
          </div>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aktywny">Aktywny</SelectItem>
              <SelectItem value="nieaktywny">Nieaktywny</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notatki</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!fullName.trim() || pending}
          onClick={() =>
            onSave({
              id: editing?.id,
              full_name: fullName.trim(),
              phone: phone || null,
              position: position || null,
              daily_rate: daily,
              pallet_rate: pallet,
              status,
              notes: notes || null,
            })
          }
        >
          {pending ? "Zapisywanie…" : "Zapisz"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
