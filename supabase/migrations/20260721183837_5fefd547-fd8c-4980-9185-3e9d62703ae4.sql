
-- Zminimalizowane widoki dla ról poniżej logistyk/transport.
-- Funkcje SECURITY DEFINER zwracają tylko bezpieczne pola.
-- Pełne dane pozostają za RLS bazowych tabel (staff-only).

-- 1) Kierowcy: id + status (bez imienia/telefonu/e-maila)
CREATE OR REPLACE FUNCTION public.list_fleet_drivers_min()
RETURNS TABLE(id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id, status FROM public.fleet_drivers ORDER BY id $$;

-- 2) Pojazdy: id + status + capacity_tons (bez rejestracji/marki/modelu)
CREATE OR REPLACE FUNCTION public.list_fleet_vehicles_min()
RETURNS TABLE(id uuid, status text, capacity_tons numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id, status, capacity_tons FROM public.fleet_vehicles ORDER BY id $$;

-- 3) Naczepy: id + status + typ (bez rejestracji)
CREATE OR REPLACE FUNCTION public.list_fleet_trailers_min()
RETURNS TABLE(id uuid, status text, trailer_type text, capacity_tons numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id, status, trailer_type, capacity_tons FROM public.fleet_trailers ORDER BY id $$;

-- 4) Przewoźnicy zewnętrzni: id + nazwa firmy + status (bez NIP/telefonu/e-maila/stawek)
CREATE OR REPLACE FUNCTION public.list_external_carriers_min()
RETURNS TABLE(id uuid, company_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id, company_name, status FROM public.external_carriers ORDER BY company_name $$;

-- 5) Magazyny: id + nazwa + miasto (bez pełnego adresu, kodu, notatek)
CREATE OR REPLACE FUNCTION public.list_warehouses_min()
RETURNS TABLE(id uuid, name text, city text, is_default boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id, name, city, is_default FROM public.warehouses ORDER BY is_default DESC, name $$;

-- 6) Ceny paliwa: typ + data pobrania (bez konkretnej ceny — cena to informacja handlowa)
CREATE OR REPLACE FUNCTION public.list_fuel_prices_min()
RETURNS TABLE(fuel_type text, fetched_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT ON (fuel_type) fuel_type, fetched_at
  FROM public.fuel_prices
  ORDER BY fuel_type, fetched_at DESC
$$;

-- Dostęp: tylko zalogowani (nie anon). Sales i wyższe role mogą wywoływać.
REVOKE ALL ON FUNCTION public.list_fleet_drivers_min()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_fleet_vehicles_min()     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_fleet_trailers_min()     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_external_carriers_min()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_warehouses_min()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_fuel_prices_min()        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_fleet_drivers_min()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_fleet_vehicles_min()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_fleet_trailers_min()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_external_carriers_min() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_warehouses_min()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_fuel_prices_min()       TO authenticated;
