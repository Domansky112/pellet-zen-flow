CREATE TABLE public.import_wagon_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wagon_id uuid NOT NULL REFERENCES public.import_wagons(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'inne',
  description text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PLN',
  exchange_rate numeric,
  file_path text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_wagon_costs TO authenticated;
GRANT ALL ON public.import_wagon_costs TO service_role;
ALTER TABLE public.import_wagon_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wagon costs" ON public.import_wagon_costs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.import_wagons
  ADD COLUMN pickup_location_id uuid REFERENCES public.pickup_locations(id) ON DELETE SET NULL,
  ADD COLUMN fuel_cost_per_haul numeric,
  ADD COLUMN real_cost_per_ton numeric;

CREATE OR REPLACE FUNCTION public.apply_import_wagon_cost(_wagon_id uuid, _cost_per_ton numeric)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Brak uprawnień'; END IF;
  UPDATE public.import_wagons SET real_cost_per_ton = _cost_per_ton, updated_at = now() WHERE id = _wagon_id;
  UPDATE public.stock_lots l SET unit_price = round(_cost_per_ton, 2), updated_at = now()
   WHERE l.stock_event_id IN (SELECT stock_event_id FROM public.import_hauls WHERE wagon_id = _wagon_id AND stock_event_id IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.stock_lot_consumptions c SET unit_price = round(_cost_per_ton, 2), cost = round(c.quantity * _cost_per_ton, 2)
   WHERE c.lot_id IN (SELECT l.id FROM public.stock_lots l WHERE l.stock_event_id IN (SELECT stock_event_id FROM public.import_hauls WHERE wagon_id = _wagon_id AND stock_event_id IS NOT NULL));
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_import_wagon_cost(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_import_wagon_cost(uuid, numeric) TO authenticated;