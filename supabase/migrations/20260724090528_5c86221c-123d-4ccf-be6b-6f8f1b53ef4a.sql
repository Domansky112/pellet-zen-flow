
-- Atomic settlement: update lead payment fields, optionally release reservation as wydanie,
-- append lead note + append-only audit log — all in a single transaction.
CREATE OR REPLACE FUNCTION public.settle_lead_payment(
  _lead_id uuid,
  _amount numeric,
  _method text,
  _collected boolean,
  _skip_wydanie boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _status text;
  _method_label text;
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

  IF _method = 'przelew' THEN
    _status := CASE WHEN _collected THEN 'oplacone_przelew' ELSE 'czeka_przelew' END;
  ELSE
    _status := CASE WHEN _collected THEN 'oplacone_gotowka' ELSE 'nieoplacone' END;
  END IF;

  UPDATE public.leads
     SET payment_amount_gross = _amount,
         payment_method = _method,
         payment_status = _status
   WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % nie istnieje lub brak uprawnień', _lead_id USING ERRCODE = '42501';
  END IF;

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
    '💰 Rozliczenie: ' || to_char(_amount, 'FM999999990.00') || ' zł brutto · '
    || _method_label || ' · '
    || CASE WHEN _collected THEN 'pobrane na miejscu' ELSE 'oczekuje na przelew' END);

  INSERT INTO public.audit_log(entity_type, entity_id, action, actor_id, details)
  VALUES ('payment', _lead_id, 'settlement', _uid,
    jsonb_build_object(
      'amount', _amount,
      'method', _method,
      'collected_on_site', _collected,
      'payment_status', _status,
      'skip_wydanie', _skip_wydanie
    ));

  RETURN jsonb_build_object('ok', true, 'payment_status', _status);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_lead_payment(uuid, numeric, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_lead_payment(uuid, numeric, text, boolean, boolean) TO authenticated;

-- Belt & suspenders: audit_log is append-only for app roles.
-- (There are already no UPDATE/DELETE RLS policies, so RLS denies them; also revoke privileges.)
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;
