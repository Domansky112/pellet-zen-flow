
-- 1) Rozszerzenie ról: dodaj 'logistyk' do enum app_role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'logistyk'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
    ALTER TYPE public.app_role ADD VALUE 'logistyk';
  END IF;
END $$;

-- ============================================================
-- 2) FLOTA — pojazdy (ciągniki/ciężarówki)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration TEXT NOT NULL UNIQUE,
  brand TEXT,
  model TEXT,
  capacity_tons NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'aktywny',  -- aktywny / serwis / wycofany
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_vehicles read auth" ON public.fleet_vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "fleet_vehicles admin write" ON public.fleet_vehicles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.fleet_vehicles TO authenticated;

-- ============================================================
-- 3) FLOTA — naczepy
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fleet_trailers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration TEXT NOT NULL UNIQUE,
  trailer_type TEXT,   -- kurtyna / plandeka / wywrotka / cysterna...
  capacity_tons NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'aktywny',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fleet_trailers TO authenticated;
GRANT ALL ON public.fleet_trailers TO service_role;
ALTER TABLE public.fleet_trailers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_trailers read auth" ON public.fleet_trailers FOR SELECT TO authenticated USING (true);
CREATE POLICY "fleet_trailers admin write" ON public.fleet_trailers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.fleet_trailers TO authenticated;

-- ============================================================
-- 4) FLOTA — kierowcy
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fleet_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  trailer_id UUID REFERENCES public.fleet_trailers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aktywny',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fleet_drivers TO authenticated;
GRANT ALL ON public.fleet_drivers TO service_role;
ALTER TABLE public.fleet_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_drivers read auth" ON public.fleet_drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "fleet_drivers admin write" ON public.fleet_drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.fleet_drivers TO authenticated;

-- ============================================================
-- 5) Zewnętrzni przewoźnicy
-- ============================================================
CREATE TABLE IF NOT EXISTS public.external_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  nip TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  base_rate_per_km NUMERIC(8,2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'aktywny',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.external_carriers TO authenticated;
GRANT ALL ON public.external_carriers TO service_role;
ALTER TABLE public.external_carriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "external_carriers read auth" ON public.external_carriers FOR SELECT TO authenticated USING (true);
CREATE POLICY "external_carriers admin write" ON public.external_carriers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.external_carriers TO authenticated;

-- ============================================================
-- 6) Słownik produktów (definicje)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,       -- np. 'pellet_bigbag'
  label TEXT NOT NULL,             -- np. 'Pellet Big-Bag 1000 kg'
  packaging TEXT,                  -- big_bag / paleta / luz
  unit_weight_kg NUMERIC(8,2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_definitions TO authenticated;
GRANT ALL ON public.product_definitions TO service_role;
ALTER TABLE public.product_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_definitions read auth" ON public.product_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_definitions admin write" ON public.product_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.product_definitions TO authenticated;

-- ============================================================
-- 7) Magazyny (miejsca załadunku dla WZ)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address_line TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'Polska',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses read auth" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouses admin write" ON public.warehouses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;

-- Tylko jeden domyślny magazyn
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default ON public.warehouses ((is_default)) WHERE is_default = TRUE;

-- ============================================================
-- 8) Konfiguracja globalna (klucz → JSON)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT ALL ON public.system_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_settings admin all" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Domyślne wartości konfiguracji
INSERT INTO public.system_settings(key, value, description) VALUES
  ('fuel_price_correction', '{"pln_per_liter": -0.10}'::jsonb,
   'Korekta ceny paliwa względem detalicznej ceny Orlen (zł/l).'),
  ('wz_number_format', '{"pattern": "WZ/{YYYY}/{MM}/{SEQ:0000}"}'::jsonb,
   'Wzorzec numeracji dokumentów WZ. Placeholdery: {YYYY}, {MM}, {DD}, {SEQ:0000}.')
ON CONFLICT (key) DO NOTHING;

-- Domyślny magazyn (Witoroża)
INSERT INTO public.warehouses (name, address_line, postal_code, city, country, is_default, notes)
VALUES ('Magazyn Główny — Witoroża', 'Witoroża', '21-570', 'Drelów', 'Polska', TRUE, 'Domyślny punkt załadunku dla WZ i transportów.')
ON CONFLICT DO NOTHING;

-- Domyślne produkty (spójne z enum product_type używanym w leadach/magazynie)
INSERT INTO public.product_definitions (code, label, packaging, unit_weight_kg, active) VALUES
  ('pellet_paleta',  'Pellet — paleta (1000 kg)', 'paleta',  1000, TRUE),
  ('pellet_bigbag',  'Pellet — Big-Bag (1000 kg)', 'big_bag', 1000, TRUE),
  ('inne',           'Inne',                       'luz',     NULL, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 9) Triggery updated_at
-- ============================================================
CREATE TRIGGER trg_fleet_vehicles_updated BEFORE UPDATE ON public.fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fleet_trailers_updated BEFORE UPDATE ON public.fleet_trailers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fleet_drivers_updated BEFORE UPDATE ON public.fleet_drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_external_carriers_updated BEFORE UPDATE ON public.external_carriers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_product_definitions_updated BEFORE UPDATE ON public.product_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_system_settings_updated BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
