import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/transport-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
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
