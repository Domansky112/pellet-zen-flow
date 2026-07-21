-- 1) Scope SELECT policies to 'authenticated' role explicitly (was 'public')
DROP POLICY IF EXISTS "fleet_drivers read staff" ON public.fleet_drivers;
CREATE POLICY "fleet_drivers read staff" ON public.fleet_drivers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistyk'::app_role) OR has_role(auth.uid(), 'transport'::app_role));

DROP POLICY IF EXISTS "fleet_vehicles read staff" ON public.fleet_vehicles;
CREATE POLICY "fleet_vehicles read staff" ON public.fleet_vehicles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistyk'::app_role) OR has_role(auth.uid(), 'transport'::app_role));

DROP POLICY IF EXISTS "fleet_trailers read staff" ON public.fleet_trailers;
CREATE POLICY "fleet_trailers read staff" ON public.fleet_trailers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistyk'::app_role) OR has_role(auth.uid(), 'transport'::app_role));

DROP POLICY IF EXISTS "external_carriers read staff" ON public.external_carriers;
CREATE POLICY "external_carriers read staff" ON public.external_carriers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistyk'::app_role) OR has_role(auth.uid(), 'transport'::app_role));

DROP POLICY IF EXISTS "warehouses read staff" ON public.warehouses;
CREATE POLICY "warehouses read staff" ON public.warehouses
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistyk'::app_role) OR has_role(auth.uid(), 'transport'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role));

DROP POLICY IF EXISTS "product_definitions read staff" ON public.product_definitions;
CREATE POLICY "product_definitions read staff" ON public.product_definitions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistyk'::app_role) OR has_role(auth.uid(), 'transport'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'sales'::app_role));

DROP POLICY IF EXISTS "fuel_prices read staff" ON public.fuel_prices;
CREATE POLICY "fuel_prices read staff" ON public.fuel_prices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistyk'::app_role) OR has_role(auth.uid(), 'transport'::app_role));

-- 2) Tighten transport_items INSERT: require the linked transport row to exist,
--    plus keep the existing role gate. Split ALL policy into per-command policies
--    so INSERT has an explicit WITH CHECK that binds to a real transport_id.
DROP POLICY IF EXISTS "Transport items write" ON public.transport_items;

CREATE POLICY "transport_items insert staff" ON public.transport_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'transport'::app_role))
    AND transport_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.transports t WHERE t.id = transport_id)
  );

CREATE POLICY "transport_items update staff" ON public.transport_items
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'transport'::app_role))
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'transport'::app_role))
    AND transport_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.transports t WHERE t.id = transport_id)
  );

CREATE POLICY "transport_items delete staff" ON public.transport_items
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'transport'::app_role));

-- 3) SECURITY DEFINER function reachability: revoke broad EXECUTE from PUBLIC/authenticated.
--    handle_new_user is only invoked by an auth trigger; nobody should be able to call it directly.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;

-- Keep list_*_min callable by staff (they exist specifically to expose a
-- minimal projection to lower-privilege signed-in users), but drop PUBLIC/anon.
REVOKE ALL ON FUNCTION public.list_warehouses_min()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_fuel_prices_min()     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_fleet_drivers_min()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_fleet_vehicles_min()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_fleet_trailers_min()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_external_carriers_min() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_warehouses_min()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_fuel_prices_min()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_fleet_drivers_min()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_fleet_vehicles_min()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_fleet_trailers_min()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_external_carriers_min() TO authenticated;