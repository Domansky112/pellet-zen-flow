
-- Sequence for lead numbers
CREATE SEQUENCE IF NOT EXISTS public.leads_number_seq START 1000;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS delivery_window text,
  ADD COLUMN IF NOT EXISTS access_tight boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_tonnage_limit text,
  ADD COLUMN IF NOT EXISTS access_unpaved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS urgent_no_fuel boolean NOT NULL DEFAULT false;

-- Auto-assign lead_number on insert
CREATE OR REPLACE FUNCTION public.assign_lead_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_number IS NULL OR NEW.lead_number = '' THEN
    NEW.lead_number := '#' || LPAD(nextval('public.leads_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_assign_lead_number ON public.leads;
CREATE TRIGGER trg_assign_lead_number
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assign_lead_number();

-- Backfill existing leads (in creation order)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE lead_number IS NULL ORDER BY created_at LOOP
    UPDATE public.leads
       SET lead_number = '#' || LPAD(nextval('public.leads_number_seq')::text, 4, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

-- Extend global search: match on lead_number (with or without '#')
CREATE OR REPLACE FUNCTION public.search_leads_global(_q text)
 RETURNS SETOF public.leads
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT
      trim(_q) AS raw,
      lower(trim(_q)) AS lower_q,
      regexp_replace(_q, '\D', '', 'g') AS digits,
      ltrim(trim(_q), '#') AS num
  )
  SELECT l.*
  FROM public.leads l, q
  WHERE l.deleted_at IS NULL
    AND (
      l.name ILIKE '%' || q.raw || '%'
      OR coalesce(l.first_name,'') ILIKE '%' || q.raw || '%'
      OR coalesce(l.last_name,'') ILIKE '%' || q.raw || '%'
      OR coalesce(l.email,'') ILIKE '%' || q.raw || '%'
      OR coalesce(l.city,'') ILIKE '%' || q.raw || '%'
      OR coalesce(l.invoice_company,'') ILIKE '%' || q.raw || '%'
      OR coalesce(l.invoice_nip,'') ILIKE '%' || q.raw || '%'
      OR coalesce(l.lead_number,'') ILIKE '%' || q.raw || '%'
      OR coalesce(l.lead_number,'') ILIKE '%' || q.num || '%'
      OR (
        length(q.digits) >= 3
        AND regexp_replace(coalesce(l.phone,''), '\D', '', 'g') ILIKE '%' || q.digits || '%'
      )
      OR (
        length(q.digits) >= 3
        AND regexp_replace(coalesce(l.invoice_nip,''), '\D', '', 'g') ILIKE '%' || q.digits || '%'
      )
    )
  ORDER BY l.created_at DESC
  LIMIT 30
$function$;
