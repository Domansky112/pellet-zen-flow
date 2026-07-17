import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, ArrowRight, Inbox, Warehouse, Truck, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Słoneczny Pellet OS — CRM, magazyn i logistyka pelletu" },
      {
        name: "description",
        content:
          "System operacyjny dla dystrybucji pelletu: CRM omnichannel, silnik magazynowy, kalkulator dostaw i bot Telegram.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const modules = [
    { icon: Inbox, title: "CRM Inbox", desc: "Leady WWW, e-mail i B2B w jednym miejscu" },
    { icon: Warehouse, title: "Magazyn", desc: "Zdarzenia → automatyczne stany" },
    { icon: Truck, title: "Transport", desc: "Strefy, konsolidacja, alerty" },
    { icon: Bot, title: "Bot Telegram", desc: "Placowy zgłasza z telefonu" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Flame className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold">Słoneczny Pellet</div>
              <div className="text-[11px] text-muted-foreground">Operating System</div>
            </div>
          </div>
          {signedIn ? (
            <Button asChild>
              <Link to="/dashboard">
                Otwórz panel <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to="/auth">Zaloguj się</Link>
            </Button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-6xl">
          Cała operacja pelletu <br />
          <span className="text-primary">w jednym systemie.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Zgłoszenia z formularza, magazyn, transporty i bot Telegram — bez arkuszy,
          bez zgadywania, z prawdziwym stanem w czasie rzeczywistym.
        </p>
        <div className="mt-8 flex gap-3">
          {signedIn ? (
            <Button size="lg" asChild>
              <Link to="/dashboard">Wejdź do panelu</Link>
            </Button>
          ) : (
            <Button size="lg" asChild>
              <Link to="/auth">Zaloguj się do systemu</Link>
            </Button>
          )}
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-4">
          {modules.map((m) => (
            <div key={m.title} className="rounded-xl border border-border/60 bg-card p-5">
              <m.icon className="h-6 w-6 text-primary" />
              <div className="mt-3 font-semibold">{m.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{m.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
