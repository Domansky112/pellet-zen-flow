
-- Lead statuses dictionary
CREATE TABLE IF NOT EXISTS public.lead_statuses (
  key text PRIMARY KEY,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  sort_order int NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_statuses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lead_statuses TO authenticated;
GRANT ALL ON public.lead_statuses TO service_role;

ALTER TABLE public.lead_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "statuses read authenticated" ON public.lead_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "statuses admin write" ON public.lead_statuses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_lead_statuses_updated_at
  BEFORE UPDATE ON public.lead_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed system statuses (mirror lead_status enum + extras)
INSERT INTO public.lead_statuses (key, label, color, sort_order, is_system) VALUES
  ('nowy',           'Nowy',            '#3b82f6', 10, true),
  ('w_kontakcie',    'W kontakcie',     '#f59e0b', 20, true),
  ('oferta',         'Oferta wysłana',  '#a855f7', 30, true),
  ('zarezerwowany',  'Zarezerwowany',   '#ea580c', 40, true),
  ('wygrany',        'Zrealizowany',    '#16a34a', 50, true),
  ('przegrany',      'Anulowany',       '#64748b', 60, true)
ON CONFLICT (key) DO NOTHING;

-- Flexible status column on leads (does not replace the enum, works alongside it)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status_key text
  REFERENCES public.lead_statuses(key) ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE public.leads SET status_key = status::text WHERE status_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_status_key ON public.leads(status_key);
