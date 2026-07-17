
-- Allow sales to create/cancel reservations tied to leads (not physical stock changes)
DROP POLICY IF EXISTS "Warehouse write events" ON public.stock_events;
CREATE POLICY "Warehouse write physical" ON public.stock_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'warehouse'))
    OR (
      public.has_role(auth.uid(), 'sales')
      AND txn_type IN ('rezerwacja','zwolnienie_rez')
    )
  );

-- Realtime
ALTER TABLE public.stock_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_events;
