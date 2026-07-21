
CREATE TABLE public.fuel_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_type text NOT NULL DEFAULT 'ON',
  price_per_liter numeric(6,3) NOT NULL,
  source text NOT NULL DEFAULT 'orlen_auto',
  note text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fuel_prices_fetched_at ON public.fuel_prices (fuel_type, fetched_at DESC);

GRANT SELECT, INSERT ON public.fuel_prices TO authenticated;
GRANT ALL ON public.fuel_prices TO service_role;

ALTER TABLE public.fuel_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_prices_read_all_authenticated"
  ON public.fuel_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fuel_prices_insert_manual_authenticated"
  ON public.fuel_prices FOR INSERT
  TO authenticated
  WITH CHECK (source = 'manual' AND created_by = auth.uid());
