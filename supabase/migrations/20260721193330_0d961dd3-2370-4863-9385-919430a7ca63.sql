
CREATE OR REPLACE FUNCTION public.search_leads_global(_q text)
RETURNS SETOF public.leads
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT
      trim(_q) AS raw,
      lower(trim(_q)) AS lower_q,
      regexp_replace(_q, '\D', '', 'g') AS digits
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
$$;

REVOKE ALL ON FUNCTION public.search_leads_global(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_leads_global(text) TO authenticated;
