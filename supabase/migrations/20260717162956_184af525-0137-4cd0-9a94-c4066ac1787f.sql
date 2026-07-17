
-- 1. Recreate stock_balance view with security_invoker
DROP VIEW IF EXISTS public.stock_balance;
CREATE VIEW public.stock_balance WITH (security_invoker=on) AS
SELECT product,
  COALESCE(sum(CASE
    WHEN txn_type = 'przyjecie'::stock_txn_type THEN quantity
    WHEN txn_type = 'wydanie'::stock_txn_type THEN -quantity
    WHEN txn_type = 'korekta'::stock_txn_type THEN quantity
    ELSE 0::numeric END), 0::numeric) AS physical,
  COALESCE(sum(CASE
    WHEN txn_type = 'rezerwacja'::stock_txn_type THEN quantity
    WHEN txn_type = 'zwolnienie_rez'::stock_txn_type THEN -quantity
    ELSE 0::numeric END), 0::numeric) AS reserved
FROM stock_events
GROUP BY product;
GRANT SELECT ON public.stock_balance TO authenticated;
GRANT ALL ON public.stock_balance TO service_role;

-- 2. Switch has_role to SECURITY INVOKER and lock down EXECUTE
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- 3 & 4. Restrict SELECT on transport_pools / transport_pool_items to staff roles
DROP POLICY IF EXISTS pools_read_all_auth ON public.transport_pools;
CREATE POLICY pools_read_staff ON public.transport_pools
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'transport'::app_role)
  OR has_role(auth.uid(), 'warehouse'::app_role)
);

DROP POLICY IF EXISTS pool_items_read_all_auth ON public.transport_pool_items;
CREATE POLICY pool_items_read_staff ON public.transport_pool_items
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'transport'::app_role)
  OR has_role(auth.uid(), 'warehouse'::app_role)
);
