DROP POLICY IF EXISTS "Staff read farm settings" ON public.poultry_farm_settings;
CREATE POLICY "Staff read farm settings" ON public.poultry_farm_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'logistyk') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'warehouse'));