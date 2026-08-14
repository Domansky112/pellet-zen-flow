import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ReportInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  anonymize: z.boolean().optional().default(false),
});

export const getFinancialReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReportInput.parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isSales }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "sales" }),
    ]);
    if (!isAdmin && !isSales) throw new Error("Brak uprawnień do raportów finansowych.");

    const { buildFinancialReport } = await import("@/lib/report.server");
    const report = await buildFinancialReport(context.supabase, {
      from: data.from,
      to: data.to,
      anonymize: data.anonymize ?? false,
    });

    const claims = context.claims as Record<string, any> | undefined;
    const meta = { ...(claims?.["user_metadata"] ?? {}) } as Record<string, unknown>;
    const generatedBy =
      (meta["full_name"] as string) ||
      (meta["name"] as string) ||
      (claims?.["email"] as string) ||
      "Administrator";

    return { ...report, generatedBy, generatedAt: new Date().toISOString() };
  });
