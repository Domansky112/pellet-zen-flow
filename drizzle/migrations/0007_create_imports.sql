CREATE TABLE public.import_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text,
  default_currency text NOT NULL DEFAULT 'EUR',
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_suppliers TO authenticated;
GRANT ALL ON public.import_suppliers TO service_role;
ALTER TABLE public.import_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import suppliers" ON public.import_suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.import_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.import_suppliers(id) ON DELETE RESTRICT,
  paid_at date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR',
  tons numeric NOT NULL CHECK (tons > 0),
  exchange_rate numeric,
  reference text,
  notes text,
  file_path text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_payments TO authenticated;
GRANT ALL ON public.import_payments TO service_role;
ALTER TABLE public.import_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import payments" ON public.import_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.import_wagons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.import_suppliers(id) ON DELETE RESTRICT,
  wagon_number text NOT NULL,
  arrival_date date NOT NULL DEFAULT current_date,
  declared_tons numeric,
  status text NOT NULL DEFAULT 'otwarty' CHECK (status IN ('otwarty','zamkniety')),
  closed_at timestamptz,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_wagons TO authenticated;
GRANT ALL ON public.import_wagons TO service_role;
ALTER TABLE public.import_wagons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import wagons" ON public.import_wagons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.import_hauls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wagon_id uuid NOT NULL REFERENCES public.import_wagons(id) ON DELETE CASCADE,
  haul_date date NOT NULL DEFAULT current_date,
  vehicle text,
  driver text,
  units numeric NOT NULL DEFAULT 0 CHECK (units >= 0),
  tons numeric NOT NULL CHECK (tons > 0),
  weight_report_path text,
  post_to_stock boolean NOT NULL DEFAULT false,
  stock_event_id uuid REFERENCES public.stock_events(id) ON DELETE SET NULL,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_hauls TO authenticated;
GRANT ALL ON public.import_hauls TO service_role;
ALTER TABLE public.import_hauls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import hauls" ON public.import_hauls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_import_suppliers_updated BEFORE UPDATE ON public.import_suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_payments_updated BEFORE UPDATE ON public.import_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_wagons_updated BEFORE UPDATE ON public.import_wagons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_hauls_updated BEFORE UPDATE ON public.import_hauls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins read import docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'import-docs' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload import docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'import-docs' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete import docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'import-docs' AND public.has_role(auth.uid(), 'admin'));