-- 1) Liczba sztuk (Big Bag) obok tonażu
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS units numeric;
ALTER TABLE public.stock_lots
  ADD COLUMN IF NOT EXISTS units numeric,
  ADD COLUMN IF NOT EXISTS remaining_units numeric;

-- 2) Sprzedaż: liczba wydanych sztuk + cena netto za tonę
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sold_units numeric,
  ADD COLUMN IF NOT EXISTS price_per_ton_net numeric;

-- 3) Bilans magazynu również w sztukach
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT product,
  COALESCE(sum(CASE WHEN txn_type='przyjecie' THEN quantity
                    WHEN txn_type='wydanie' THEN -quantity
                    WHEN txn_type='korekta' THEN quantity ELSE 0 END),0) AS physical,
  COALESCE(sum(CASE WHEN txn_type='rezerwacja' THEN quantity
                    WHEN txn_type='zwolnienie_rez' THEN -quantity ELSE 0 END),0) AS reserved,
  COALESCE(sum(CASE WHEN txn_type='przyjecie' THEN quantity
                    WHEN txn_type='wydanie' THEN -quantity
                    WHEN txn_type='korekta' THEN quantity ELSE 0 END),0)
  - COALESCE(sum(CASE WHEN txn_type='rezerwacja' THEN quantity
                      WHEN txn_type='zwolnienie_rez' THEN -quantity ELSE 0 END),0) AS available,
  COALESCE(sum(CASE WHEN txn_type='przyjecie' THEN COALESCE(units,0)
                    WHEN txn_type='wydanie' THEN -COALESCE(units,0)
                    WHEN txn_type='korekta' THEN COALESCE(units,0) ELSE 0 END),0) AS physical_units
FROM public.stock_events
GROUP BY product;

-- 4) FIFO: zdejmuj także sztuki z partii
CREATE OR REPLACE FUNCTION public.consume_lots_fifo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _left numeric;
  _take numeric;
  _lot public.stock_lots%ROWTYPE;
  _units_left numeric;
  _units_take numeric;
BEGIN
  IF NEW.txn_type <> 'wydanie' THEN
    RETURN NEW;
  END IF;

  _left := NEW.quantity;

  FOR _lot IN
    SELECT * FROM public.stock_lots
     WHERE product = NEW.product AND remaining_quantity > 0
     ORDER BY created_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN _left <= 0;
    _take := LEAST(_lot.remaining_quantity, _left);

    UPDATE public.stock_lots
       SET remaining_quantity = remaining_quantity - _take
     WHERE id = _lot.id;

    INSERT INTO public.stock_lot_consumptions(lot_id, stock_event_id, lead_id, product, quantity, unit_price, cost)
    VALUES (_lot.id, NEW.id, NEW.lead_id, NEW.product, _take, _lot.unit_price, _take * _lot.unit_price);

    _left := _left - _take;
  END LOOP;

  -- sztuki (Big Bagi) zdejmowane niezależnie, również FIFO
  _units_left := COALESCE(NEW.units, 0);
  IF _units_left > 0 THEN
    FOR _lot IN
      SELECT * FROM public.stock_lots
       WHERE product = NEW.product AND COALESCE(remaining_units,0) > 0
       ORDER BY created_at ASC, id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN _units_left <= 0;
      _units_take := LEAST(_lot.remaining_units, _units_left);
      UPDATE public.stock_lots
         SET remaining_units = remaining_units - _units_take
       WHERE id = _lot.id;
      _units_left := _units_left - _units_take;
    END LOOP;
  END IF;

  RETURN NEW;
END; $function$;

-- 5) Wydanie przy realizacji leada zdejmuje też sztuki
CREATE OR REPLACE FUNCTION public.fulfill_lead_stock(_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _net_reserved numeric := 0;
  _qty numeric := 0;
  _physical numeric := 0;
  _has_wydanie boolean := false;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % nie istnieje', _lead_id;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stock_events
     WHERE lead_id = _lead.id AND txn_type = 'wydanie'
  ) INTO _has_wydanie;

  IF _has_wydanie OR _lead.reservation_status = 'wydany' THEN
    IF _lead.reservation_status <> 'wydany' THEN
      UPDATE public.leads SET reservation_status = 'wydany' WHERE id = _lead.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'already_fulfilled', true);
  END IF;

  IF _lead.product IS NULL THEN
    RAISE EXCEPTION 'Lead nie ma wybranego produktu — nie można wydać z magazynu';
  END IF;

  PERFORM 1 FROM public.stock_events WHERE product = _lead.product FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN txn_type='rezerwacja' THEN quantity
                           WHEN txn_type='zwolnienie_rez' THEN -quantity ELSE 0 END),0)
    INTO _net_reserved
    FROM public.stock_events
   WHERE lead_id = _lead.id AND product = _lead.product;

  IF _net_reserved > 0 THEN
    _qty := _net_reserved;
  ELSE
    _qty := COALESCE(_lead.quantity, 0);
  END IF;

  IF _qty <= 0 THEN
    RAISE EXCEPTION 'Lead nie ma podanego tonażu — nie można wydać z magazynu';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN txn_type='przyjecie' THEN quantity
                           WHEN txn_type='wydanie' THEN -quantity
                           WHEN txn_type='korekta' THEN quantity ELSE 0 END),0)
    INTO _physical
    FROM public.stock_events
   WHERE product = _lead.product;

  IF _net_reserved > 0 THEN
    INSERT INTO public.stock_events(product, txn_type, quantity, lead_id, reference, note, created_by)
    VALUES (_lead.product, 'zwolnienie_rez', _net_reserved, _lead.id,
            'LEAD:' || LEFT(_lead.id::text, 8), 'Wydanie towaru — zwolnienie rezerwacji', auth.uid());
  END IF;

  INSERT INTO public.stock_events(product, txn_type, quantity, units, lead_id, reference, note, created_by)
  VALUES (_lead.product, 'wydanie', _qty, _lead.sold_units, _lead.id,
          'LEAD:' || LEFT(_lead.id::text, 8),
          CASE WHEN _net_reserved > 0 THEN 'Wydanie towaru z rezerwacji'
               ELSE 'Automatyczne wydanie — lead zrealizowany' END,
          auth.uid());

  UPDATE public.leads
     SET reservation_status = 'wydany',
         status = 'wygrany'
   WHERE id = _lead.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_fulfilled', false,
    'quantity', _qty,
    'units', _lead.sold_units,
    'stock_before', _physical,
    'shortfall', GREATEST(_qty - _physical, 0)
  );
END; $function$;