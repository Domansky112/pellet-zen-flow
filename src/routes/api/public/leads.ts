import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const LeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().min(6).max(40).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postal_code: z.string().trim().max(12).optional().or(z.literal("")),
  product: z.enum(["pellet_paleta", "pellet_bigbag", "brykiet", "inne"]).optional(),
  quantity: z.number().positive().max(1000).optional(),
  source: z.enum(["www", "email", "telefon", "b2b", "inne"]).default("www"),
  notes: z.string().max(2000).optional().or(z.literal("")),
  // honeypot — boty wypełniają, ludzie nie
  website: z.string().max(0).optional().or(z.literal("")),
});

export const Route = createFileRoute("/api/public/leads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
        }

        const parsed = LeadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400, headers: corsHeaders },
          );
        }

        // honeypot trip → udawaj sukces
        if (parsed.data.website) {
          return Response.json({ ok: true }, { status: 200, headers: corsHeaders });
        }

        const { website: _hp, ...clean } = parsed.data;
        // priorytet: b2b = wysoki, duża ilość = wysoki
        const priority =
          clean.source === "b2b" || (clean.quantity ?? 0) >= 10 ? 2 : 1;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("leads")
          .insert({
            name: clean.name,
            email: clean.email || null,
            phone: clean.phone || null,
            city: clean.city || null,
            postal_code: clean.postal_code || null,
            product: clean.product ?? null,
            quantity: clean.quantity ?? null,
            source: clean.source,
            notes: clean.notes || null,
            priority,
            status: "nowy",
          })
          .select("id")
          .single();

        if (error) {
          console.error("[api/public/leads] insert failed", error);
          return Response.json(
            { error: "Could not save lead" },
            { status: 500, headers: corsHeaders },
          );
        }

        return Response.json({ ok: true, id: data.id }, { status: 201, headers: corsHeaders });
      },
    },
  },
});
