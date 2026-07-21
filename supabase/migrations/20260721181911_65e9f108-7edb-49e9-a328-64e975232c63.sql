DROP POLICY IF EXISTS "Admin delete events" ON public.stock_events;
CREATE POLICY "Admin/warehouse delete events" ON public.stock_events
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'warehouse'));