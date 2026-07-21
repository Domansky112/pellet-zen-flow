
-- Soft delete pól dla leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_deleted_at_idx ON public.leads (deleted_at);
CREATE INDEX IF NOT EXISTS leads_delivered_at_idx ON public.leads (delivered_at);

-- Funkcja: anulowanie leada (soft delete) + automatyczne zwolnienie rezerwacji
CREATE OR REPLACE FUNCTION public.cancel_lead(_lead_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
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

  UPDATE public.leads
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         deleted_reason = _reason,
         reservation_status = CASE WHEN reservation_status = 'zarezerwowany'
                                   THEN 'zwolniony' ELSE reservation_status END,
         status = 'przegrany'
   WHERE id = _lead_id;
END; $$;

-- Trigger: gdy wydanie z magazynu → oznacz lead jako dostarczony
CREATE OR REPLACE FUNCTION public.mark_lead_delivered()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reservation_status = 'wydany' AND (OLD.reservation_status IS DISTINCT FROM 'wydany') THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_leads_delivered ON public.leads;
CREATE TRIGGER trg_leads_delivered
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.mark_lead_delivered();

-- Backfill delivered_at dla już wydanych
UPDATE public.leads
   SET delivered_at = COALESCE(delivered_at, updated_at)
 WHERE reservation_status = 'wydany' AND delivered_at IS NULL;

GRANT EXECUTE ON FUNCTION public.cancel_lead(uuid, text) TO authenticated;
