import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/transport-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth via Supabase anon key (bypass on /api/public/* is enough,
        // this just filters random pokes)
        const authKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (expected && authKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { runTransportReminders } = await import("@/lib/transport-reminders.server");
          const result = await runTransportReminders();
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("transport-reminders error", e);
          return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
        }
      },
    },
  },
});
