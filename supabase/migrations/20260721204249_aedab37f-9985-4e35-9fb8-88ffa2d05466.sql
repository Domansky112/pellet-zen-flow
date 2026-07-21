
-- 1) lead_statuses: restrict SELECT to staff roles
DROP POLICY IF EXISTS "statuses read authenticated" ON public.lead_statuses;
CREATE POLICY "statuses read staff" ON public.lead_statuses FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'transport'::app_role)
  OR has_role(auth.uid(), 'warehouse'::app_role)
);

-- 2) transport_pool_items: add EXISTS ownership checks matching transport_items pattern
DROP POLICY IF EXISTS pool_items_write_sales_admin ON public.transport_pool_items;
CREATE POLICY pool_items_write_sales_admin ON public.transport_pool_items
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (SELECT 1 FROM public.transport_pools p WHERE p.id = pool_id)
  AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id)
);

-- 3) search_leads_global: switch from SECURITY DEFINER to SECURITY INVOKER
-- RLS on public.leads already restricts to staff (admin/sales), so INVOKER is safe.
ALTER FUNCTION public.search_leads_global(text) SECURITY INVOKER;
