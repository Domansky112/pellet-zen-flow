
DROP POLICY IF EXISTS "Owner or admin can delete expenses" ON public.expenses;
DROP POLICY IF EXISTS "Owner or admin can update expenses" ON public.expenses;

CREATE POLICY "Owner or admin can delete expenses" ON public.expenses
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role)))
);

CREATE POLICY "Owner or admin can update expenses" ON public.expenses
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role)))
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role)))
);

DROP POLICY IF EXISTS "fuel_prices_insert_manual_authenticated" ON public.fuel_prices;
CREATE POLICY "fuel_prices_insert_manual_staff" ON public.fuel_prices
FOR INSERT WITH CHECK (
  source = 'manual'
  AND created_by = auth.uid()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'logistyk'::app_role)
    OR has_role(auth.uid(), 'transport'::app_role)
  )
);
