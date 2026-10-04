CREATE OR REPLACE FUNCTION public.enforce_lead_closed_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Lead rozliczony i wydany = zrealizowany
  IF NEW.deleted_at IS NULL
     AND NEW.reservation_status = 'wydany'
     AND NEW.payment_status IS NOT NULL AND NEW.payment_status LIKE 'oplacone%'
     AND NEW.delivered_at IS NOT NULL
     AND COALESCE(NEW.status_key,'') NOT IN ('wygrany','przegrany')
     AND (TG_OP = 'INSERT' OR OLD.reservation_status IS DISTINCT FROM NEW.reservation_status
          OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
          OR OLD.delivered_at IS DISTINCT FROM NEW.delivered_at
          OR COALESCE(OLD.status_key,'') = COALESCE(NEW.status_key,''))
  THEN
    NEW.status_key := 'wygrany';
    NEW.status := 'wygrany';
    NEW.status_changed_at := now();
  END IF;
  -- Zamknięty lead nie może czekać na wspólny transport
  IF COALESCE(NEW.status_key, NEW.status::text) IN ('wygrany','przegrany') OR NEW.deleted_at IS NOT NULL THEN
    IF NEW.pooling_status = 'poczekalnia' THEN
      NEW.pooling_status := 'wyslany';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_lead_closed_consistency ON public.leads;
CREATE TRIGGER trg_enforce_lead_closed_consistency
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_closed_consistency();

UPDATE public.leads SET status_key = 'wygrany', status = 'wygrany', status_changed_at = COALESCE(status_changed_at, now())
WHERE deleted_at IS NULL AND reservation_status = 'wydany' AND payment_status LIKE 'oplacone%'
  AND delivered_at IS NOT NULL AND COALESCE(status_key,'') NOT IN ('wygrany','przegrany');

UPDATE public.leads SET pooling_status = 'wyslany'
WHERE pooling_status = 'poczekalnia' AND (COALESCE(status_key, status::text) IN ('wygrany','przegrany') OR deleted_at IS NOT NULL);