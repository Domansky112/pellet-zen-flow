-- 1. Rozszerzenie leads o pola poczekalni
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pooling_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pooling_wait_until date,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS pooling_lat double precision,
  ADD COLUMN IF NOT EXISTS pooling_lng double precision,
  ADD COLUMN IF NOT EXISTS pooling_km_from_base double precision,
  ADD COLUMN IF NOT EXISTS pooling_status text NOT NULL DEFAULT 'oczekuje';

CREATE INDEX IF NOT EXISTS leads_pooling_idx ON public.leads (pooling_enabled, pooling_status, pooling_wait_until);

-- 2. Tabela transport_pools
CREATE TABLE IF NOT EXISTS public.transport_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  route_from text NOT NULL DEFAULT 'Witoroża, 21-570 Drelów',
  route_to text NOT NULL,
  total_tons numeric(10,2) NOT NULL DEFAULT 0,
  capacity_tons numeric(10,2) NOT NULL DEFAULT 24,
  estimated_km double precision,
  estimated_cost numeric(10,2),
  cost_per_ton numeric(10,2),
  status text NOT NULL DEFAULT 'draft',
  transport_id uuid REFERENCES public.transports(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_pools TO authenticated;
GRANT ALL ON public.transport_pools TO service_role;
ALTER TABLE public.transport_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pools_read_all_auth" ON public.transport_pools
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pools_write_sales_admin" ON public.transport_pools
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_transport_pools_updated_at
  BEFORE UPDATE ON public.transport_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Wiązanie leads <-> pool
CREATE TABLE IF NOT EXISTS public.transport_pool_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.transport_pools(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tons numeric(10,2) NOT NULL,
  detour_km double precision,
  share_cost numeric(10,2),
  stop_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pool_id, lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_pool_items TO authenticated;
GRANT ALL ON public.transport_pool_items TO service_role;
ALTER TABLE public.transport_pool_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pool_items_read_all_auth" ON public.transport_pool_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pool_items_write_sales_admin" ON public.transport_pool_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS pool_items_pool_idx ON public.transport_pool_items (pool_id);
CREATE INDEX IF NOT EXISTS pool_items_lead_idx ON public.transport_pool_items (lead_id);

-- 4. Powiązanie pool_id w transports (żeby po konwersji było widać, że transport pochodzi z konsolidacji)
ALTER TABLE public.transports
  ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES public.transport_pools(id) ON DELETE SET NULL;