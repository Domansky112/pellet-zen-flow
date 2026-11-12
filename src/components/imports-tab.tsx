import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Lock, LockOpen, Paperclip, Train, Truck, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addStockEvent } from "@/lib/stock.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CURRENCIES = ["EUR", "USD", "PLN", "UAH"];
const num = (v: string) => Number(String(v).replace(",", ".").trim());
const money = (n: number, cur: string) =>
  n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur;
const t2 = (n: number) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " t";
const bb = (n: number) => {
  const r = Math.round(n);
  const m10 = r % 10, m100 = r % 100;
  const w = r === 1 ? "big bag" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "big bagi" : "big bagów";
  return `${r} ${w}`;
};
const kursy = (n: number) => {
  const m10 = n % 10, m100 = n % 100;
  const w = n === 1 ? "kurs" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "kursy" : "kursów";
  return `${n} ${w}`;
};

async function uploadFile(folder: string, file: File) {
  const path = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from("import-docs").upload(path, file);
  if (error) throw error;
  return path;
}
async function openFile(path: string) {
  const { data, error } = await supabase.storage.from("import-docs").createSignedUrl(path, 300);
  if (error || !data) return toast.error("Nie udało się otworzyć pliku");
  window.open(data.signedUrl, "_blank");
}

export function ImportsTab() {
  const qc = useQueryClient();
  const addStock = useServerFn(addStockEvent);
  const q = (key: string, table: string, order: string) =>
    useQuery({
      queryKey: [key],
      queryFn: async () => {
        const { data, error } = await (supabase as any).from(table).select("*").order(order, { ascending: false });
        if (error) throw error;
        return data as any[];
      },
    });
  const suppliers = q("imp-suppliers", "import_suppliers", "created_at");
  const payments = q("imp-payments", "import_payments", "paid_at");
  const wagons = q("imp-wagons", "import_wagons", "arrival_date");
  const hauls = q("imp-hauls", "import_hauls", "haul_date");
  const refresh = () => ["imp-suppliers", "imp-payments", "imp-wagons", "imp-hauls"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const supName = (id: string) => suppliers.data?.find((s) => s.id === id)?.name ?? "—";

  // ---------- Dostawcy ----------
  const [newSup, setNewSup] = useState({ name: "", country: "", default_currency: "EUR" });
  const addSup = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("import_suppliers").insert({ name: newSup.name.trim(), country: newSup.country.trim() || null, default_currency: newSup.default_currency });
      if (error) throw error;
    },
    onSuccess: () => { setNewSup({ name: "", country: "", default_currency: "EUR" }); refresh(); toast.success("Dodano dostawcę"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ---------- Saldo ----------
  const balances = useMemo(() => {
    return (suppliers.data ?? []).map((s) => {
      const ps = (payments.data ?? []).filter((p) => p.supplier_id === s.id);
      const wIds = new Set((wagons.data ?? []).filter((w) => w.supplier_id === s.id).map((w) => w.id));
      const hs = (hauls.data ?? []).filter((h) => wIds.has(h.wagon_id));
      const paidTons = ps.reduce((a, p) => a + Number(p.tons), 0);
      const recTons = hs.reduce((a, h) => a + Number(h.tons), 0);
      const recUnits = hs.reduce((a, h) => a + Number(h.units), 0);
      const byCur = new Map<string, { amount: number; tons: number }>();
      for (const p of ps) {
        const c = byCur.get(p.currency) ?? { amount: 0, tons: 0 };
        c.amount += Number(p.amount); c.tons += Number(p.tons); byCur.set(p.currency, c);
      }
      // Średnia cena PLN/t z przelewów z kursem (lub w PLN)
      let plnAmt = 0, plnTons = 0;
      for (const p of ps) {
        const rate = p.currency === "PLN" ? 1 : Number(p.exchange_rate ?? 0);
        if (rate > 0) { plnAmt += Number(p.amount) * rate; plnTons += Number(p.tons); }
      }
      return { s, paidTons, recTons, recUnits, left: paidTons - recTons, byCur, plnPerTon: plnTons > 0 ? plnAmt / plnTons : 0 };
    });
  }, [suppliers.data, payments.data, wagons.data, hauls.data]);

  // ---------- Przelewy ----------
  const today = new Date().toISOString().slice(0, 10);
  const emptyPay = { supplier_id: "", paid_at: today, amount: "", currency: "EUR", tons: "", exchange_rate: "", reference: "", notes: "" };
  const [pay, setPay] = useState(emptyPay);
  const [payFile, setPayFile] = useState<File | null>(null);
  const perTon = num(pay.amount) > 0 && num(pay.tons) > 0 ? num(pay.amount) / num(pay.tons) : 0;
  const addPay = useMutation({
    mutationFn: async () => {
      if (!pay.supplier_id) throw new Error("Wybierz dostawcę");
      if (!(num(pay.amount) > 0)) throw new Error("Podaj kwotę");
      if (!(num(pay.tons) > 0)) throw new Error("Podaj liczbę ton");
      const file_path = payFile ? await uploadFile("przelewy", payFile) : null;
      const { error } = await (supabase as any).from("import_payments").insert({
        supplier_id: pay.supplier_id, paid_at: pay.paid_at, amount: num(pay.amount), currency: pay.currency,
        tons: num(pay.tons), exchange_rate: pay.exchange_rate ? num(pay.exchange_rate) : null,
        reference: pay.reference.trim() || null, notes: pay.notes.trim() || null, file_path,
      });
      if (error) throw error;
    },
    onSuccess: () => { setPay({ ...emptyPay, supplier_id: pay.supplier_id, currency: pay.currency }); setPayFile(null); refresh(); toast.success("Zapisano przelew"); },
    onError: (e: any) => toast.error(e.message),
  });
  const delRow = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Usunięto"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ---------- Wagony ----------
  const [wag, setWag] = useState({ supplier_id: "", wagon_number: "", arrival_date: today, declared_tons: "" });
  const addWag = useMutation({
    mutationFn: async () => {
      if (!wag.supplier_id || !wag.wagon_number.trim()) throw new Error("Wybierz dostawcę i podaj numer wagonu");
      const { error } = await (supabase as any).from("import_wagons").insert({
        supplier_id: wag.supplier_id, wagon_number: wag.wagon_number.trim(), arrival_date: wag.arrival_date,
        declared_tons: wag.declared_tons ? num(wag.declared_tons) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setWag({ ...wag, wagon_number: "", declared_tons: "" }); refresh(); toast.success("Dodano wagon"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleWag = useMutation({
    mutationFn: async (w: any) => {
      const close = w.status !== "zamkniety";
      const { error } = await (supabase as any).from("import_wagons").update({ status: close ? "zamkniety" : "otwarty", closed_at: close ? new Date().toISOString() : null }).eq("id", w.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Saldo u dostawców */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {balances.map((b) => (
          <Card key={b.s.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{b.s.name}</CardTitle>
              <CardDescription>{b.s.country || "Dostawca"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Opłacone</span><span>{t2(b.paidTons)}</span></div>
              <div className="flex justify-between"><span>Odebrane</span><span>{t2(b.recTons)} ({bb(b.recUnits)})</span></div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Do odebrania</span><span className={b.left < 0 ? "text-destructive" : "text-primary"}>{t2(b.left)}</span>
              </div>
              {[...b.byCur.entries()].map(([cur, v]) => (
                <div key={cur} className="flex justify-between text-muted-foreground">
                  <span>Pozostało u dostawcy ({cur})</span>
                  <span>{money(Math.max(0, b.left) * (v.amount / v.tons), cur)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Nowy dostawca</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Nazwa" value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} />
            <div className="flex gap-2">
              <Input placeholder="Kraj" value={newSup.country} onChange={(e) => setNewSup({ ...newSup, country: e.target.value })} />
              <Select value={newSup.default_currency} onValueChange={(v) => setNewSup({ ...newSup, default_currency: v })}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={newSup.name.trim().length < 2 || addSup.isPending} onClick={() => addSup.mutate()}>
              <Plus className="h-4 w-4 mr-1" />Dodaj dostawcę
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Przelewy */}
      <Card>
        <CardHeader>
          <CardTitle>Przelewy wychodzące za pellet</CardTitle>
          <CardDescription>Kwota przelana za daną liczbę ton — cena za tonę liczy się sama.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Dostawca</Label>
              <Select value={pay.supplier_id} onValueChange={(v) => {
                const s = suppliers.data?.find((x) => x.id === v);
                setPay({ ...pay, supplier_id: v, currency: s?.default_currency ?? pay.currency });
              }}>
                <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                <SelectContent>{(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Data przelewu</Label><Input type="date" value={pay.paid_at} onChange={(e) => setPay({ ...pay, paid_at: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Kwota</Label>
              <div className="flex gap-2">
                <Input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                <Select value={pay.currency} onValueChange={(v) => setPay({ ...pay, currency: v })}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Za ile ton</Label><Input inputMode="decimal" value={pay.tons} onChange={(e) => setPay({ ...pay, tons: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Cena za tonę</Label>
              <div className="h-10 flex items-center rounded-md border bg-muted px-3 text-sm font-medium">{perTon ? money(perTon, pay.currency) : "—"}</div>
            </div>
            {pay.currency !== "PLN" && (
              <div className="space-y-1"><Label>Kurs do PLN (opcjonalnie)</Label><Input inputMode="decimal" placeholder="np. 4,28" value={pay.exchange_rate} onChange={(e) => setPay({ ...pay, exchange_rate: e.target.value })} /></div>
            )}
            <div className="space-y-1"><Label>Tytuł / nr przelewu</Label><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
            <div className="space-y-1"><Label>Potwierdzenie (PDF/zdjęcie)</Label><Input type="file" accept=".pdf,image/*" onChange={(e) => setPayFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <div className="flex justify-end"><Button onClick={() => addPay.mutate()} disabled={addPay.isPending}>{addPay.isPending ? "Zapisuję…" : "Zapisz przelew"}</Button></div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Dostawca</TableHead><TableHead className="text-right">Kwota</TableHead>
              <TableHead className="text-right">Tony</TableHead><TableHead className="text-right">Za tonę</TableHead><TableHead>Tytuł</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {(payments.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.paid_at}</TableCell>
                  <TableCell>{supName(p.supplier_id)}</TableCell>
                  <TableCell className="text-right font-medium">{money(Number(p.amount), p.currency)}</TableCell>
                  <TableCell className="text-right">{t2(Number(p.tons))}</TableCell>
                  <TableCell className="text-right">{money(Number(p.amount) / Number(p.tons), p.currency)}</TableCell>
                  <TableCell>{p.reference ?? ""}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {p.file_path && <Button size="icon" variant="ghost" title="Potwierdzenie" onClick={() => openFile(p.file_path)}><Paperclip className="h-4 w-4" /></Button>}
                    <Button size="icon" variant="ghost" onClick={() => confirm("Usunąć przelew?") && delRow.mutate({ table: "import_payments", id: p.id })}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {payments.data?.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Brak przelewów</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Wagony */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Train className="h-5 w-5" />Transporty rozliczone — wagony</CardTitle>
          <CardDescription>Do wagonu dodajesz kursy na bazę (Big Bagi, tonaż, raport wagowy). Zamknięty wagon można otworzyć do korekty.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="space-y-1">
              <Label>Dostawca</Label>
              <Select value={wag.supplier_id} onValueChange={(v) => setWag({ ...wag, supplier_id: v })}>
                <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                <SelectContent>{(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Nr wagonu</Label><Input value={wag.wagon_number} onChange={(e) => setWag({ ...wag, wagon_number: e.target.value })} /></div>
            <div className="space-y-1"><Label>Data przyjazdu</Label><Input type="date" value={wag.arrival_date} onChange={(e) => setWag({ ...wag, arrival_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Tony wg dokumentów</Label><Input inputMode="decimal" value={wag.declared_tons} onChange={(e) => setWag({ ...wag, declared_tons: e.target.value })} /></div>
            <Button onClick={() => addWag.mutate()} disabled={addWag.isPending}><Plus className="h-4 w-4 mr-1" />Dodaj wagon</Button>
          </div>
          {(wagons.data ?? []).map((w) => (
            <WagonCard key={w.id} wagon={w} supplierName={supName(w.supplier_id)}
              hauls={(hauls.data ?? []).filter((h) => h.wagon_id === w.id)}
              plnPerTon={balances.find((b) => b.s.id === w.supplier_id)?.plnPerTon ?? 0}
              onToggle={() => toggleWag.mutate(w)}
              onDelete={() => confirm("Usunąć wagon razem z kursami? Przyjęcia na magazyn zostaną.") && delRow.mutate({ table: "import_wagons", id: w.id })}
              onDeleteHaul={(id) => confirm("Usunąć kurs? Jeśli był zaksięgowany, przyjęcie w magazynie zostanie — usuń je ręcznie.") && delRow.mutate({ table: "import_hauls", id })}
              addStock={addStock} refresh={refresh} />
          ))}
          {wagons.data?.length === 0 && <p className="text-sm text-muted-foreground">Brak wagonów.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function WagonCard({ wagon, supplierName, hauls, plnPerTon, onToggle, onDelete, onDeleteHaul, addStock, refresh }: {
  wagon: any; supplierName: string; hauls: any[]; plnPerTon: number;
  onToggle: () => void; onDelete: () => void; onDeleteHaul: (id: string) => void;
  addStock: any; refresh: () => void;
}) {
  const closed = wagon.status === "zamkniety";
  const [open, setOpen] = useState(false);
  const [ew, setEw] = useState<{ wagon_number: string; arrival_date: string; declared_tons: string } | null>(null);
  const saveWagon = useMutation({
    mutationFn: async () => {
      if (!ew || !ew.wagon_number.trim()) throw new Error("Podaj numer wagonu");
      const { error } = await (supabase as any).from("import_wagons").update({
        wagon_number: ew.wagon_number.trim(), arrival_date: ew.arrival_date,
        declared_tons: ew.declared_tons ? num(ew.declared_tons) : null,
      }).eq("id", wagon.id);
      if (error) throw error;
    },
    onSuccess: () => { setEw(null); refresh(); toast.success("Wagon zaktualizowany"); },
    onError: (e: any) => toast.error(e.message),
  });
  const today = new Date().toISOString().slice(0, 10);
  const fleet = useQuery({
    queryKey: ["import-fleet"],
    queryFn: async () => {
      const [v, d] = await Promise.all([
        supabase.from("fleet_vehicles").select("id, registration, brand, model").order("registration"),
        supabase.from("fleet_drivers").select("id, first_name, last_name").order("last_name"),
      ]);
      return {
        vehicles: (v.data ?? []).map((x) => [x.registration, x.brand].filter(Boolean).join(" · ")),
        drivers: (d.data ?? []).map((x) => `${x.first_name} ${x.last_name}`.trim()),
      };
    },
  });
  const empty = { haul_date: today, vehicle: "", driver: "", units: "", tons: "", post: false };
  const [h, setH] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const startEdit = (x: any) => {
    setEditing(x);
    setH({ haul_date: x.haul_date, vehicle: x.vehicle ?? "", driver: x.driver ?? "", units: String(x.units ?? ""), tons: String(x.tons ?? ""), post: !!x.post_to_stock });
    setFile(null);
  };
  const cancelEdit = () => { setEditing(null); setH(empty); setFile(null); };
  const sumT = hauls.reduce((a, x) => a + Number(x.tons), 0);
  const sumU = hauls.reduce((a, x) => a + Number(x.units), 0);

  const addHaul = useMutation({
    mutationFn: async () => {
      const tons = num(h.tons), units = num(h.units || "0");
      if (!(tons > 0)) throw new Error("Podaj tonaż");
      if (!(units >= 0)) throw new Error("Podaj liczbę Big Bagów");
      const weight_report_path = file ? await uploadFile(`wagony/${wagon.id}`, file) : (editing?.weight_report_path ?? null);
      let stock_event_id: string | null = editing?.stock_event_id ?? null;
      if (h.post && !stock_event_id) {
        const ev = await addStock({ data: {
          product: "pellet_bigbag", txn_type: "przyjecie", quantity: tons, units,
          reference: `Wagon ${wagon.wagon_number}`, supplier: supplierName,
          unit_price: plnPerTon > 0 ? Math.round(plnPerTon * 100) / 100 : null, vat_rate: 0,
          note: `Import — wagon ${wagon.wagon_number}${h.vehicle ? `, ${h.vehicle}` : ""}`,
        } });
        stock_event_id = ev?.id ?? null;
      }
      const row = {
        wagon_id: wagon.id, haul_date: h.haul_date, vehicle: h.vehicle.trim() || null, driver: h.driver.trim() || null,
        units, tons, weight_report_path, post_to_stock: h.post || !!stock_event_id, stock_event_id,
      };
      const { error } = editing
        ? await (supabase as any).from("import_hauls").update(row).eq("id", editing.id)
        : await (supabase as any).from("import_hauls").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      const wasEdit = !!editing;
      if (wasEdit && editing.stock_event_id && (Number(editing.tons) !== num(h.tons) || Number(editing.units) !== num(h.units || "0")))
        toast.warning("Kurs był już przyjęty na magazyn — zrób korektę w Magazynie, jeśli zmieniłeś tonaż/sztuki.");
      setEditing(null); setH({ ...empty, vehicle: h.vehicle, driver: h.driver }); setFile(null); refresh();
      toast.success(wasEdit ? "Kurs zaktualizowany" : h.post ? "Kurs dodany i przyjęty na magazyn" : "Kurs dodany");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {ew ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1"><Label className="text-xs">Nr wagonu</Label><Input className="w-36" value={ew.wagon_number} onChange={(e) => setEw({ ...ew, wagon_number: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Data przyjazdu</Label><Input type="date" value={ew.arrival_date} onChange={(e) => setEw({ ...ew, arrival_date: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Tony wg dok.</Label><Input className="w-28" inputMode="decimal" value={ew.declared_tons} onChange={(e) => setEw({ ...ew, declared_tons: e.target.value })} /></div>
            <Button size="sm" onClick={() => saveWagon.mutate()} disabled={saveWagon.isPending}>Zapisz</Button>
            <Button size="sm" variant="ghost" onClick={() => setEw(null)}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
        <div className="flex items-center gap-1 flex-wrap">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="flex items-center gap-2 flex-wrap rounded-md px-1 -ml-1 py-1 text-left hover:bg-muted/60">
            <ChevronRight className={"h-4 w-4 shrink-0 text-muted-foreground transition-transform" + (open ? " rotate-90" : "")} />
            <span className="font-semibold">Wagon {wagon.wagon_number}</span>
            <span className="text-sm text-muted-foreground">{supplierName} · {wagon.arrival_date}</span>
            {closed ? <Badge variant="secondary">Zamknięty</Badge> : <Badge variant="outline">Otwarty</Badge>}
            <span className="text-xs text-muted-foreground">{kursy(hauls.length)}</span>
          </button>
          <Button size="icon" variant="ghost" title="Edytuj wagon" onClick={() => setEw({ wagon_number: wagon.wagon_number ?? "", arrival_date: wagon.arrival_date, declared_tons: wagon.declared_tons != null ? String(wagon.declared_tons) : "" })}><Pencil className="h-4 w-4" /></Button>
        </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span>Zwiezione: <b>{t2(sumT)} ({bb(sumU)})</b>{wagon.declared_tons ? ` z ${t2(Number(wagon.declared_tons))}` : ""}</span>
          <Button size="sm" variant={closed ? "outline" : "default"} onClick={onToggle}>
            {closed ? <><LockOpen className="h-4 w-4 mr-1" />Otwórz do korekty</> : <><Lock className="h-4 w-4 mr-1" />Zamknij wagon</>}
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {open && hauls.length > 0 && (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Auto / kierowca</TableHead><TableHead className="text-right">Tonaż</TableHead>
            <TableHead>Magazyn</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {hauls.map((x) => (
              <TableRow key={x.id}>
                <TableCell>{x.haul_date}</TableCell>
                <TableCell>{[x.vehicle, x.driver].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-right">{t2(Number(x.tons))} ({bb(Number(x.units))})</TableCell>
                <TableCell>{x.post_to_stock ? <Badge>Przyjęte (PZ)</Badge> : <span className="text-muted-foreground text-xs">nie księgowano</span>}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {x.weight_report_path && <Button size="icon" variant="ghost" title="Raport wagowy" onClick={() => openFile(x.weight_report_path)}><Paperclip className="h-4 w-4" /></Button>}
                  {!closed && <Button size="icon" variant="ghost" title="Edytuj" onClick={() => startEdit(x)}><Pencil className="h-4 w-4" /></Button>}
                  {!closed && <Button size="icon" variant="ghost" onClick={() => onDeleteHaul(x.id)}><Trash2 className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {open && !closed && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7 items-end rounded-md bg-muted/50 p-3">
          <div className="space-y-1"><Label className="text-xs">Data</Label><Input type="date" value={h.haul_date} onChange={(e) => setH({ ...h, haul_date: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Auto</Label><Select value={h.vehicle || "__none"} onValueChange={(v) => setH({ ...h, vehicle: v === "__none" ? "" : v })}><SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger><SelectContent><SelectItem value="__none">— brak —</SelectItem>{(fleet.data?.vehicles ?? []).map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs">Kierowca</Label><Select value={h.driver || "__none"} onValueChange={(v) => setH({ ...h, driver: v === "__none" ? "" : v })}><SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger><SelectContent><SelectItem value="__none">— brak —</SelectItem>{(fleet.data?.drivers ?? []).map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs">Big Bagi (szt.)</Label><Input inputMode="numeric" value={h.units} onChange={(e) => setH({ ...h, units: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Tonaż (t)</Label><Input inputMode="decimal" value={h.tons} onChange={(e) => setH({ ...h, tons: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Raport wagowy</Label><Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={h.post} disabled={!!editing?.stock_event_id} onCheckedChange={(v) => setH({ ...h, post: !!v })} />Zaksięguj na magazyn (PZ)
            </label>
            <Button className="w-full" size="sm" onClick={() => addHaul.mutate()} disabled={addHaul.isPending}><Truck className="h-4 w-4 mr-1" />{editing ? "Zapisz zmiany" : "Dodaj kurs"}</Button>
            {editing && <Button className="w-full" size="sm" variant="ghost" onClick={cancelEdit}><X className="h-4 w-4 mr-1" />Anuluj edycję</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
