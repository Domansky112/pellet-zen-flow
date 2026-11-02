CREATE TABLE public.poultry_farm_settings (
  farm_key text PRIMARY KEY,
  affiliate_partner_id uuid,
  price_per_ton_net numeric,
  default_tons numeric,
  cycle_days integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poultry_farm_settings TO authenticated;
GRANT ALL ON public.poultry_farm_settings TO service_role;
ALTER TABLE public.poultry_farm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read farm settings" ON public.poultry_farm_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write farm settings" ON public.poultry_farm_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));