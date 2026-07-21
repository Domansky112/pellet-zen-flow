import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Trash2, Save, X, Copy, Mail, FileText, PackageCheck, PackageOpen, PackageX, Loader2, Users, ShieldAlert, CopyPlus, ChevronDown, ChevronUp, AlertCircle, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listNotes, addNote, updateNote, deleteNote } from "@/lib/notes.functions";
import { listTemplates, renderTemplateBody } from "@/lib/templates.functions";
import { reserveLead, confirmWydanie, updateLead, releaseReservation, cancelLead, hardDeleteLead, duplicateLead } from "@/lib/leads.functions";
import { listLeadStatuses, setLeadStatusKey } from "@/lib/lead-statuses.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

type Lead = {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  postal_code?: string | null;
  invoice_company?: string | null;
  invoice_nip?: string | null;
  invoice_address?: string | null;
  product?: string | null;
  quantity?: number | null;
  reservation_status?: string;
  status?: string;
  pooling_enabled?: boolean | null;
  has_unloading_equipment?: boolean | null;
  status_key?: string | null;
};


export function LeadDetailDrawer({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [rendered, setRendered] = useState<{ subject: string; body: string } | null>(null);

  const notesQuery = useQuery({
    queryKey: ["lead-notes", lead?.id],
    queryFn: () => listNotes({ data: { lead_id: lead!.id } }),
    enabled: !!lead && open,
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => listTemplates(),
    enabled: open,
  });

  const addFn = useServerFn(addNote);
  const updFn = useServerFn(updateNote);
  const delFn = useServerFn(deleteNote);
  const reserveFn = useServerFn(reserveLead);
  const wydanieFn = useServerFn(confirmWydanie);
  const updateLeadFn = useServerFn(updateLead);
  const releaseFn = useServerFn(releaseReservation);

  const statusesQuery = useQuery({
    queryKey: ["lead-statuses"],
    queryFn: () => listLeadStatuses(),
    enabled: open,
  });
  const setStatusFn = useServerFn(setLeadStatusKey);

  // Editable form state
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    city: "",
    postal_code: "",
    invoice_company: "",
    invoice_nip: "",
    invoice_address: "",
    pooling_enabled: false,
    has_unloading_equipment: false,
  });

  useEffect(() => {
    if (!lead) return;
    setForm({
      first_name: lead.first_name ?? "",
      last_name: lead.last_name ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      city: lead.city ?? "",
      postal_code: lead.postal_code ?? "",
      invoice_company: lead.invoice_company ?? "",
      invoice_nip: lead.invoice_nip ?? "",
      invoice_address: lead.invoice_address ?? "",
      pooling_enabled: !!lead.pooling_enabled,
      has_unloading_equipment: !!lead.has_unloading_equipment,
    });
  }, [lead?.id, open]);

  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const invalidateNotes = () =>
    qc.invalidateQueries({ queryKey: ["lead-notes", lead?.id] });
  const invalidateLeads = () => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["reserved-leads"] });
    qc.invalidateQueries({ queryKey: ["stock-balance"] });
    qc.invalidateQueries({ queryKey: ["stock-events"] });
  };

  const addM = useMutation({
    mutationFn: () => addFn({ data: { lead_id: lead!.id, body: newNote.trim() } }),
    onSuccess: () => { setNewNote(""); invalidateNotes(); toast.success("Notatka dodana"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updM = useMutation({
    mutationFn: (id: string) => updFn({ data: { id, body: editBody.trim() } }),
    onSuccess: () => { setEditingId(null); invalidateNotes(); toast.success("Notatka zaktualizowana"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { invalidateNotes(); toast.success("Notatka usunięta"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reserveM = useMutation({
    mutationFn: () => reserveFn({ data: { lead_id: lead!.id } }),
    onSuccess: () => { invalidateLeads(); toast.success("Zarezerwowano w magazynie"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const wydanieM = useMutation({
    mutationFn: () => wydanieFn({ data: { lead_id: lead!.id } }),
    onSuccess: () => { invalidateLeads(); onOpenChange(false); toast.success("Wydano z magazynu"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const releaseM = useMutation({
    mutationFn: () => releaseFn({ data: { lead_id: lead!.id } }),
    onSuccess: () => { invalidateLeads(); toast.success("Rezerwacja zwolniona"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveM = useMutation({
    mutationFn: () => updateLeadFn({ data: { id: lead!.id, ...form } }),
    onSuccess: () => { invalidateLeads(); toast.success("Zapisano zmiany"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelFn = useServerFn(cancelLead);
  const hardDeleteFn = useServerFn(hardDeleteLead);
  const isAdmin = useIsAdmin();
  const [confirmDelete, setConfirmDelete] = useState<null | "soft" | "hard">(null);
  const [deleteReason, setDeleteReason] = useState("");

  const cancelM = useMutation({
    mutationFn: () => cancelFn({ data: { lead_id: lead!.id, reason: deleteReason } }),
    onSuccess: () => {
      setConfirmDelete(null);
      setDeleteReason("");
      invalidateLeads();
      onOpenChange(false);
      toast.success("Lead anulowany, rezerwacja zwolniona");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const hardDeleteM = useMutation({
    mutationFn: () => hardDeleteFn({ data: { lead_id: lead!.id } }),
    onSuccess: () => {
      setConfirmDelete(null);
      invalidateLeads();
      onOpenChange(false);
      toast.success("Lead trwale usunięty");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const navigate = useNavigate();
  const duplicateFn = useServerFn(duplicateLead);
  const duplicateM = useMutation({
    mutationFn: () => duplicateFn({ data: { lead_id: lead!.id } }),
    onSuccess: (row: any) => {
      invalidateLeads();
      onOpenChange(false);
      toast.success("Utworzono duplikat leada — otwieram do edycji");
      navigate({ to: "/crm", search: { leadId: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyTemplate = async (t: { subject: string | null; body: string; name: string }) => {
    if (!lead) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: userData } = await supabase.auth.getUser();
    const handlowiec =
      (userData?.user?.user_metadata as any)?.full_name ||
      (userData?.user?.user_metadata as any)?.name ||
      userData?.user?.email ||
      "";
    const adres = [lead.postal_code, lead.city].filter(Boolean).join(" ") || (lead as any).invoice_address || "";
    const vars: Record<string, string | number | null | undefined> = {
      // PL variables (canonical)
      imie_klienta: lead.first_name || lead.name,
      nazwisko: lead.last_name ?? "",
      pelna_nazwa: lead.name,
      tonaz: lead.quantity ?? "",
      rodzaj_pelletu: lead.product ?? "",
      cena_transportu: (lead as any).transport_price ?? "",
      adres_dostawy: adres,
      miasto: lead.city ?? "",
      telefon: lead.phone ?? "",
      email: lead.email ?? "",
      imie_handlowca: handlowiec,
      data: new Date().toLocaleDateString("pl-PL"),
      // legacy EN aliases
      name: lead.first_name || lead.name,
      first_name: lead.first_name ?? "",
      last_name: lead.last_name ?? "",
      full_name: lead.name,
      quantity: lead.quantity ?? "",
      product: lead.product ?? "",
      city: lead.city ?? "",
    };
    setRendered({
      subject: renderTemplateBody(t.subject ?? t.name, vars),
      body: renderTemplateBody(t.body, vars),
    });
  };

  const copyOffer = async () => {
    if (!rendered) return;
    await navigator.clipboard.writeText(rendered.body);
    toast.success("Skopiowano treść oferty");
  };

  const mailtoHref = () => {
    if (!rendered || !lead?.email) return "#";
    return `mailto:${lead.email}?subject=${encodeURIComponent(rendered.subject)}&body=${encodeURIComponent(rendered.body)}`;
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            {lead.name}
            {lead.reservation_status === "zarezerwowany" && (
              <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                <PackageCheck className="h-3 w-3 mr-1" /> Zarezerwowany {lead.quantity} t
              </Badge>
            )}
            {lead.reservation_status === "wydany" && (
              <Badge variant="secondary">Wydany</Badge>
            )}
            {lead.has_unloading_equipment ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                Rozładunek własny: TAK
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10">
                Rozładunek własny: NIE
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3">
            <span>{[lead.phone, lead.email, lead.city].filter(Boolean).join(" · ")}</span>
            <span className="flex items-center gap-2 ml-auto">
              <span className="text-xs uppercase tracking-wide">Status:</span>
              <Select
                value={(lead.status_key ?? lead.status ?? "nowy") as string}
                onValueChange={async (v) => {
                  try {
                    await setStatusFn({ data: { id: lead.id, status_key: v } });
                    qc.invalidateQueries({ queryKey: ["leads"] });
                    qc.invalidateQueries({ queryKey: ["reserved-leads"] });
                    toast.success("Status zaktualizowany");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <SelectTrigger className="h-8 w-[190px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {(statusesQuery.data ?? []).filter((s) => s.is_active || s.key === (lead.status_key ?? lead.status)).map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* TOP: Templates panel (collapsible) */}
              <TemplatesPanel
                templates={templatesQuery.data ?? []}
                onApply={applyTemplate}
                activeName={rendered?.subject}
              />

              {/* Actions */}
              <section className="flex flex-wrap gap-2">
                {lead.reservation_status !== "zarezerwowany" && lead.reservation_status !== "wydany" && (
                  <Button size="sm" onClick={() => reserveM.mutate()} disabled={reserveM.isPending || !lead.product || !lead.quantity}>
                    {reserveM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                    Zarezerwuj magazyn
                  </Button>
                )}
                {lead.reservation_status === "zarezerwowany" && (
                  <>
                    <Button size="sm" onClick={() => wydanieM.mutate()} disabled={wydanieM.isPending}>
                      {wydanieM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageOpen className="h-4 w-4 mr-2" />}
                      Wydaj z magazynu
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { if (confirm("Zwolnić rezerwację (bez wydania)?")) releaseM.mutate(); }} disabled={releaseM.isPending}>
                      {releaseM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageX className="h-4 w-4 mr-2" />}
                      Zwolnij rezerwację
                    </Button>
                  </>
                )}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => duplicateM.mutate()} disabled={duplicateM.isPending}
                    title="Utwórz nowe zamówienie dla tego klienta">
                    {duplicateM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CopyPlus className="h-4 w-4 mr-2" />}
                    Duplikuj lead
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDelete("soft")}>
                    <Trash2 className="h-4 w-4 mr-2" /> Anuluj lead
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant="destructive" onClick={() => setConfirmDelete("hard")}>
                      <ShieldAlert className="h-4 w-4 mr-2" /> Trwałe usunięcie
                    </Button>
                  )}
                </div>
              </section>

              {/* Editable lead data */}
              <section className="rounded-lg border border-border/60 bg-background p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Dane leada</div>
                  <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                    {saveM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Zapisz
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="ld-fn">Imię</Label>
                    <Input id="ld-fn" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ld-ln">Nazwisko</Label>
                    <Input id="ld-ln" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ld-ph">Telefon</Label>
                    <Input id="ld-ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ld-em" className={validation.emailInvalid ? "text-destructive" : ""}>
                      E-mail {validation.emailInvalid && <span className="text-xs">— wymagany do wysyłki</span>}
                    </Label>
                    <Input
                      id="ld-em"
                      type="email"
                      value={form.email}
                      aria-invalid={validation.emailInvalid}
                      className={validation.emailInvalid ? "border-destructive ring-destructive focus-visible:ring-destructive" : ""}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ld-city">Miasto</Label>
                    <Input id="ld-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ld-pc">Kod pocztowy</Label>
                    <Input id="ld-pc" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                  </div>
                </div>

                {(validation.productMissing || validation.quantityMissing) && (
                  <div className={`text-xs rounded-md border px-3 py-2 ${validation.productMissing || validation.quantityMissing ? "border-destructive/40 bg-destructive/10 text-destructive" : ""}`}>
                    Uzupełnij <b>produkt</b> i <b>tonaż</b> w karcie leada (edytuj przez „Duplikuj"/nowy lead) — brakuje danych do oferty.
                  </div>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dane do faktury</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="ld-co">Nazwa firmy</Label>
                      <Input id="ld-co" value={form.invoice_company} onChange={(e) => setForm({ ...form, invoice_company: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ld-nip">NIP</Label>
                      <Input id="ld-nip" value={form.invoice_nip} onChange={(e) => setForm({ ...form, invoice_nip: e.target.value })} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="ld-ia">Adres do faktury</Label>
                      <Textarea id="ld-ia" rows={2} value={form.invoice_address} onChange={(e) => setForm({ ...form, invoice_address: e.target.value })} />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Wspólny transport</div>
                      <div className="text-xs text-muted-foreground">Klient zgadza się na konsolidację przewozu</div>
                    </div>
                  </div>
                  <Switch
                    checked={form.pooling_enabled}
                    onCheckedChange={(v) => setForm({ ...form, pooling_enabled: v })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Ma czym rozładować transport</div>
                      <div className="text-xs text-muted-foreground">Klient posiada własny sprzęt (wózek / ładowarka)</div>
                    </div>
                  </div>
                  <Switch
                    checked={form.has_unloading_equipment}
                    onCheckedChange={(v) => setForm({ ...form, has_unloading_equipment: v })}
                  />
                </div>
              </section>

              {/* Rendered offer */}
              {rendered && (
                <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium">Podgląd oferty</div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={copyOffer}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Kopiuj
                      </Button>
                      <Button
                        size="sm"
                        onClick={sendOffer}
                        disabled={!validation.canSend || sendOfferM.isPending}
                        title={!validation.canSend ? "Wypełnij brakujące pola, aby móc wysłać ofertę" : ""}
                      >
                        {sendOfferM.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <Send className="h-3.5 w-3.5 mr-1" />}
                        Wyślij ofertę
                      </Button>
                    </div>
                  </div>

                  {!validation.canSend && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium">Wypełnij brakujące pola, aby móc wysłać ofertę</div>
                        <ul className="mt-1 text-xs list-disc list-inside space-y-0.5">
                          {validation.emailInvalid && <li>Brak poprawnego adresu e-mail klienta</li>}
                          {validation.productMissing && <li>Brak wybranego produktu</li>}
                          {validation.quantityMissing && <li>Brak wpisanego tonażu/ilości</li>}
                          {validation.priceMissing && <li>Brak wyliczonej ceny / kosztu transportu w treści oferty (uzupełnij pola <code>{"{{cena_transportu}}"}</code> / kwoty w treści)</li>}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">Temat: <b>{rendered.subject}</b></div>
                  <Textarea
                    value={rendered.body}
                    onChange={(e) => setRendered({ ...rendered, body: e.target.value })}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </section>
              )}


                <Separator />

                {/* Notes */}
                <section className="space-y-3">
                  <div className="text-sm font-medium">Notatki</div>
                  <div className="flex gap-2 items-start">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Dodaj notatkę…"
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => addM.mutate()}
                      disabled={!newNote.trim() || addM.isPending}
                    >
                      Dodaj
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {notesQuery.data?.map((n) => (
                      <div key={n.id} className="rounded-md border border-border/60 bg-background p-3">
                        {editingId === n.id ? (
                          <div className="space-y-2">
                            <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} />
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5 mr-1" /> Anuluj
                              </Button>
                              <Button size="sm" onClick={() => updM.mutate(n.id)} disabled={!editBody.trim() || updM.isPending}>
                                <Save className="h-3.5 w-3.5 mr-1" /> Zapisz
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="whitespace-pre-wrap text-sm">{n.body}</div>
                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: pl })}
                                {n.edited && <span className="ml-2 italic">· edytowano</span>}
                              </span>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => { setEditingId(n.id); setEditBody(n.body); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => { if (confirm("Usunąć notatkę?")) delM.mutate(n.id); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {notesQuery.data?.length === 0 && (
                      <div className="text-xs text-muted-foreground italic">Brak notatek.</div>
                    )}
                  </div>
              </section>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDelete === "hard" ? (
                <><ShieldAlert className="h-5 w-5 text-destructive" /> Trwałe usunięcie leada</>
              ) : (
                <><Trash2 className="h-5 w-5 text-destructive" /> Anulować lead?</>
              )}
            </DialogTitle>
            <DialogDescription>
              {confirmDelete === "hard"
                ? "Ta operacja jest nieodwracalna. Lead zostanie całkowicie usunięty z bazy. Aktywna rezerwacja zostanie wcześniej zwolniona."
                : lead.reservation_status === "zarezerwowany"
                  ? `Lead zostanie oznaczony jako anulowany, a ${lead.quantity ?? 0} t ${lead.product ?? ""} wróci do dostępnego stanu magazynu.`
                  : "Lead zostanie oznaczony jako anulowany. Będzie ukryty na liście, ale zachowany w bazie."}
            </DialogDescription>
          </DialogHeader>

          {confirmDelete === "soft" && (
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Powód (opcjonalnie)</Label>
              <Textarea
                id="cancel-reason"
                rows={3}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="np. klient zrezygnował, duplikat…"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Zamknij
            </Button>
            {confirmDelete === "hard" ? (
              <Button variant="destructive" onClick={() => hardDeleteM.mutate()} disabled={hardDeleteM.isPending}>
                {hardDeleteM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                Tak, usuń trwale
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => cancelM.mutate()} disabled={cancelM.isPending}>
                {cancelM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Tak, anuluj lead
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
