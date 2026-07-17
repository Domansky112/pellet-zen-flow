DROP VIEW IF EXISTS public.stock_balance;
CREATE VIEW public.stock_balance WITH (security_invoker = true) AS
SELECT
  product,
  COALESCE(SUM(CASE
    WHEN txn_type = 'przyjecie' THEN quantity
    WHEN txn_type = 'wydanie' THEN -quantity
    WHEN txn_type = 'korekta' THEN quantity
    ELSE 0 END), 0) AS physical,
  COALESCE(SUM(CASE
    WHEN txn_type = 'rezerwacja' THEN quantity
    WHEN txn_type = 'zwolnienie_rez' THEN -quantity
    ELSE 0 END), 0) AS reserved
FROM public.stock_events
GROUP BY product;
GRANT SELECT ON public.stock_balance TO authenticated;