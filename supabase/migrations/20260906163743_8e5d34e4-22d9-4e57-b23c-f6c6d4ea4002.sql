CREATE TABLE public.pickup_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  default_km numeric,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pickup_locations TO authenticated;
GRANT ALL ON public.pickup_locations TO service_role;

ALTER TABLE public.pickup_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read pickup locations"
ON public.pickup_locations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'warehouse')
  OR public.has_role(auth.uid(), 'logistyk')
  OR public.has_role(auth.uid(), 'transport')
  OR public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "Admins manage pickup locations"
ON public.pickup_locations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_pickup_locations_updated_at
BEFORE UPDATE ON public.pickup_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stock_lots
  ADD COLUMN pickup_location_id uuid REFERENCES public.pickup_locations(id),
  ADD COLUMN transport_km numeric,
  ADD COLUMN fuel_cost numeric,
  ADD COLUMN fuel_expense_id uuid REFERENCES public.expenses(id);

INSERT INTO public.pickup_locations (name, address, notes)
VALUES ('Małaszewicze', 'Małaszewicze, 21-540 Terespol, Polska', 'Domyślny punkt odbioru pelletu');