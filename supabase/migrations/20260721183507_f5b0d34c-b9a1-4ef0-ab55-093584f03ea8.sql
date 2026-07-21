
-- Fleet & carriers: admin/logistyk/transport
DROP POLICY IF EXISTS "fleet_drivers read auth" ON public.fleet_drivers;
CREATE POLICY "fleet_drivers read staff" ON public.fleet_drivers FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'logistyk') OR has_role(auth.uid(),'transport'));

DROP POLICY IF EXISTS "fleet_vehicles read auth" ON public.fleet_vehicles;
CREATE POLICY "fleet_vehicles read staff" ON public.fleet_vehicles FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'logistyk') OR has_role(auth.uid(),'transport'));

DROP POLICY IF EXISTS "fleet_trailers read auth" ON public.fleet_trailers;
CREATE POLICY "fleet_trailers read staff" ON public.fleet_trailers FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'logistyk') OR has_role(auth.uid(),'transport'));

DROP POLICY IF EXISTS "external_carriers read auth" ON public.external_carriers;
CREATE POLICY "external_carriers read staff" ON public.external_carriers FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'logistyk') OR has_role(auth.uid(),'transport'));

-- Warehouses: admin/logistyk/transport/warehouse
DROP POLICY IF EXISTS "warehouses read auth" ON public.warehouses;
CREATE POLICY "warehouses read staff" ON public.warehouses FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'logistyk') OR has_role(auth.uid(),'transport') OR has_role(auth.uid(),'warehouse'));

-- Product definitions: all staff roles (sales needs it for lead form)
DROP POLICY IF EXISTS "product_definitions read auth" ON public.product_definitions;
CREATE POLICY "product_definitions read staff" ON public.product_definitions FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'logistyk') OR has_role(auth.uid(),'transport') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'sales'));

-- Fuel prices: admin/logistyk/transport
DROP POLICY IF EXISTS "fuel_prices_read_all_authenticated" ON public.fuel_prices;
CREATE POLICY "fuel_prices read staff" ON public.fuel_prices FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'logistyk') OR has_role(auth.uid(),'transport'));
