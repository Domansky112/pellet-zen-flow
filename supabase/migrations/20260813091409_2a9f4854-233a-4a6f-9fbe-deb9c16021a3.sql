ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sales_vat_rate numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS transport_cost_gross numeric,
  ADD COLUMN IF NOT EXISTS transport_vat_rate numeric NOT NULL DEFAULT 23;

INSERT INTO public.system_settings(key, value, description)
VALUES ('transport_default_rate_per_ton', jsonb_build_object('pln_per_ton', 60), 'Domyślna stawka transportu za tonę (propozycja kosztu transportu)')
ON CONFLICT (key) DO NOTHING;

-- Backfill istniejących zrealizowanych rozliczeń
UPDATE public.leads
   SET sales_vat_rate = 8,
       transport_vat_rate = 23
 WHERE deleted_at IS NULL
   AND COALESCE(payment_amount_gross, 0) > 0;

UPDATE public.leads l
   SET transport_cost_gross = ROUND(GREATEST(150, COALESCE(l.quantity, 0) * COALESCE((s.value->>'pln_per_ton')::numeric, 60))::numeric, 2)
  FROM public.system_settings s
 WHERE s.key = 'transport_default_rate_per_ton'
   AND l.deleted_at IS NULL
   AND l.transport_cost_gross IS NULL
   AND COALESCE(l.payment_amount_gross, 0) > 0;

-- Rozszerzenie funkcji rozliczeniowej o VAT i koszt transportu
CREATE OR REPLACE FUNCTION public.settle_lead_payment(
  _lead_id uuid,
  _amount numeric,
  _method text,
  _collected boolean,
  _skip_wydanie boolean DEFAULT false,
  _new_status_key text DEFAULT NULL::text,
  _sales_vat_rate numeric DEFAULT NULL,
  _transport_cost_gross numeric DEFAULT NULL,
  _transport_vat_rate numeric DEFAULT NULL
)
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

  IF _existing.payment_amount_gross IS NOT DISTINCT FROM _amount
     AND _existing.payment_method IS NOT DISTINCT FROM _method
     AND _existing.payment_status IS NOT DISTINCT FROM _status
     AND (_new_status_key IS NULL OR _existing.status_key IS NOT DISTINCT FROM _new_status_key)
     AND (_sales_vat_rate IS NULL OR _existing.sales_vat_rate IS NOT DISTINCT FROM _sales_vat_rate)
     AND (_transport_cost_gross IS NULL OR _existing.transport_cost_gross IS NOT DISTINCT FROM _transport_cost_gross)
     AND (_transport_vat_rate IS NULL OR _existing.transport_vat_rate IS NOT DISTINCT FROM _transport_vat_rate)
  THEN
    RETURN jsonb_build_object('ok', true, 'payment_status', _status, 'duplicate', true);
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

  IF NOT _skip_wydanie THEN
    PERFORM public.release_reservation_as_wydanie(_lead_id);
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
  VALUES ('payment', _lead_id, 'settlement', _uid,
    jsonb_build_object(
      'amount', _amount,
      'method', _method,
      'collected_on_site', _collected,
      'payment_status', _status,
      'skip_wydanie', _skip_wydanie,
      'new_status_key', _new_status_key,
      'sales_vat_rate', COALESCE(_sales_vat_rate, _existing.sales_vat_rate),
      'transport_cost_gross', COALESCE(_transport_cost_gross, _existing.transport_cost_gross),
      'transport_vat_rate', COALESCE(_transport_vat_rate, _existing.transport_vat_rate),
      'prev_amount', _existing.payment_amount_gross,
      'prev_status', _existing.payment_status
    ));

  RETURN jsonb_build_object('ok', true, 'payment_status', _status, 'duplicate', false);
END;
$function$;