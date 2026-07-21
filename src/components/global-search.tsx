import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, Copy, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchLeads, duplicateLead } from "@/lib/leads.functions";

type Lead = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  invoice_company: string | null;
  invoice_nip: string | null;
  status: "nowy" | "w_kontakcie" | "oferta" | "wygrany" | "przegrany";
  reservation_status: "brak" | "zarezerwowany" | "zwolniony" | "wydany" | null;
  product: string | null;
  quantity: number | null;
};

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function statusBadge(l: Lead) {
  if (l.reservation_status === "wydany")
    return <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">Wydany / Archiwum</Badge>;
  if (l.reservation_status === "zarezerwowany")
    return <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">Zarezerwowany</Badge>;
  const map: Record<Lead["status"], string> = {
    nowy: "Nowy",
    w_kontakcie: "W kontakcie",
    oferta: "Oferta",
    wygrany: "Wygrany",
    przegrany: "Przegrany",
  };
  return <Badge variant="secondary">{map[l.status]}</Badge>;
}

export function GlobalSearch({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q, 250);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchFn = useServerFn(searchLeads);
  const dupFn = useServerFn(duplicateLead);

  const enabled = debounced.trim().length >= 2;
  const query = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => searchFn({ data: { q: debounced.trim() } }),
    enabled,
    staleTime: 10_000,
  });

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        (rootRef.current?.querySelector("input") as HTMLInputElement | null)?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const results = useMemo(() => (query.data ?? []) as Lead[], [query.data]);

  function goToLead(id: string) {
    setOpen(false);
    setQ("");
    navigate({ to: "/crm", search: { leadId: id } as any });
  }

  return (
    <div ref={rootRef} className={"relative " + (className ?? "")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) goToLead(results[0].id);
          }}
          placeholder="Szukaj (imię, telefon, e-mail, NIP)…  ⌘K"
          className="pl-8 pr-8 w-full md:w-80"
          aria-label="Wyszukiwarka globalna"
        />
        {q && (
          <button
            type="button"
            aria-label="Wyczyść"
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setQ("");
              setOpen(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && enabled && (
        <div className="absolute right-0 mt-1 w-[min(92vw,32rem)] rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            {query.isFetching && (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Szukam…
              </div>
            )}
            {!query.isFetching && results.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Brak wyników dla „{debounced}"</div>
            )}
            {results.map((l) => (
              <div
                key={l.id}
                className="border-b border-border/60 last:border-0 p-3 hover:bg-muted/50 cursor-pointer"
                onClick={() => goToLead(l.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{l.name}</span>
                      {statusBadge(l)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      {l.phone && <span>{l.phone}</span>}
                      {l.email && <span>{l.email}</span>}
                      {l.city && <span>{l.city}</span>}
                      {l.invoice_company && <span>· {l.invoice_company}</span>}
                      {l.invoice_nip && <span>NIP {l.invoice_nip}</span>}
                    </div>
                    {(l.product || l.quantity) && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {l.product} {l.quantity ? `· ${l.quantity} t` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToLead(l.id);
                      }}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" /> Otwórz
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const row = await dupFn({ data: { lead_id: l.id } });
                          qc.invalidateQueries({ queryKey: ["leads"] });
                          toast.success("Zduplikowano lead");
                          setOpen(false);
                          setQ("");
                          navigate({ to: "/crm", search: { leadId: (row as any).id } as any });
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1" /> Duplikuj
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
