CREATE OR REPLACE FUNCTION public.mark_lead_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _now_wygrany boolean := (NEW.status_key = 'wygrany' OR NEW.status = 'wygrany');
  _old_wygrany boolean := (OLD.status_key = 'wygrany' OR OLD.status = 'wygrany');
  _sched date;
  _stamp timestamptz;
BEGIN
  SELECT t.scheduled_date INTO _sched
  FROM public.transport_items ti
  JOIN public.transports t ON t.id = ti.transport_id
  WHERE ti.lead_id = NEW.id AND t.status <> 'anulowany'
  ORDER BY t.scheduled_date DESC
  LIMIT 1;

  _stamp := COALESCE((_sched + time '12:00') AT TIME ZONE 'Europe/Warsaw', now());

  IF NEW.reservation_status = 'wydany' AND (OLD.reservation_status IS DISTINCT FROM 'wydany') THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, _stamp);
  END IF;

  IF _now_wygrany AND NOT _old_wygrany THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, _stamp);
  END IF;

  IF _old_wygrany AND NOT _now_wygrany
     AND NEW.reservation_status IS DISTINCT FROM 'wydany' THEN
    NEW.delivered_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- Korekta historycznych leadów: data realizacji = data transportu
UPDATE public.leads l
SET delivered_at = (s.scheduled_date + time '12:00') AT TIME ZONE 'Europe/Warsaw'
FROM (
  SELECT ti.lead_id, MAX(t.scheduled_date) AS scheduled_date
  FROM public.transport_items ti
  JOIN public.transports t ON t.id = ti.transport_id
  WHERE t.status <> 'anulowany'
  GROUP BY ti.lead_id
) s
WHERE s.lead_id = l.id
  AND l.delivered_at IS NOT NULL
  AND l.delivered_at::date <> s.scheduled_date;