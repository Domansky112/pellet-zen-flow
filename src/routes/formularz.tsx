import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Flame } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/formularz")({
  head: () => ({
    meta: [
      { title: "Zapytanie o pellet — Słoneczny Pellet" },
      { name: "description", content: "Zamów pellet drzewny lub zapytaj o wycenę z dostawą. Odpowiadamy w ciągu 1 dnia roboczego." },
    ],
  }),
  component: FormPage,
});

function FormPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const quantityRaw = fd.get("quantity")?.toString().trim();
    const pooling = fd.get("pooling_enabled") === "on";
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      city: fd.get("city"),
      postal_code: fd.get("postal_code"),
      product: fd.get("product") || undefined,
      quantity: quantityRaw ? Number(quantityRaw) : undefined,
      notes: fd.get("notes"),
      website: fd.get("website"), // honeypot
      source: "www",
      pooling_enabled: pooling,
      pooling_wait_days: pooling ? 14 : undefined,
    };
    const res = await fetch("/api/public/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Nie udało się wysłać. Spróbuj ponownie.");
      return;
    }
    setSent(true);
    toast.success("Dziękujemy! Odezwiemy się wkrótce.");
    (e.target as HTMLFormElement).reset();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display font-semibold">Słoneczny Pellet</div>
            <div className="text-xs text-muted-foreground">Zapytanie o wycenę</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Zamów pellet z dostawą</h1>
        <p className="mt-2 text-muted-foreground">
          Wypełnij formularz — przygotujemy wycenę razem z kosztem transportu do Twojej miejscowości.
        </p>

        {sent && (
          <div className="mt-6 rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
            Zgłoszenie odebrane. Wpadło do naszego CRM — skontaktujemy się w ciągu 1 dnia roboczego.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-border/60 bg-card p-6">
          {/* honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Imię i nazwisko / Firma *</Label>
              <Input id="name" name="name" required minLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+48 …" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Miejscowość</Label>
              <Input id="city" name="city" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postal_code">Kod pocztowy</Label>
              <Input id="postal_code" name="postal_code" placeholder="00-000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product">Produkt</Label>
              <select
                id="product"
                name="product"
                defaultValue=""
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— wybierz —</option>
                <option value="pellet_paleta">Pellet (paleta 65 worków × 15 kg)</option>
                <option value="pellet_bigbag">Pellet Big Bag (~1 t)</option>
                
                <option value="inne">Inne</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Ilość (tony)</Label>
              <Input id="quantity" name="quantity" type="number" min={1} step={1} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Uwagi / pytania</Label>
            <Textarea id="notes" name="notes" rows={4} placeholder="Np. rozładunek HDS, dojazd samochodem 24 t, termin dostawy…" />
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 cursor-pointer">
            <input type="checkbox" name="pooling_enabled" className="mt-1 h-4 w-4 accent-primary" />
            <div>
              <div className="font-medium text-sm">Zgadzam się na wspólny transport (do 50% taniej)</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Poczekamy do 14 dni, aż uzbieramy transport w Twojej okolicy — koszt dostawy dzieli się między kilku klientów.
              </div>
            </div>
          </label>

          <Button type="submit" disabled={loading} className="w-full md:w-auto">
            {loading ? "Wysyłam…" : "Wyślij zapytanie"}
          </Button>
        </form>
      </main>
    </div>
  );
}
