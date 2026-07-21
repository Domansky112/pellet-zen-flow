import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLead } from "@/lib/leads.functions";

type Props = {
  defaults?: Partial<{
    source: "www" | "email" | "b2b" | "telefon" | "inne";
    pooling_enabled: boolean;
    product: "pellet_paleta" | "pellet_bigbag" | "inne";
  }>;
  triggerLabel?: string;
  variant?: "default" | "outline" | "secondary";
};

export function NewLeadDialog({ defaults, triggerLabel = "Nowy lead", variant = "default" }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const createFn = useServerFn(createLead);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    company: "",
    city: "",
    postal_code: "",
    source: defaults?.source ?? "telefon",
    product: defaults?.product ?? "pellet_paleta",
    quantity: "",
    notes: "",
    pooling_enabled: defaults?.pooling_enabled ?? false,
    pooling_wait_until:
      defaults?.pooling_enabled
        ? new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10)
        : "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const fullName = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ")
    || form.company.trim();

  const mutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          name: fullName,
          email: form.email.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          postal_code: form.postal_code.trim(),
          source: form.source,
          product: form.product,
          quantity: form.quantity ? Number(form.quantity) : null,
          notes: form.notes.trim(),
          priority: 0,
          pooling_enabled: form.pooling_enabled,
          pooling_wait_until: form.pooling_enabled ? form.pooling_wait_until || null : null,
        },
      }),
    onSuccess: (row: any) => {
      if (row?._reservation_error) {
        toast.warning(`Lead dodany, ale rezerwacja nie powiodła się: ${row._reservation_error}`);
      } else if (form.pooling_enabled && form.product && Number(form.quantity) > 0) {
        toast.success(`Lead dodany. Zarezerwowano ${form.quantity} t w magazynie.`);
      } else {
        toast.success("Lead dodany");
      }
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      qc.invalidateQueries({ queryKey: ["reserved-leads"] });
      qc.invalidateQueries({ queryKey: ["stock-balance"] });
      qc.invalidateQueries({ queryKey: ["stock-events"] });
      setOpen(false);
      setForm((f) => ({
        ...f,
        first_name: "", last_name: "", phone: "", email: "", company: "",
        city: "", postal_code: "", quantity: "", notes: "",
      }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const willReserve = form.pooling_enabled && !!form.product && Number(form.quantity) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="mr-2 h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowy lead</DialogTitle>
          <DialogDescription>Ręczne dodanie zgłoszenia (telefon, targ, polecenie).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Imię *</Label>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Nazwisko</Label>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Firma (opcjonalnie)</Label>
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Jeśli klient B2B" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Telefon *</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>E-mail *</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Miasto</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Kod pocztowy</Label>
              <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="00-000" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Kanał</Label>
              <Select value={form.source} onValueChange={(v) => set("source", v as typeof form.source)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefon">Telefon</SelectItem>
                  <SelectItem value="www">WWW</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="b2b">B2B</SelectItem>
                  <SelectItem value="inne">Inne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Produkt</Label>
              <Select value={form.product} onValueChange={(v) => set("product", v as typeof form.product)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pellet_paleta">Pellet paleta</SelectItem>
                  <SelectItem value="pellet_bigbag">Pellet big-bag</SelectItem>
                  <SelectItem value="inne">Inne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Ilość (t)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notatka</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border/60 p-3">
            <Checkbox
              id="pool"
              checked={form.pooling_enabled}
              onCheckedChange={(c) => set("pooling_enabled", Boolean(c))}
            />
            <Label htmlFor="pool" className="flex-1 cursor-pointer text-sm font-normal">
              Zgoda na wspólny transport (poczekalnia konsolidacji)
            </Label>
          </div>
          {form.pooling_enabled && (
            <div className="grid gap-1.5">
              <Label>Czeka do</Label>
              <Input
                type="date"
                value={form.pooling_wait_until}
                onChange={(e) => set("pooling_wait_until", e.target.value)}
              />
            </div>
          )}
          {willReserve && (
            <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              <PackageCheck className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <b>Automatyczna rezerwacja magazynu:</b> zapisanie leada zablokuje{" "}
                <b>{form.quantity} t {form.product === "pellet_paleta" ? "palet" : form.product === "pellet_bigbag" ? "big-bagów" : "produktu"}</b>{" "}
                w stanie magazynowym (transakcja bazodanowa).
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!fullName || !form.phone.trim() || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Dodaj lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
