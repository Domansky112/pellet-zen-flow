
CREATE OR REPLACE FUNCTION public.create_poultry_reminder_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days integer;
  _base date;
  _farm text;
  _should boolean := false;
BEGIN
  -- Case 1: transition to delivered on a B2B/Kurnik lead
  IF NEW.is_b2b_kurnik = true
     AND NEW.reservation_status = 'wydany'
     AND (OLD.reservation_status IS DISTINCT FROM 'wydany')
  THEN
    _should := true;
  END IF;

  -- Case 2: lead was already delivered in the past, and NOW gets flipped to B2B/Kurnik
  IF NEW.is_b2b_kurnik = true
     AND (OLD.is_b2b_kurnik IS DISTINCT FROM true)
     AND NEW.reservation_status = 'wydany'
     AND NEW.delivered_at IS NOT NULL
  THEN
    _should := true;
  END IF;

  -- Case 3: cycle_days changed on an active B2B/Kurnik delivered lead — recompute if no future reminder yet
  IF NEW.is_b2b_kurnik = true
     AND OLD.is_b2b_kurnik = true
     AND NEW.reservation_status = 'wydany'
     AND NEW.delivered_at IS NOT NULL
     AND (COALESCE(OLD.cycle_days, 30) IS DISTINCT FROM COALESCE(NEW.cycle_days, 30))
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.poultry_reminders
      WHERE lead_id = NEW.id
        AND status IN ('do_zadzwonienia','w_trakcie')
    ) THEN
      _should := true;
    END IF;
  END IF;

  IF _should THEN
    _days := COALESCE(NEW.cycle_days, 30);
    _base := COALESCE(NEW.delivered_at::date, CURRENT_DATE);
    _farm := COALESCE(NEW.invoice_company, NEW.name, 'Ferma');

    IF NOT EXISTS (
      SELECT 1 FROM public.poultry_reminders
      WHERE lead_id = NEW.id AND reminder_date = _base + _days
    ) THEN
      INSERT INTO public.poultry_reminders
        (lead_id, farm_name, tonnage, assigned_to, reminder_date, status)
      VALUES
        (NEW.id, _farm, NEW.quantity, NEW.assigned_to, _base + _days, 'do_zadzwonienia');
    END IF;
  END IF;

  RETURN NEW;
END; $$;
