import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createFarmOrder, saveFarmSettings } from "@/lib/kurniki.functions";
import { listAffiliatePartners } from "@/lib/affiliates.functions";
import { realLeadNote } from "@/lib/lead-notes";

export function FarmOrderDialog({ open, onOpenChange, farm, isAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; farm: any; isAdmin: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(createFarmOrder);
  const listP = useServerFn(listAffiliatePartners);
  const { data } = useQuery({ queryKey: ["affiliate_partners"], queryFn: () => listP(), enabled: open && isAdmin });
  const partners = (data?.partners ?? []).filter((p) => p.status === "aktywny");
  const [tons, setTons] = useState("");
  const [notes, setNotes] = useState("");
  const [partner, setPartner] = useState("none");
  const [price, setPrice] = useState("");
  const [cycle, setCycle] = useState("");
  const [saveDefaults, setSaveDefaults] = useState(false);
  const saveS = useServerFn(saveFarmSettings);
  const st = farm?.settings ?? null;
  const num = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : null);
  const latest = farm?.leads?.[0] ?? farm?.leads?.[farm.leads.length - 1];
  const copiedNote = realLeadNote(latest?.notes);

  const farmAffiliate: string | null = (farm?.leads ?? []).find((l: any) => l?.affiliate_partner_id)?.affiliate_partner_id ?? null;
  useEffect(() => {
    if (open) {
      setNotes(copiedNote);
      setPartner(st?.affiliate_partner_id ?? farmAffiliate ?? "none");
      setTons(st?.default_tons != null ? String(st.default_tons) : "");
      setPrice(st?.price_per_ton_net != null ? String(st.price_per_ton_net) : "");
      setCycle(st?.cycle_days != null ? String(st.cycle_days) : farm?.cycle_days ? String(farm.cycle_days) : "");
      setSaveDefaults(false);
    }
  }, [open, copiedNote, farmAffiliate, st, farm?.cycle_days]);

  const m = useMutation({
    mutationFn: async () => {
      const q = num(tons);
      const pr = num(price);
      const aff = partner === "none" ? null : partner;
      if (isAdmin && saveDefaults) {
        const cd = num(cycle);
        await saveS({ data: { farm_key: farm.farmKey, affiliate_partner_id: aff, price_per_ton_net: pr, default_tons: q, cycle_days: cd != null ? Math.round(cd) : null } });
      }
      return create({ data: { source_lead_id: latest.id, quantity: q, notes: notes || null, affiliate_partner_id: aff, price_per_ton_net: pr } });
    },
    onSuccess: (row: any) => {
      toast.success(`Utworzono zgłoszenie ${row?.lead_number ?? ""}`);
      qc.invalidateQueries();
      onOpenChange(false);
      setTons(""); setNotes(""); setPartner("none");
      navigate({ to: "/crm", search: { leadId: row.id } as any });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sel = partners.find((p) => p.id === partner);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowe zgłoszenie — {farm?.name}</DialogTitle>
          <DialogDescription>Dane klienta, adres i faktura zostaną skopiowane z ostatniego zamówienia fermy.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Ilość (t)</Label>
            <Input inputMode="decimal" value={tons} onChange={(e) => setTons(e.target.value)} placeholder="np. 24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cena netto (zł/t)</Label>
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="np. 750" />
            </div>
            {isAdmin && (
              <div>
                <Label>Cykl (dni)</Label>
                <Input inputMode="numeric" value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder="np. 35" />
              </div>
            )}
          </div>
          {isAdmin && (
            <div>
              <Label>Afiliacja</Label>
              <Select value={partner} onValueChange={setPartner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez afiliacji</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}{p.rate_per_ton != null ? ` · ${Number(p.rate_per_ton)} zł/t` : " · brak stawki"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sel && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {sel.rate_per_ton ? `Prowizja naliczy się automatycznie po dostawie (${Number(sel.rate_per_ton)} zł/t).` : "Ten partner nie ma ustawionej stawki — ustaw ją w Ustawieniach → Afiliacje."}
                </p>
              )}
            </div>
          )}
          <div>
            <Label>Notatka</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="np. dostawa w poniedziałek rano" />
            {copiedNote && (
              <p className="mt-1 text-xs text-muted-foreground">
                Przepisano z poprzedniego zgłoszenia{latest?.lead_number ? ` ${latest.lead_number}` : ""} — możesz edytować.
              </p>
            )}
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saveDefaults} onChange={(e) => setSaveDefaults(e.target.checked)} />
              Zapisz tonaż, cenę, cykl i afiliację jako stałe warunki tej fermy
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button disabled={m.isPending || !latest} onClick={() => m.mutate()}>Utwórz zgłoszenie</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
