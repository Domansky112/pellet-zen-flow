import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Handshake, Plus, Pencil, Trash2, Wallet, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listAffiliatePartners, upsertAffiliatePartner, deleteAffiliatePartner,
  listAffiliateCommissions, upsertAffiliateCommission, deleteAffiliateCommission,
  settleAffiliate, searchLeadsForAffiliate, AFFILIATE_METHODS,
} from "@/lib/affiliates.functions";

const zl = (n: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(n ?? 0));
const today = () => new Date().toISOString().slice(0, 10);

export function AffiliatesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAffiliatePartners);
  const upsertFn = useServerFn(upsertAffiliatePartner);
  const delFn = useServerFn(deleteAffiliatePartner);

  const [editing, setEditing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["affiliate-partners"], queryFn: () => listFn() });
  const partners = data?.partners ?? [];

  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["affiliate-partners"] });
      toast.success("Zapisano partnera");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["affiliate-partners"] });
      toast.success("Usunięto partnera");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detail = partners.find((p) => p.id === detailId) ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" /> Afiliacje / polecenia
          </CardTitle>
          <CardDescription>
            Partnerzy polecający, naliczone prowizje i zbiorcze rozliczenia (koszt trafia do modułu Płatności).
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> Nowy partner
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Ładowanie…</p>
        ) : partners.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            Brak partnerów. Dodaj pierwszą osobę, której płacisz za polecenia.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead className="text-right">Do zapłaty</TableHead>
                <TableHead className="text-right">Wypłacono</TableHead>
                <TableHead className="w-[220px] text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.full_name}</div>
                    {p.status !== "aktywny" && (
                      <Badge variant="outline" className="mt-1">nieaktywny</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[p.phone, p.email].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={p.pending_total > 0 ? "font-semibold text-primary" : ""}>
                      {zl(p.pending_total)}
                    </span>
                    {p.pending_count > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">({p.pending_count})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {zl(p.paid_total)}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="secondary" onClick={() => setDetailId(p.id)}>
                      <Receipt className="h-4 w-4 mr-1" /> Prowizje
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(p);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Usunąć partnera ${p.full_name} wraz z jego pozycjami?`)) remove.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <PartnerDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        partner={editing}
        submitting={save.isPending}
        onSubmit={(p) => save.mutate(p)}
      />
      {detail && (
        <CommissionsDialog
          open={!!detailId}
          onOpenChange={(o) => !o && setDetailId(null)}
          partner={detail}
        />
      )}
    </Card>
  );
}

function PartnerDialog({
  open, onOpenChange, partner, submitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  partner: any | null;
  submitting: boolean;
  onSubmit: (p: any) => void;
}) {
  const [form, setForm] = useState<any>({});
  const key = partner?.id ?? "new";
  const value = { full_name: "", phone: "", email: "", nip: "", bank_account: "", notes: "", status: "aktywny", ...(partner ?? {}), ...form };

  function set(k: string, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setForm({});
        onOpenChange(o);
      }}
    >
      <DialogContent key={key}>
        <DialogHeader>
          <DialogTitle>{partner ? "Edytuj partnera" : "Nowy partner afiliacyjny"}</DialogTitle>
          <DialogDescription>Osoba lub firma, której płacisz za polecenie klienta.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nazwa / imię i nazwisko *</Label>
            <Input value={value.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Telefon</Label>
              <Input value={value.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={value.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>NIP</Label>
              <Input value={value.nip ?? ""} onChange={(e) => set("nip", e.target.value)} />
            </div>
            <div>
              <Label>Numer konta</Label>
              <Input value={value.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={value.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aktywny">Aktywny</SelectItem>
                <SelectItem value="nieaktywny">Nieaktywny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notatka</Label>
            <Textarea value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button
            disabled={submitting || !value.full_name?.trim()}
            onClick={() =>
              onSubmit({
                id: partner?.id,
                full_name: value.full_name,
                phone: value.phone || null,
                email: value.email || null,
                nip: value.nip || null,
                bank_account: value.bank_account || null,
                notes: value.notes || null,
                status: value.status,
              })
            }
          >
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommissionsDialog({
  open, onOpenChange, partner,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  partner: any;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAffiliateCommissions);
  const addFn = useServerFn(upsertAffiliateCommission);
  const delFn = useServerFn(deleteAffiliateCommission);
  const settleFn = useServerFn(settleAffiliate);
  const searchFn = useServerFn(searchLeadsForAffiliate);

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [tons, setTons] = useState("");
  const [ratePerTon, setRatePerTon] = useState("");
  const [date, setDate] = useState(today());
  const [leadQuery, setLeadQuery] = useState("");
  const [lead, setLead] = useState<any | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [settleOpen, setSettleOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState("przelew");
  const [settleNotes, setSettleNotes] = useState("");

  const { data } = useQuery({
    queryKey: ["affiliate-commissions", partner.id],
    queryFn: () => listFn({ data: { partner_id: partner.id } }),
    enabled: open,
  });
  const { data: leadRes } = useQuery({
    queryKey: ["affiliate-lead-search", leadQuery],
    queryFn: () => searchFn({ data: { q: leadQuery } }),
    enabled: leadQuery.trim().length >= 2,
  });

  const commissions: any[] = data?.commissions ?? [];
  const settlements: any[] = data?.settlements ?? [];
  const pending = commissions.filter((c) => c.status === "nierozliczona");
  const pendingTotal = pending.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const chosen = selected.filter((id) => pending.some((p) => p.id === id));
  const selectedTotal = chosen.length
    ? pending.filter((p) => chosen.includes(p.id)).reduce((s, c) => s + Number(c.amount ?? 0), 0)
    : pendingTotal;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["affiliate-commissions", partner.id] });
    qc.invalidateQueries({ queryKey: ["affiliate-partners"] });
  }

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          partner_id: partner.id,
          lead_id: lead?.id ?? null,
          description: desc.trim(),
          amount,
          commission_date: date,
        },
      }),
    onSuccess: () => {
      toast.success("Dodano pozycję");
      setDesc("");
      setAmount("");
      setLead(null);
      setLeadQuery("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto pozycję");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settle = useMutation({
    mutationFn: () =>
      settleFn({
        data: {
          partner_id: partner.id,
          commission_ids: chosen.length ? chosen : null,
          paid_at: paidAt,
          method: method as any,
          notes: settleNotes || null,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`Rozliczono ${r.count} poz. na ${zl(r.total)}`);
      setSettleOpen(false);
      setSelected([]);
      setSettleNotes("");
      refresh();
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["financial-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-4 w-4" /> {partner.full_name}
          </DialogTitle>
          <DialogDescription>
            Dodawaj kolejne prowizje i zamknij okno bez rozliczania — kwoty sumują się do wypłaty.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-3 space-y-3">
          <div className="text-sm font-medium">Nowa pozycja prowizji</div>
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <Label>Opis *</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="np. Polecenie klienta z Radzynia" />
            </div>
            <div>
              <Label>Kwota (zł) *</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="200" />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Powiązany lead (opcjonalnie)</Label>
            {lead ? (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{lead.lead_number} · {lead.name}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setLead(null)}>zmień</Button>
              </div>
            ) : (
              <>
                <Input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Szukaj po nazwie lub numerze #…"
                />
                {(leadRes?.leads?.length ?? 0) > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded border text-sm">
                    {leadRes!.leads.map((l: any) => (
                      <button
                        key={l.id}
                        type="button"
                        className="block w-full px-2 py-1 text-left hover:bg-muted"
                        onClick={() => {
                          setLead(l);
                          setLeadQuery("");
                        }}
                      >
                        {l.lead_number} · {l.name} {l.city ? `· ${l.city}` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <Button
            size="sm"
            disabled={add.isPending || !desc.trim() || !amount.trim()}
            onClick={() => add.mutate()}
          >
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Do rozliczenia: <span className="text-primary font-semibold">{zl(pendingTotal)}</span>
              {chosen.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  zaznaczono {chosen.length} poz. — {zl(selectedTotal)}
                </span>
              )}
            </div>
            <Button size="sm" disabled={pending.length === 0} onClick={() => setSettleOpen(true)}>
              <Wallet className="h-4 w-4 mr-1" />
              {chosen.length ? "Rozlicz zaznaczone" : "Rozlicz całość"}
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Opis</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    Brak pozycji.
                  </TableCell>
                </TableRow>
              )}
              {commissions.map((c) => {
                const isPending = c.status === "nierozliczona";
                return (
                  <TableRow key={c.id} className={isPending ? "" : "opacity-60"}>
                    <TableCell>
                      {isPending && (
                        <Checkbox
                          checked={selected.includes(c.id)}
                          onCheckedChange={(v) =>
                            setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{c.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.leads ? `${c.leads.lead_number ?? ""} ${c.leads.name ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{c.commission_date}</TableCell>
                    <TableCell className="text-right">{zl(Number(c.amount))}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={isPending ? "outline" : "secondary"}>
                        {isPending ? "nierozliczona" : "wypłacona"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isPending && (
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {settlements.length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Historia wypłat</div>
            {settlements.map((s) => (
              <div key={s.id} className="flex justify-between rounded border px-3 py-1.5 text-sm">
                <span>{s.paid_at} · {AFFILIATE_METHODS.find((m) => m.value === s.method)?.label ?? s.method}</span>
                <span className="font-medium">{zl(Number(s.total_amount))}</span>
              </div>
            ))}
          </div>
        )}

        <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rozliczenie prowizji — {partner.full_name}</DialogTitle>
              <DialogDescription>
                Wypłata {zl(selectedTotal)} zostanie zapisana jako koszt w module Płatności.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data wypłaty</Label>
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
                <div>
                  <Label>Forma</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AFFILIATE_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notatka</Label>
                <Textarea value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettleOpen(false)}>Anuluj</Button>
              <Button disabled={settle.isPending} onClick={() => settle.mutate()}>
                Wypłać {zl(selectedTotal)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
