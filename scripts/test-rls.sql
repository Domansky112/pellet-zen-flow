-- Test RLS (warstwa 1): polityki SELECT dla wrażliwych tabel MUSZĄ używać has_role,
-- nie mogą zezwalać wszystkim uwierzytelnionym (qual='true').

WITH sensitive(t) AS (VALUES
  ('fleet_drivers'),('fleet_vehicles'),('fleet_trailers'),
  ('external_carriers'),('warehouses'),('fuel_prices')
),
select_policies AS (
  SELECT tablename, policyname, qual
  FROM pg_policies
  WHERE schemaname='public' AND cmd='SELECT'
)
SELECT
  s.t AS table_name,
  COALESCE(
    (SELECT string_agg(policyname || ' :: ' || qual, ' | ')
       FROM select_policies p WHERE p.tablename=s.t),
    '<BRAK POLITYKI SELECT>'
  ) AS policies,
  -- wynik OK: istnieje polityka i ŻADNA nie jest 'true' i przynajmniej jedna używa has_role
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM select_policies p WHERE p.tablename=s.t)
      THEN 'FAIL_NO_POLICY'
    WHEN EXISTS (SELECT 1 FROM select_policies p WHERE p.tablename=s.t AND btrim(p.qual)='true')
      THEN 'FAIL_OPEN'
    WHEN NOT EXISTS (SELECT 1 FROM select_policies p WHERE p.tablename=s.t AND p.qual ILIKE '%has_role%')
      THEN 'FAIL_NO_HAS_ROLE'
    ELSE 'OK'
  END AS verdict
FROM sensitive s
ORDER BY s.t;
