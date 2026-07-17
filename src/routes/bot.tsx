import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Shield, MessageSquare, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/bot")({
  head: () => ({
    meta: [
      { title: "Bot magazynowy — Słoneczny Pellet OS" },
      { name: "description", content: "Mobilny interfejs Telegram dla placu i kierowców: /menu, dodawanie palet, korekty stanów." },
    ],
  }),
  component: BotPage,
});

const chats = [
  { name: "Placowy — Krzysiek", id: "784***112", role: "Magazynier", ostatnia: "8 min temu", ok: true },
  { name: "Kierowca Marek", id: "521***809", role: "Kierowca", ostatnia: "2 h temu", ok: true },
  { name: "Handlowiec 1", id: "601***334", role: "Sprzedaż", ostatnia: "1 dzień temu", ok: true },
];

function BotPage() {
  return (
    <>
      <PageHeader
        title="Bot magazynowy (Telegram)"
        description="Dwukierunkowa komunikacja z placu. Maszyna stanów: przycisk → ilość → komentarz → potwierdzenie."
      />
      <div className="p-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" /> Podgląd rozmowy
            </CardTitle>
            <CardDescription>Symulacja: /menu z dozwolonego czatu</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border bg-muted/40 p-4 space-y-3 max-w-lg">
              <BotBubble side="user">/menu</BotBubble>
              <BotBubble side="bot">
                <div className="font-medium mb-1">Menu magazynu</div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button className="rounded-md bg-background border px-2 py-1.5 text-left">📊 Dostępne</button>
                  <button className="rounded-md bg-background border px-2 py-1.5 text-left">📦 Pełny stan</button>
                  <button className="rounded-md bg-background border px-2 py-1.5 text-left">🚚 Transporty</button>
                  <button className="rounded-md bg-background border px-2 py-1.5 text-left">➕ Dodaj Palety</button>
                </div>
              </BotBubble>
              <BotBubble side="user">➕ Dodaj Palety</BotBubble>
              <BotBubble side="bot">Ile ton palet dodać? (np. 5 lub 5.5)</BotBubble>
              <BotBubble side="user">8</BotBubble>
              <BotBubble side="bot">Komentarz (np. nazwa dostawcy/klienta):</BotBubble>
              <BotBubble side="user">Dostawa producent · Radom</BotBubble>
              <BotBubble side="bot">
                <div className="flex items-center gap-1.5 text-success font-medium mb-1">
                  <CheckCircle2 className="h-4 w-4" /> Zapisano
                </div>
                <div className="text-xs">
                  +8 t · Palety · „Dostawa producent · Radom”<br />
                  Nowy stan fizyczny: <b>248 t</b> · dostępny: <b>90,4 t</b><br />
                  <span className="text-muted-foreground">16.09.2025 · 10:47</span>
                </div>
              </BotBubble>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Dozwolone czaty
              </CardTitle>
              <CardDescription>Zabezpieczony kanał · DOZWOLONE_CZATY</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {chats.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.role} · {c.id}</p>
                  </div>
                  <div className="text-right">
                    <Badge className="bg-success/15 text-success border-success/30" variant="outline">aktywny</Badge>
                    <p className="text-[11px] text-muted-foreground mt-1">{c.ostatnia}</p>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full">+ Dodaj chat ID</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" /> Konfiguracja
              </CardTitle>
              <CardDescription>Tokeny w zmiennych środowiskowych</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ConfigRow k="BOT_MAGAZYN_TOKEN" v="••••••••••1a2b" />
              <ConfigRow k="PELLET_BOT_TOKEN" v="••••••••••7f0c" />
              <ConfigRow k="PELLET_CHAT_ID" v="-100••••44" />
              <ConfigRow k="TELEGRAM_TOKEN (CRM)" v="••••••••••ff23" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function BotBubble({ side, children }: { side: "user" | "bot"; children: React.ReactNode }) {
  const isUser = side === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function ConfigRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}
