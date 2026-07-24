
-- 1) Extend delivered-stamping trigger: also react to status flips to/from 'wygrany'
CREATE OR REPLACE FUNCTION public.mark_lead_delivered()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _now_wygrany boolean := (NEW.status_key = 'wygrany' OR NEW.status = 'wygrany');
  _old_wygrany boolean := (OLD.status_key = 'wygrany' OR OLD.status = 'wygrany');
BEGIN
  -- Existing behavior: warehouse wydanie stamps delivered_at
  IF NEW.reservation_status = 'wydany' AND (OLD.reservation_status IS DISTINCT FROM 'wydany') THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  END IF;

  -- New: transition INTO 'wygrany' (Zrealizowany) also creates a delivery history entry
  IF _now_wygrany AND NOT _old_wygrany THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  END IF;

  -- New: transition OUT of 'wygrany' withdraws the delivery entry
  IF _old_wygrany AND NOT _now_wygrany
     AND NEW.reservation_status IS DISTINCT FROM 'wydany' THEN
    NEW.delivered_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger is attached (idempotent)
DROP TRIGGER IF EXISTS trg_mark_lead_delivered ON public.leads;
CREATE TRIGGER trg_mark_lead_delivered
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.mark_lead_delivered();

-- 2) Admin repair: fill delivered_at for any wygrany lead that lacks it
CREATE OR REPLACE FUNCTION public.sync_delivery_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _fixed int := 0;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Tylko administrator' USING ERRCODE = '42501';
  END IF;

  WITH upd AS (
    UPDATE public.leads
       SET delivered_at = now()
     WHERE (status_key = 'wygrany' OR status = 'wygrany')
       AND delivered_at IS NULL
       AND deleted_at IS NULL
     RETURNING id
  )
  SELECT count(*) INTO _fixed FROM upd;

  INSERT INTO public.audit_log(entity_type, entity_id, action, actor_id, details)
  VALUES ('delivery_history', NULL, 'sync', _uid, jsonb_build_object('fixed', _fixed));

  RETURN jsonb_build_object('ok', true, 'fixed', _fixed);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_delivery_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_delivery_history() TO authenticated;

-- 3) One-time backfill for existing rows
UPDATE public.leads
   SET delivered_at = now()
 WHERE (status_key = 'wygrany' OR status = 'wygrany')
   AND delivered_at IS NULL
   AND deleted_at IS NULL;
