import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveFarmSettings } from "@/lib/kurniki.functions";

export type FarmPartnerOption = { id: string; full_name: string; rate_per_ton: number | null };

type Payload = {
  farm_key: string;
  affiliate_partner_id: string | null;
  price_per_ton_net: number | null;
  default_tons: number | null;
  cycle_days: number | null;
};

const toNum = (v: string) => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const show = (v: number | null | undefined) => (v == null ? "" : String(v));

function incomingOf(farmKey: string, settings: any, fallbackCycle: number | null): Payload {
  const has = settings != null;
  const n = (v: any) => (v == null || v === "" ? null : Number(v));
  return {
    farm_key: farmKey,
    affiliate_partner_id: settings?.affiliate_partner_id ?? null,
    price_per_ton_net: has ? n(settings.price_per_ton_net) : null,
    default_tons: has ? n(settings.default_tons) : null,
    cycle_days: has ? n(settings.cycle_days) : n(fallbackCycle),
  };
}

/** Stałe warunki fermy edytowane wprost na karcie fermy (tylko administrator). Zapis natychmiastowy. */
export function FarmConditionsEditor({
  farmKey,
  settings,
  fallbackCycle,
  partners,
}: {
  farmKey: string;
  settings: any;
  fallbackCycle: number | null;
  partners: FarmPartnerOption[];
}) {
  const save = useServerFn(saveFarmSettings);
  const qc = useQueryClient();

  const initial = incomingOf(farmKey, settings, fallbackCycle);
  const [tons, setTons] = useState(show(initial.default_tons));
  const [price, setPrice] = useState(show(initial.price_per_ton_net));
  const [cycle, setCycle] = useState(show(initial.cycle_days));
  const [partner, setPartner] = useState(initial.affiliate_partner_id ?? "none");
  const [flash, setFlash] = useState(false);

  const savedKey = useRef(JSON.stringify(initial));
  const incomingKey = JSON.stringify(incomingOf(farmKey, settings, fallbackCycle));

  // Synchronizuj z bazą, gdy warunki zmieniły się gdzie indziej (np. po odświeżeniu).
  useEffect(() => {
    if (incomingKey === savedKey.current) return;
    savedKey.current = incomingKey;
    const next = JSON.parse(incomingKey) as Payload;
    setTons(show(next.default_tons));
    setPrice(show(next.price_per_ton_net));
    setCycle(show(next.cycle_days));
    setPartner(next.affiliate_partner_id ?? "none");
  }, [incomingKey]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const m = useMutation({
    mutationFn: (p: Payload) => save({ data: p }),
    onSuccess: (_d, p) => {
      savedKey.current = JSON.stringify(p);
      setFlash(true);
      qc.invalidateQueries({ queryKey: ["poultry_farms"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się zapisać warunków fermy"),
  });

  const commit = (override: Partial<Payload> = {}) => {
    const next: Payload = {
      farm_key: farmKey,
      affiliate_partner_id: partner === "none" ? null : partner,
      price_per_ton_net: toNum(price),
      default_tons: toNum(tons),
      cycle_days: toNum(cycle),
      ...override,
    };
    const key = JSON.stringify(next);
    if (key === savedKey.current) return;
    m.mutate(next);
  };

  const blurNum = (raw: string, revert: (v: string) => void, saved: number | null) => {
    if (raw.trim() && toNum(raw) == null) {
      toast.error("Podaj liczbę, np. 24 lub 750");
      revert(show(saved));
      return;
    }
    commit();
  };

  const sel = partners.find((p) => p.id === partner);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <span className="self-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Stałe warunki
      </span>
      <Field label="Standard (t)">
        <Input
          className="h-7 w-[74px] text-xs"
          inputMode="decimal"
          value={tons}
          placeholder="—"
          onChange={(e) => setTons(e.target.value)}
          onBlur={(e) => blurNum(e.target.value, setTons, initial.default_tons)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </Field>
      <Field label="Cena netto (zł/t)">
        <Input
          className="h-7 w-[86px] text-xs"
          inputMode="decimal"
          value={price}
          placeholder="—"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={(e) => blurNum(e.target.value, setPrice, initial.price_per_ton_net)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </Field>
      <Field label="Cykl (dni)">
        <Input
          className="h-7 w-[62px] text-xs"
          inputMode="numeric"
          value={cycle}
          placeholder="—"
          onChange={(e) => setCycle(e.target.value)}
          onBlur={(e) => blurNum(e.target.value, setCycle, initial.cycle_days)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </Field>
      <Field label="Afiliant">
        <Select
          value={partner}
          onValueChange={(v) => {
            setPartner(v);
            commit({ affiliate_partner_id: v === "none" ? null : v });
          }}
        >
          <SelectTrigger className="h-7 w-[170px] text-xs">
            <SelectValue placeholder="Bez afiliacji" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Bez afiliacji</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
                {p.rate_per_ton != null ? ` · ${Number(p.rate_per_ton)} zł/t` : " · brak stawki"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <span className="self-center text-xs text-muted-foreground">
        {m.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : flash ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <Check className="h-3.5 w-3.5" /> Zapisano
          </span>
        ) : sel && !sel.rate_per_ton ? (
          "Brak stawki afilianta — ustaw w Ustawieniach → Afiliacje"
        ) : (
          "Zapisuje się samo"
        )}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
