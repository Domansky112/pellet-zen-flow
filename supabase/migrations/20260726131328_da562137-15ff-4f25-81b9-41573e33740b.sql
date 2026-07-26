DROP POLICY IF EXISTS "audit_log insert own" ON public.audit_log;
CREATE POLICY "audit_log insert staff own" ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'warehouse')
    OR public.has_role(auth.uid(), 'transport')
    OR public.has_role(auth.uid(), 'logistyk')
  )
);