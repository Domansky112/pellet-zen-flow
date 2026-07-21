import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Trash2, Save, X, Copy, Mail, FileText, PackageCheck, PackageOpen, PackageX, Loader2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listNotes, addNote, updateNote, deleteNote } from "@/lib/notes.functions";
import { listTemplates, renderTemplateBody } from "@/lib/templates.functions";
import { reserveLead, confirmWydanie, updateLead, releaseReservation } from "@/lib/leads.functions";
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

  const applyTemplate = (t: { subject: string | null; body: string; name: string }) => {
    if (!lead) return;
    const vars = {
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
          </DialogTitle>
          <DialogDescription>
            {[lead.phone, lead.email, lead.city].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] flex-1 min-h-0">
          {/* LEFT: templates */}
          <aside className="border-r bg-muted/20 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" /> Szablony ofert
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {templatesQuery.data?.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left rounded-md border border-border/60 bg-background px-3 py-2 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    {t.product && <div className="text-xs text-muted-foreground mt-0.5">{t.product}</div>}
                  </button>
                ))}
                {templatesQuery.data?.length === 0 && (
                  <div className="text-xs text-muted-foreground p-3">Brak szablonów</div>
                )}
              </div>
            </ScrollArea>
          </aside>

          {/* RIGHT: content */}
          <div className="flex flex-col min-h-0">
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Actions */}
                <section className="flex flex-wrap gap-2">
                  {lead.reservation_status !== "zarezerwowany" && lead.reservation_status !== "wydany" && (
                    <Button size="sm" onClick={() => reserveM.mutate()} disabled={reserveM.isPending || !lead.product || !lead.quantity}>
                      {reserveM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                      Zarezerwuj magazyn
                    </Button>
                  )}
                  {lead.reservation_status === "zarezerwowany" && (
                    <Button size="sm" onClick={() => wydanieM.mutate()} disabled={wydanieM.isPending}>
                      {wydanieM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageOpen className="h-4 w-4 mr-2" />}
                      Wydaj z magazynu
                    </Button>
                  )}
                </section>

                {/* Rendered offer */}
                {rendered && (
                  <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">Podgląd oferty</div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={copyOffer}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Kopiuj
                        </Button>
                        {lead.email && (
                          <Button size="sm" asChild>
                            <a href={mailtoHref()}><Mail className="h-3.5 w-3.5 mr-1" /> Wyślij mail</a>
                          </Button>
                        )}
                      </div>
                    </div>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
