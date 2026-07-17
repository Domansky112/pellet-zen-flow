import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Bot, Shield, Send, Bell, Sparkles } from "lucide-react";
import { listTelegramChats, sendTestBroadcast, setChatWhitelist, runTransportRemindersNow } from "@/lib/telegram.functions";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

const chatsQuery = queryOptions({ queryKey: ["telegram", "chats"], queryFn: () => listTelegramChats() });

export const Route = createFileRoute("/_authenticated/bot")({
  head: () => ({
    meta: [
      { title: "Bot Telegram — Słoneczny Pellet OS" },
      { name: "description", content: "Bot Telegram: webhook, whitelist czatów, alerty T-7/T-4 przed transportem." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(chatsQuery),
  component: BotPage,
});

function BotPage() {
  const { data: chats } = useSuspenseQuery(chatsQuery);
  const qc = useQueryClient();
  const [text, setText] = useState("🔔 Test z Pellet OS — jeśli to widzisz, alerty działają.");
  const [busy, setBusy] = useState(false);
  const broadcast = useServerFn(sendTestBroadcast);
  const runReminders = useServerFn(runTransportRemindersNow);
  const toggle = useServerFn(setChatWhitelist);

  async function onBroadcast() {
    setBusy(true);
    try {
      const r = await broadcast({ data: { text } });
      toast.success(`Wysłano do ${r.sent}/${r.total} czatów${r.failed ? ` · ${r.failed} błędów` : ""}`);
    } catch (e: any) { toast.error(e?.message ?? "Błąd"); }
    finally { setBusy(false); }
  }

  async function onRunReminders() {
    setBusy(true);
    try {
      const r = await runReminders();
      toast.success(`T-7/T-4: sprawdzono ${r.checked} transportów, powiadomień ${r.sent}, pominięto ${r.skipped}`);
    } catch (e: any) { toast.error(e?.message ?? "Błąd"); }
    finally { setBusy(false); }
  }

  const whitelisted = chats.filter((c) => c.is_whitelisted).length;

  return (
    <>
      <PageHeader
        title="Bot Telegram"
        description="Webhook nasłuchuje /start · /stop · /id. Alerty T-7 i T-4 lecą automatycznie do whitelisty."
      />
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard icon={<Bot className="h-5 w-5" />} label="Czaty łącznie" value={String(chats.length)} />
          <StatCard icon={<Shield className="h-5 w-5" />} label="Aktywne (whitelist)" value={String(whitelisted)} />
          <StatCard icon={<Bell className="h-5 w-5" />} label="Alerty automatyczne" value="T-7 · T-4" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ręczne akcje admina</CardTitle>
            <CardDescription>Broadcast testowy oraz ręczne odpalenie silnika przypomnień.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={onBroadcast} disabled={busy || whitelisted === 0}>
                <Send className="mr-2 h-4 w-4" /> Wyślij broadcast ({whitelisted})
              </Button>
              <Button variant="outline" onClick={onRunReminders} disabled={busy}>
                <Sparkles className="mr-2 h-4 w-4" /> Odpal T-7/T-4 teraz
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Czaty</CardTitle>
            <CardDescription>Wpisz w Telegramie <code>/start</code> do bota, żeby dołączyć. Admin może przełączać whitelistę ręcznie.</CardDescription>
          </CardHeader>
          <CardContent>
            {chats.length === 0 && (
              <p className="text-muted-foreground text-sm py-8 text-center">
                Brak czatów — wyślij <code>/start</code> do bota z Telegrama, a pojawi się tutaj.
              </p>
            )}
            <div className="space-y-2">
              {chats.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                  <div>
                    <div className="font-medium">{c.label ?? c.chat_id}</div>
                    <div className="text-xs text-muted-foreground">
                      chat_id: {c.chat_id} · dołączył {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: pl })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={c.is_whitelisted ? "default" : "outline"}>
                      {c.is_whitelisted ? "aktywny" : "wyłączony"}
                    </Badge>
                    <Switch
                      checked={c.is_whitelisted}
                      onCheckedChange={async (v) => {
                        try {
                          await toggle({ data: { id: c.id, whitelisted: v } });
                          qc.invalidateQueries({ queryKey: ["telegram", "chats"] });
                        } catch (e: any) { toast.error(e?.message ?? "Błąd"); }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-display text-2xl font-semibold">{value}</div>
        </div>
        <div className="text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}
