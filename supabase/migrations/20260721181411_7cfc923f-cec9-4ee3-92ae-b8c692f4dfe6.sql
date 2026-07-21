CREATE OR REPLACE VIEW public.stock_balance
WITH (security_invoker = on) AS
SELECT product,
  COALESCE(SUM(CASE WHEN txn_type='przyjecie' THEN quantity
                    WHEN txn_type='wydanie'  THEN -quantity
                    WHEN txn_type='korekta'  THEN quantity
                    ELSE 0 END), 0) AS physical,
  COALESCE(SUM(CASE WHEN txn_type='rezerwacja'     THEN quantity
                    WHEN txn_type='zwolnienie_rez' THEN -quantity
                    ELSE 0 END), 0) AS reserved,
  COALESCE(SUM(CASE WHEN txn_type='przyjecie' THEN quantity
                    WHEN txn_type='wydanie'  THEN -quantity
                    WHEN txn_type='korekta'  THEN quantity
                    ELSE 0 END), 0)
  -
  COALESCE(SUM(CASE WHEN txn_type='rezerwacja'     THEN quantity
                    WHEN txn_type='zwolnienie_rez' THEN -quantity
                    ELSE 0 END), 0) AS available
FROM public.stock_events
GROUP BY product;

GRANT SELECT ON public.stock_balance TO authenticated;