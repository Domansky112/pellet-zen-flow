
-- Recreate product_type enum without 'brykiet' (no rows use it)
DROP VIEW IF EXISTS public.stock_balance;

ALTER TYPE public.product_type RENAME TO product_type_old;
CREATE TYPE public.product_type AS ENUM ('pellet_paleta', 'pellet_bigbag', 'inne');

ALTER TABLE public.leads ALTER COLUMN product TYPE public.product_type USING product::text::public.product_type;
ALTER TABLE public.stock_events ALTER COLUMN product TYPE public.product_type USING product::text::public.product_type;
ALTER TABLE public.transport_items ALTER COLUMN product TYPE public.product_type USING product::text::public.product_type;

DROP TYPE public.product_type_old;

CREATE VIEW public.stock_balance AS
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
FROM public.stock_events
GROUP BY product;

GRANT SELECT ON public.stock_balance TO authenticated;
GRANT ALL ON public.stock_balance TO service_role;
