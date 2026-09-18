CREATE OR REPLACE FUNCTION public.fulfill_lead_stock(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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

  INSERT INTO public.stock_events(product, txn_type, quantity, lead_id, reference, note, created_by)
  VALUES (_lead.product, 'wydanie', _qty, _lead.id,
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
    'stock_before', _physical,
    'shortfall', GREATEST(_qty - _physical, 0)
  );
END; $$;

REVOKE ALL ON FUNCTION public.fulfill_lead_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fulfill_lead_stock(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_lead_payment(_lead_id uuid, _amount numeric, _method text, _collected boolean, _skip_wydanie boolean DEFAULT false, _new_status_key text DEFAULT NULL::text, _sales_vat_rate numeric DEFAULT NULL::numeric, _transport_cost_gross numeric DEFAULT NULL::numeric, _transport_vat_rate numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _status text;
  _method_label text;
  _enum_values text[] := ARRAY['nowy','w_kontakcie','oferta','wygrany','przegrany'];
  _existing public.leads%ROWTYPE;
  _do_wydanie boolean;
  _stock jsonb := NULL;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Brak autoryzacji' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount < 0 OR _amount > 10000000 THEN
    RAISE EXCEPTION 'Kwota musi być liczbą 0..10 000 000' USING ERRCODE = '22023';
  END IF;
  IF _method NOT IN ('gotowka','karta_blik','przelew') THEN
    RAISE EXCEPTION 'Nieprawidłowa forma płatności' USING ERRCODE = '22023';
  END IF;
  IF _sales_vat_rate IS NOT NULL AND _sales_vat_rate NOT IN (0,8,23) THEN
    RAISE EXCEPTION 'Nieprawidłowa stawka VAT towaru' USING ERRCODE = '22023';
  END IF;
  IF _transport_vat_rate IS NOT NULL AND _transport_vat_rate NOT IN (0,8,23) THEN
    RAISE EXCEPTION 'Nieprawidłowa stawka VAT transportu' USING ERRCODE = '22023';
  END IF;
  IF _transport_cost_gross IS NOT NULL AND (_transport_cost_gross < 0 OR _transport_cost_gross > 1000000) THEN
    RAISE EXCEPTION 'Nieprawidłowy koszt transportu' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('settle_lead_payment:' || _lead_id::text));

  IF _method = 'przelew' THEN
    _status := CASE WHEN _collected THEN 'oplacone_przelew' ELSE 'czeka_przelew' END;
  ELSE
    _status := CASE WHEN _collected THEN 'oplacone_gotowka' ELSE 'nieoplacone' END;
  END IF;

  SELECT * INTO _existing FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % nie istnieje lub brak uprawnień', _lead_id USING ERRCODE = '42501';
  END IF;

  -- Lead zrealizowany = towar wydany. Wydanie pomijamy tylko wtedy, gdy
  -- rozliczenie nie zamyka leada (skip_wydanie bez statusu 'wygrany').
  _do_wydanie := (NOT _skip_wydanie)
                 OR _new_status_key = 'wygrany'
                 OR COALESCE(_existing.status_key, _existing.status::text) = 'wygrany';

  IF _existing.payment_amount_gross IS NOT NULL THEN
    IF _new_status_key IS NOT NULL AND _new_status_key IS DISTINCT FROM _existing.status_key THEN
      UPDATE public.leads
         SET status_key = _new_status_key,
             status = CASE
                        WHEN _new_status_key = ANY(_enum_values) THEN _new_status_key::lead_status
                        ELSE status
                      END
       WHERE id = _lead_id;
    END IF;

    IF _do_wydanie THEN
      _stock := public.fulfill_lead_stock(_lead_id);
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'already_settled', true,
      'payment_status', _existing.payment_status,
      'payment_amount_gross', _existing.payment_amount_gross,
      'stock', _stock
    );
  END IF;

  UPDATE public.leads
     SET payment_amount_gross = _amount,
         payment_method = _method,
         payment_status = _status,
         sales_vat_rate = COALESCE(_sales_vat_rate, sales_vat_rate),
         transport_cost_gross = COALESCE(_transport_cost_gross, transport_cost_gross),
         transport_vat_rate = COALESCE(_transport_vat_rate, transport_vat_rate),
         status_key = COALESCE(_new_status_key, status_key),
         status = CASE
                    WHEN _new_status_key IS NOT NULL AND _new_status_key = ANY(_enum_values)
                      THEN _new_status_key::lead_status
                    ELSE status
                  END
   WHERE id = _lead_id;

  IF _do_wydanie THEN
    _stock := public.fulfill_lead_stock(_lead_id);
  END IF;

  _method_label := CASE _method
    WHEN 'gotowka' THEN 'Gotówka u kierowcy'
    WHEN 'karta_blik' THEN 'Karta / BLIK u kierowcy'
    ELSE 'Przelew bankowy'
  END;

  INSERT INTO public.lead_notes(lead_id, author_id, body)
  VALUES (_lead_id, _uid,
    '💰 Rozliczenie: ' || to_char(_amount, 'FM999999990.00') || ' zł brutto (VAT '
    || to_char(COALESCE(_sales_vat_rate, _existing.sales_vat_rate, 8), 'FM990') || '%) · '
    || _method_label || ' · '
    || CASE WHEN _collected THEN 'pobrane na miejscu' ELSE 'oczekuje na przelew' END
    || CASE WHEN COALESCE(_transport_cost_gross, _existing.transport_cost_gross) IS NOT NULL
            THEN ' · transport: ' || to_char(COALESCE(_transport_cost_gross, _existing.transport_cost_gross), 'FM999999990.00') || ' zł'
            ELSE '' END);

  INSERT INTO public.audit_log(entity_type, entity_id, action, actor_id, details)
  VALUES ('lead', _lead_id, 'settle_payment', _uid,
    jsonb_build_object(
      'amount', _amount,
      'method', _method,
      'collected', _collected,
      'payment_status', _status,
      'skip_wydanie', _skip_wydanie,
      'new_status_key', _new_status_key,
      'stock', _stock
    ));

  RETURN jsonb_build_object('ok', true, 'payment_status', _status, 'stock', _stock);
END;
$function$;

-- Jednorazowe domknięcie zrealizowanych leadów z wiszącą rezerwacją
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.leads
     WHERE deleted_at IS NULL
       AND reservation_status = 'zarezerwowany'
       AND (status_key = 'wygrany' OR status::text = 'wygrany')
  LOOP
    PERFORM public.fulfill_lead_stock(r.id);
  END LOOP;
END $$;