-- Automatyczny test RLS: rola `sales` nie może czytać wrażliwych tabel operacyjnych.
-- Uruchamiane w transakcji z ROLLBACK — bez trwałych zmian.

BEGIN;

-- Syntetyczny użytkownik z rolą sales (widoczny tylko w tej transakcji)
INSERT INTO public.user_roles(user_id, role)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'sales')
ON CONFLICT DO NOTHING;

-- Wcielamy się w authenticated + JWT tego usera
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

-- Sanity: has_role musi zwrócić false dla wrażliwych ról
SELECT
  public.has_role(auth.uid(), 'admin')    AS is_admin_expect_f,
  public.has_role(auth.uid(), 'logistyk') AS is_logistyk_expect_f,
  public.has_role(auth.uid(), 'transport')AS is_transport_expect_f,
  public.has_role(auth.uid(), 'warehouse')AS is_warehouse_expect_f,
  public.has_role(auth.uid(), 'sales')    AS is_sales_expect_t;

-- Właściwy test: SELECT na 6 zablokowanych tabelach musi zwrócić 0
SELECT 'fleet_drivers'      AS table_name, count(*) AS visible_rows FROM public.fleet_drivers
UNION ALL SELECT 'fleet_vehicles',    count(*) FROM public.fleet_vehicles
UNION ALL SELECT 'fleet_trailers',    count(*) FROM public.fleet_trailers
UNION ALL SELECT 'external_carriers', count(*) FROM public.external_carriers
UNION ALL SELECT 'warehouses',        count(*) FROM public.warehouses
UNION ALL SELECT 'fuel_prices',       count(*) FROM public.fuel_prices
ORDER BY table_name;

-- product_definitions: sales MA prawo czytać (kontrolna próba pozytywna)
SELECT 'product_definitions_visible' AS check_name, count(*) AS rows_seen
FROM public.product_definitions;

ROLLBACK;
