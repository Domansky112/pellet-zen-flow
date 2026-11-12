import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Lock, LockOpen, Paperclip, Train, Truck, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addStockEvent, deleteStockEvent } from "@/lib/stock.functions";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { estimateInboundFuelCost } from "@/lib/pickup.functions";
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
  const delStock = useServerFn(deleteStockEvent);
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
  const wcosts = q("imp-wcosts", "import_wagon_costs", "created_at");
  const refresh = () => ["imp-suppliers", "imp-payments", "imp-wagons", "imp-hauls", "imp-wcosts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
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
  const [payFile2, setPayFile2] = useState<File | null>(null);
  const [editPay, setEditPay] = useState<any | null>(null);
  const [delPay, setDelPay] = useState<any | null>(null);
  const perTon = num(pay.amount) > 0 && num(pay.tons) > 0 ? num(pay.amount) / num(pay.tons) : 0;
  const resetPayForm = () => { setPay({ ...emptyPay, supplier_id: pay.supplier_id, currency: pay.currency }); setPayFile(null); setPayFile2(null); setEditPay(null); };
  const startEditPay = (p: any) => {
    setEditPay(p);
    setPay({
      supplier_id: p.supplier_id, paid_at: p.paid_at, amount: String(p.amount), currency: p.currency,
      tons: String(p.tons), exchange_rate: p.exchange_rate != null ? String(p.exchange_rate) : "",
      reference: p.reference ?? "", notes: p.notes ?? "",
    });
    setPayFile(null); setPayFile2(null);
  };
  const addPay = useMutation({
    mutationFn: async () => {
      if (!pay.supplier_id) throw new Error("Wybierz dostawcę");
      if (!(num(pay.amount) > 0)) throw new Error("Podaj kwotę");
      if (!(num(pay.tons) > 0)) throw new Error("Podaj liczbę ton");
      const file_path = payFile ? await uploadFile("przelewy", payFile) : (editPay?.file_path ?? null);
      const file_path_2 = payFile2 ? await uploadFile("przelewy", payFile2) : (editPay?.file_path_2 ?? null);
      const row = {
        supplier_id: pay.supplier_id, paid_at: pay.paid_at, amount: num(pay.amount), currency: pay.currency,
        tons: num(pay.tons), exchange_rate: pay.exchange_rate ? num(pay.exchange_rate) : null,
        reference: pay.reference.trim() || null, notes: pay.notes.trim() || null, file_path, file_path_2,
      };
      const { error } = editPay
        ? await (supabase as any).from("import_payments").update(row).eq("id", editPay.id)
        : await (supabase as any).from("import_payments").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { resetPayForm(); refresh(); toast.success(editPay ? "Zaktualizowano przelew" : "Zapisano przelew"); },
    onError: (e: any) => toast.error(e.message),
  });
  const delRow = useMutation({
    mutationFn: async ({ table, id, before }: { table: string; id: string; before?: () => Promise<void> }) => {
      if (before) await before();
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e.message),
  });
  const stockRollup = () => {
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["stock-balance"] });
    qc.invalidateQueries({ queryKey: ["stock-events"] });
  };
  const supLeft = (id: string) => balances.find((b) => b.s.id === id)?.left ?? 0;

  // ---------- Usuwanie z potwierdzeniem + przeliczeniem salda ----------
  const removeWagon = (w: any, reverseStock: boolean) => {
    const hs = (hauls.data ?? []).filter((h) => h.wagon_id === w.id);
    const booked = hs.filter((h) => h.stock_event_id);
    const tons = hs.reduce((a, h) => a + Number(h.tons), 0);
    const units = hs.reduce((a, h) => a + Number(h.units), 0);
    delRow.mutate(
      {
        table: "import_wagons", id: w.id,
        before: async () => {
          if (!reverseStock) return;
          for (const h of booked) await delStock({ data: { id: h.stock_event_id, reason: `Usunięto wagon ${w.wagon_number}` } });
        },
      },
      {
        onSuccess: () => {
          if (reverseStock && booked.length) stockRollup();
          const rev = reverseStock && booked.length ? `, cofnięto ${kursy(booked.length)} przyjęć na magazyn` : "";
          toast.success(`Usunięto wagon ${w.wagon_number} (${kursy(hs.length)}, ${t2(tons)} (${bb(units)}))${rev} — u dostawcy ${t2(supLeft(w.supplier_id) + tons)} do odebrania.`);
        },
      },
    );
  };
  const removeHaul = (w: any, h: any, reverseStock: boolean) => {
    const tons = Number(h.tons), units = Number(h.units);
    delRow.mutate(
      {
        table: "import_hauls", id: h.id,
        before: async () => {
          if (reverseStock && h.stock_event_id) await delStock({ data: { id: h.stock_event_id, reason: `Usunięto kurs wagonu ${w.wagon_number} (${h.haul_date})` } });
        },
      },
      {
        onSuccess: () => {
          if (reverseStock && h.stock_event_id) stockRollup();
          const rev = reverseStock && h.stock_event_id ? ", przyjęcie PZ cofnięte" : "";
          toast.success(`Usunięto kurs ${h.haul_date} (${t2(tons)} (${bb(units)}))${rev} — wagon mniejszy o ${t2(tons)}, u dostawcy ${t2(supLeft(w.supplier_id) + tons)} do odebrania.`);
        },
      },
    );
  };

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
    mutationFn: async ({ w, perTon }: { w: any; perTon: number }) => {
      const close = w.status !== "zamkniety";
      const { error } = await (supabase as any).from("import_wagons").update({ status: close ? "zamkniety" : "otwarty", closed_at: close ? new Date().toISOString() : null }).eq("id", w.id);
      if (error) throw error;
      if (close && perTon > 0) {
        const { error: e2 } = await (supabase as any).rpc("apply_import_wagon_cost", { _wagon_id: w.id, _cost_per_ton: perTon });
        if (e2) throw e2;
      }
      return { close, perTon };
    },
    onSuccess: (r) => { refresh(); if (r.close && r.perTon > 0) toast.success(`Wagon zamknięty — koszt ${money(r.perTon, "zł")}/t naliczony do FIFO`); },
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
            <div className="space-y-1">
              <Label>Potwierdzenie 1 (PDF/zdjęcie)</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setPayFile(e.target.files?.[0] ?? null)} />
              {editPay?.file_path && !payFile && <button type="button" className="text-xs text-primary underline" onClick={() => openFile(editPay.file_path)}>Zachowuję obecny plik — podgląd</button>}
            </div>
            <div className="space-y-1">
              <Label>Potwierdzenie 2 (opcjonalnie)</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setPayFile2(e.target.files?.[0] ?? null)} />
              {editPay?.file_path_2 && !payFile2 && <button type="button" className="text-xs text-primary underline" onClick={() => openFile(editPay.file_path_2)}>Zachowuję obecny plik — podgląd</button>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editPay && <Button variant="outline" onClick={resetPayForm}><X className="h-4 w-4 mr-1" />Anuluj edycję</Button>}
            <Button onClick={() => addPay.mutate()} disabled={addPay.isPending}>{addPay.isPending ? "Zapisuję…" : editPay ? "Zapisz zmiany" : "Zapisz przelew"}</Button>
          </div>
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
                    {p.file_path && <Button size="icon" variant="ghost" title="Potwierdzenie 1" onClick={() => openFile(p.file_path)}><Paperclip className="h-4 w-4" /></Button>}
                    {p.file_path_2 && <Button size="icon" variant="ghost" title="Potwierdzenie 2" onClick={() => openFile(p.file_path_2)}><Paperclip className="h-4 w-4 text-muted-foreground" /></Button>}
                    <Button size="icon" variant="ghost" title="Edytuj" onClick={() => startEditPay(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelPay(p)}><Trash2 className="h-4 w-4" /></Button>
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
              leftTons={supLeft(w.supplier_id)}
              costs={(wcosts.data ?? []).filter((c) => c.wagon_id === w.id)}
              onToggle={(perTon: number) => toggleWag.mutate({ w, perTon })}
              onDelete={(reverseStock: boolean) => removeWagon(w, reverseStock)}
              onDeleteHaul={(h: any, reverseStock: boolean) => removeHaul(w, h, reverseStock)}
              addStock={addStock} refresh={refresh} />
          ))}
          {wagons.data?.length === 0 && <p className="text-sm text-muted-foreground">Brak wagonów.</p>}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!delPay}
        onOpenChange={(v) => !v && setDelPay(null)}
        title="Usunąć przelew?"
        confirmLabel="Usuń przelew"
        pending={delRow.isPending}
        description={delPay && (
          <>
            <p>{delPay.paid_at} · {supName(delPay.supplier_id)} · <b>{money(Number(delPay.amount), delPay.currency)}</b> za {t2(Number(delPay.tons))} ({money(Number(delPay.amount) / Number(delPay.tons), delPay.currency)}/t).</p>
            <p>Po usunięciu u dostawcy zostanie <b>{t2(supLeft(delPay.supplier_id) + Number(delPay.tons))}</b> do odebrania.</p>
            {delPay.file_path && <p>Dołączone potwierdzenie przelewu też zostanie usunięte.</p>}
          </>
        )}
        onConfirm={() => {
          if (!delPay) return;
          const p = delPay;
          setDelPay(null);
          delRow.mutate(
            { table: "import_payments", id: p.id },
            { onSuccess: () => toast.success(`Usunięto przelew — do odebrania u dostawcy: ${t2(supLeft(p.supplier_id) + Number(p.tons))}`) },
          );
        }}
      />
    </div>
  );
}

function WagonCard({ wagon, supplierName, hauls, costs, plnPerTon, leftTons, onToggle, onDelete, onDeleteHaul, addStock, refresh }: {
  wagon: any; supplierName: string; hauls: any[]; costs: any[]; plnPerTon: number; leftTons: number;
  onToggle: (perTon: number) => void; onDelete: (reverseStock: boolean) => void; onDeleteHaul: (haul: any, reverseStock: boolean) => void;
  addStock: any; refresh: () => void;
}) {
  const closed = wagon.status === "zamkniety";
  const [open, setOpen] = useState(false);
  const [delW, setDelW] = useState(false);
  const [delH, setDelH] = useState<any | null>(null);
  const [revStock, setRevStock] = useState(false);
  const [impact, setImpact] = useState<{ booked: number; tons: number; units: number; consumed: number } | null>(null);
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
  const realPerTon = sumT > 0
    ? (plnPerTon * sumT + costs.reduce((a, x) => a + Number(x.amount) * (x.currency === "PLN" ? 1 : Number(x.exchange_rate ?? 0)), 0)
       + (Number(wagon.fuel_cost_per_haul ?? 0) || 0) * hauls.length) / sumT
    : 0;

  // Ile przyjęć na magazyn (i wydań FIFO z tych partii) zależy od wskazanych zdarzeń
  const stockImpact = async (eventIds: string[]) => {
    const booked = hauls.filter((h) => h.stock_event_id && eventIds.includes(h.stock_event_id));
    let consumed = 0;
    if (eventIds.length) {
      const { data: lots } = await supabase.from("stock_lots").select("id").in("stock_event_id", eventIds);
      const lotIds = (lots ?? []).map((l: any) => l.id);
      if (lotIds.length) {
        const { count } = await supabase.from("stock_lot_consumptions").select("id", { count: "exact", head: true }).in("lot_id", lotIds);
        consumed = count ?? 0;
      }
    }
    return {
      booked: booked.length,
      tons: booked.reduce((a, h) => a + Number(h.tons), 0),
      units: booked.reduce((a, h) => a + Number(h.units), 0),
      consumed,
    };
  };
  const openWagonDelete = async () => {
    const ids = hauls.map((h) => h.stock_event_id).filter(Boolean) as string[];
    const info = await stockImpact(ids);
    setImpact(info);
    setRevStock(info.booked > 0 && info.consumed === 0);
    setDelW(true);
  };
  const openHaulDelete = async (x: any) => {
    const info = await stockImpact(x.stock_event_id ? [x.stock_event_id] : []);
    setImpact(info);
    setRevStock(info.booked > 0 && info.consumed === 0);
    setDelH(x);
  };

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
          <Button size="sm" variant={closed ? "outline" : "default"} onClick={() => onToggle(realPerTon)}>
            {closed ? <><LockOpen className="h-4 w-4 mr-1" />Otwórz do korekty</> : <><Lock className="h-4 w-4 mr-1" />Zamknij wagon</>}
          </Button>
          <Button size="icon" variant="ghost" onClick={openWagonDelete}><Trash2 className="h-4 w-4" /></Button>
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
                  {!closed && <Button size="icon" variant="ghost" onClick={() => openHaulDelete(x)}><Trash2 className="h-4 w-4" /></Button>}
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
      {open && <WagonCosts wagon={wagon} costs={costs} sumT={sumT} haulsCount={hauls.length} plnPerTon={plnPerTon} refresh={refresh} />}
      <WagonSummary wagon={wagon} costs={costs} sumT={sumT} haulsCount={hauls.length} plnPerTon={plnPerTon} />

      <ConfirmDeleteDialog
        open={delW}
        onOpenChange={setDelW}
        title={`Usunąć wagon ${wagon.wagon_number}?`}
        confirmLabel="Usuń wagon"
        onConfirm={() => { setDelW(false); onDelete(revStock); }}
        description={
          <>
            <p>Zniknie {kursy(hauls.length)} · <b>{t2(sumT)} ({bb(sumU)})</b>{costs.length > 0 ? ` oraz ${costs.length} kosztów wagonu` : ""}.</p>
            <p>Po usunięciu u dostawcy {supplierName} zostanie <b>{t2(leftTons + sumT)}</b> do odebrania.</p>
            {closed && <p>Wagon jest zamknięty — jeśli nie cofniesz przyjęć, wycena FIFO tych partii zostanie w Magazynie.</p>}
          </>
        }
      >
        {impact && impact.booked > 0 && (
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
            <Checkbox checked={revStock} onCheckedChange={(v) => setRevStock(!!v)} className="mt-0.5" />
            <span>
              Cofnij przyjęcia na magazyn ({kursy(impact.booked)} · {t2(impact.tons)} ({bb(impact.units)}))
              {impact.consumed > 0 && (
                <span className="block text-xs text-destructive mt-1">
                  Te partie mają już {impact.consumed} wydań — cofnięcie usunie też ich historię FIFO.
                </span>
              )}
            </span>
          </label>
        )}
      </ConfirmDeleteDialog>

      <ConfirmDeleteDialog
        open={!!delH}
        onOpenChange={(v) => !v && setDelH(null)}
        title="Usunąć kurs?"
        confirmLabel="Usuń kurs"
        onConfirm={() => { const x = delH; setDelH(null); if (x) onDeleteHaul(x, revStock); }}
        description={delH && (
          <>
            <p>{delH.haul_date} · {[delH.vehicle, delH.driver].filter(Boolean).join(" · ") || "bez auta i kierowcy"} · <b>{t2(Number(delH.tons))} ({bb(Number(delH.units))})</b>.</p>
            <p>Wagon {wagon.wagon_number} zostanie przeliczony na <b>{t2(sumT - Number(delH.tons))} ({bb(sumU - Number(delH.units))})</b>, a u dostawcy <b>{t2(leftTons + Number(delH.tons))}</b> do odebrania.</p>
            {delH.post_to_stock && <p>Kurs był zaksięgowany na magazyn (PZ).</p>}
          </>
        )}
      >
        {delH?.stock_event_id && (
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
            <Checkbox checked={revStock} onCheckedChange={(v) => setRevStock(!!v)} className="mt-0.5" />
            <span>
              Cofnij przyjęcie na magazyn ({t2(Number(delH.tons))} ({bb(Number(delH.units))}))
              {impact && impact.consumed > 0 && (
                <span className="block text-xs text-destructive mt-1">
                  Ta partia ma już {impact.consumed} wydań — cofnięcie usunie też ich historię FIFO.
                </span>
              )}
            </span>
          </label>
        )}
      </ConfirmDeleteDialog>
    </div>
  );
}

const COST_KINDS: Record<string, string> = { clo: "Cło", obsluga: "Obsługa wagonu", przeladunek: "Przeładunek", inne: "Inny koszt" };
const pln = (n: number) => money(n, "zł");
const costPln = (c: any) => Number(c.amount) * (c.currency === "PLN" ? 1 : Number(c.exchange_rate ?? 0));

function WagonCosts({ wagon, costs, sumT, haulsCount, plnPerTon, refresh }: {
  wagon: any; costs: any[]; sumT: number; haulsCount: number; plnPerTon: number; refresh: () => void;
}) {
  const closed = wagon.status === "zamkniety";
  const estimate = useServerFn(estimateInboundFuelCost);
  const locs = useQuery({
    queryKey: ["import-pickup-locs"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pickup_locations").select("id, name, default_km").eq("is_active", true).order("name");
      return (data ?? []) as any[];
    },
  });
  const empty = { kind: "clo", description: "", amount: "", currency: "PLN", exchange_rate: "" };
  const [c, setC] = useState(empty);
  const [delC, setDelC] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [fuel, setFuel] = useState<string>(wagon.fuel_cost_per_haul != null ? String(wagon.fuel_cost_per_haul) : "");

  const save = useMutation({
    mutationFn: async () => {
      const amount = num(c.amount);
      if (!(amount > 0)) throw new Error("Podaj kwotę");
      if (c.currency !== "PLN" && !(num(c.exchange_rate) > 0)) throw new Error("Podaj kurs do PLN");
      const file_path = file ? await uploadFile(`wagony/${wagon.id}/koszty`, file) : (editing?.file_path ?? null);
      const row = { wagon_id: wagon.id, kind: c.kind, description: c.description.trim() || null, amount, currency: c.currency,
        exchange_rate: c.currency === "PLN" ? null : num(c.exchange_rate), file_path };
      const { error } = editing
        ? await (supabase as any).from("import_wagon_costs").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editing.id)
        : await (supabase as any).from("import_wagon_costs").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { setC(empty); setFile(null); setEditing(null); refresh(); toast.success("Zapisano koszt"); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("import_wagon_costs").delete().eq("id", id); if (error) throw error; },
    onSuccess: refresh, onError: (e: any) => toast.error(e.message),
  });
  const saveWagon = async (patch: any) => {
    const { error } = await (supabase as any).from("import_wagons").update(patch).eq("id", wagon.id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const calcFuel = async (locId: string) => {
    await saveWagon({ pickup_location_id: locId || null });
    if (!locId) return;
    try {
      const r: any = await estimate({ data: { pickup_location_id: locId, consumption: 30 } });
      if (r?.cost == null) return toast.warning("Nie udało się wyliczyć trasy — wpisz koszt paliwa ręcznie");
      setFuel(String(r.cost));
      await saveWagon({ fuel_cost_per_haul: r.cost });
      toast.success(`Paliwo: ${r.km} km (tam i z powrotem) · ${pln(r.cost)} na kurs`);
    } catch (e: any) { toast.error(e.message); }
  };

  const extra = costs.reduce((a, x) => a + costPln(x), 0);
  const fuelTotal = (Number(wagon.fuel_cost_per_haul ?? 0) || 0) * haulsCount;
  const goods = plnPerTon * sumT;
  const total = goods + extra + fuelTotal;
  const perTon = sumT > 0 ? total / sumT : 0;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="text-sm font-semibold">Koszty wagonu</div>
      {costs.length > 0 && (
        <Table>
          <TableHeader><TableRow><TableHead>Rodzaj</TableHead><TableHead>Opis</TableHead><TableHead className="text-right">Kwota</TableHead><TableHead className="text-right">W PLN</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {costs.map((x) => (
              <TableRow key={x.id}>
                <TableCell>{COST_KINDS[x.kind] ?? x.kind}</TableCell>
                <TableCell>{x.description ?? ""}</TableCell>
                <TableCell className="text-right">{money(Number(x.amount), x.currency)}</TableCell>
                <TableCell className="text-right">{pln(costPln(x))}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {x.file_path && <Button size="icon" variant="ghost" title="Faktura" onClick={() => openFile(x.file_path)}><Paperclip className="h-4 w-4" /></Button>}
                  {!closed && <Button size="icon" variant="ghost" title="Edytuj" onClick={() => { setEditing(x); setC({ kind: x.kind, description: x.description ?? "", amount: String(x.amount), currency: x.currency, exchange_rate: x.exchange_rate != null ? String(x.exchange_rate) : "" }); setFile(null); }}><Pencil className="h-4 w-4" /></Button>}
                  {!closed && <Button size="icon" variant="ghost" onClick={() => setDelC(x)}><Trash2 className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!closed && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7 items-end rounded-md bg-muted/50 p-3">
          <div className="space-y-1"><Label className="text-xs">Rodzaj</Label>
            <Select value={c.kind} onValueChange={(v) => setC({ ...c, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(COST_KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs">Opis</Label><Input value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Kwota</Label><Input inputMode="decimal" value={c.amount} onChange={(e) => setC({ ...c, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Waluta</Label>
            <Select value={c.currency} onValueChange={(v) => setC({ ...c, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs">Kurs do PLN</Label><Input inputMode="decimal" disabled={c.currency === "PLN"} value={c.currency === "PLN" ? "" : c.exchange_rate} onChange={(e) => setC({ ...c, exchange_rate: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Faktura</Label><Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-2">
            <Button className="w-full" size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Plus className="h-4 w-4 mr-1" />{editing ? "Zapisz koszt" : "Dodaj koszt"}</Button>
            {editing && <Button className="w-full" size="sm" variant="ghost" onClick={() => { setEditing(null); setC(empty); }}><X className="h-4 w-4 mr-1" />Anuluj</Button>}
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3 items-end">
        <div className="space-y-1"><Label className="text-xs">Paliwo — miejsce odbioru (np. Małaszewicze)</Label>
          <Select value={wagon.pickup_location_id ?? "__none"} disabled={closed} onValueChange={(v) => calcFuel(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
            <SelectContent><SelectItem value="__none">— brak —</SelectItem>{(locs.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1"><Label className="text-xs">Paliwo na 1 kurs (zł)</Label>
          <Input inputMode="decimal" disabled={closed} value={fuel} onChange={(e) => setFuel(e.target.value)}
            onBlur={() => { const v = fuel.trim() ? num(fuel) : null; if (v !== (wagon.fuel_cost_per_haul != null ? Number(wagon.fuel_cost_per_haul) : null)) saveWagon({ fuel_cost_per_haul: v }); }} /></div>
        <div className="text-sm text-muted-foreground">Paliwo razem: <b className="text-foreground">{pln(fuelTotal)}</b> ({kursy(haulsCount)})</div>
      </div>

      <ConfirmDeleteDialog
        open={!!delC}
        onOpenChange={(v) => !v && setDelC(null)}
        title="Usunąć koszt wagonu?"
        confirmLabel="Usuń koszt"
        description={delC && (
          <>
            <p>{COST_KINDS[delC.kind] ?? delC.kind}{delC.description ? ` — ${delC.description}` : ""} · <b>{money(Number(delC.amount), delC.currency)}</b>{delC.currency !== "PLN" ? ` (${pln(costPln(delC))})` : ""}.</p>
            <p>Koszt wagonu przeliczy się: <b>{pln(sumT > 0 ? (goods + extra - costPln(delC) + fuelTotal) / sumT : 0)}/t</b>{closed ? " (wagon zamknięty — zapisana wycena FIFO zostanie bez zmian)" : ""}.</p>
            {delC.file_path && <p>Dołączona faktura też zostanie usunięta.</p>}
          </>
        )}
        onConfirm={() => {
          if (!delC) return;
          const x = delC;
          setDelC(null);
          const after = sumT > 0 ? (goods + extra - costPln(x) + fuelTotal) / sumT : 0;
          del.mutate(x.id, { onSuccess: () => toast.success(`Usunięto koszt — koszt wagonu: ${pln(after)}/t`) });
        }}
      />
    </div>
  );
}

function WagonSummary({ wagon, costs, sumT, haulsCount, plnPerTon }: { wagon: any; costs: any[]; sumT: number; haulsCount: number; plnPerTon: number }) {
  const closed = wagon.status === "zamkniety";
  const extra = costs.reduce((a, x) => a + costPln(x), 0);
  const fuelTotal = (Number(wagon.fuel_cost_per_haul ?? 0) || 0) * haulsCount;
  const goods = plnPerTon * sumT;
  const total = goods + extra + fuelTotal;
  const perTon = sumT > 0 ? total / sumT : 0;
  return (
      <div className="rounded-md bg-muted/50 p-3 text-sm grid gap-1 sm:grid-cols-2">
        <div>Pellet (śr. z przelewów {pln(plnPerTon)}/t): <b>{pln(goods)}</b></div>
        <div>Cło, obsługa, przeładunek, inne: <b>{pln(extra)}</b></div>
        <div>Paliwo z miejsca odbioru: <b>{pln(fuelTotal)}</b></div>
        <div>Razem: <b>{pln(total)}</b></div>
        <div className="sm:col-span-2 text-base">
          {closed
            ? <>Realny koszt za tonę: <b>{pln(Number(wagon.real_cost_per_ton ?? perTon))}/t</b> <span className="text-xs text-muted-foreground">— naliczony do FIFO</span></>
            : <>Szacowany koszt za tonę: <b>{pln(perTon)}/t</b> <span className="text-xs text-muted-foreground">— trafi do FIFO po zamknięciu wagonu</span></>}
        </div>
      </div>
  );
}
