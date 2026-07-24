-- 1) Drop duplicate trigger; keep trg_leads_delivered as the single source of truth
DROP TRIGGER IF EXISTS trg_mark_lead_delivered ON public.leads;

-- 2) Extend cancel_lead to also remove transport_items so canceled leads
--    disappear from Kalendarz and Wspólny Transport immediately.
CREATE OR REPLACE FUNCTION public.cancel_lead(_lead_id uuid, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _net_reserved numeric := 0;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % nie istnieje', _lead_id;
  END IF;

  IF _lead.deleted_at IS NOT NULL THEN
    RETURN; -- idempotentne
  END IF;

  -- Zwolnij rezerwację jeśli aktywna
  IF _lead.reservation_status = 'zarezerwowany' AND _lead.product IS NOT NULL THEN
    PERFORM 1 FROM public.stock_events WHERE product = _lead.product FOR UPDATE;

    SELECT COALESCE(SUM(CASE WHEN txn_type='rezerwacja' THEN quantity
                             WHEN txn_type='zwolnienie_rez' THEN -quantity ELSE 0 END), 0)
      INTO _net_reserved
      FROM public.stock_events
      WHERE lead_id = _lead.id AND product = _lead.product;

    IF _net_reserved > 0 THEN
      INSERT INTO public.stock_events(product, txn_type, quantity, lead_id, reference, note, created_by)
      VALUES (_lead.product, 'zwolnienie_rez', _net_reserved, _lead.id,
              'LEAD:' || LEFT(_lead.id::text, 8),
              'Zwolnienie rezerwacji — anulowanie leada',
              auth.uid());
    END IF;
  END IF;

  -- Odepnij lead od wszystkich zaplanowanych transportów (pozycje znikają z Kalendarza)
  DELETE FROM public.transport_items WHERE lead_id = _lead_id;

  UPDATE public.leads
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         deleted_reason = _reason,
         reservation_status = CASE WHEN reservation_status = 'zarezerwowany'
                                   THEN 'zwolniony' ELSE reservation_status END,
         status = 'przegrany'
   WHERE id = _lead_id;
END; $function$;