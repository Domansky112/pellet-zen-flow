
-- =====================================================================
-- Consolidate duplicated / orphan lead reservations created by the buggy
-- transport-create flow. For every lead where net reserved > lead.quantity
-- (for the lead's product), insert a corrective 'zwolnienie_rez' event
-- releasing the excess, so warehouse "Available" reflects reality again.
-- =====================================================================
DO $$
DECLARE r RECORD; excess numeric;
BEGIN
  FOR r IN
    SELECT l.id AS lead_id, l.product, l.quantity AS wanted,
           COALESCE(SUM(CASE WHEN se.txn_type='rezerwacja' THEN se.quantity
                             WHEN se.txn_type='zwolnienie_rez' THEN -se.quantity END),0) AS net_reserved
    FROM public.leads l
    JOIN public.stock_events se ON se.lead_id = l.id AND se.product = l.product
    WHERE l.deleted_at IS NULL
      AND l.product IS NOT NULL
      AND l.quantity IS NOT NULL
    GROUP BY l.id, l.product, l.quantity
    HAVING COALESCE(SUM(CASE WHEN se.txn_type='rezerwacja' THEN se.quantity
                             WHEN se.txn_type='zwolnienie_rez' THEN -se.quantity END),0)
           > l.quantity
  LOOP
    excess := r.net_reserved - r.wanted;
    INSERT INTO public.stock_events(product, txn_type, quantity, lead_id, reference, note)
    VALUES (r.product, 'zwolnienie_rez', excess, r.lead_id,
            'AUDIT:DEDUPE',
            format('Konsolidacja podwójnej rezerwacji: nadwyżka %s t (net=%s, żądano=%s)',
                   excess, r.net_reserved, r.wanted));
  END LOOP;
END $$;

-- =====================================================================
-- Also release reservations for leads that were soft-deleted / cancelled
-- but still hold net stock (defensive — cancel_lead already handles this
-- but audits found leftover orphans).
-- =====================================================================
DO $$
DECLARE r RECORD; net numeric;
BEGIN
  FOR r IN
    SELECT l.id AS lead_id, se.product,
           SUM(CASE WHEN se.txn_type='rezerwacja' THEN se.quantity
                    WHEN se.txn_type='zwolnienie_rez' THEN -se.quantity END) AS net_reserved
    FROM public.leads l
    JOIN public.stock_events se ON se.lead_id = l.id
    WHERE l.deleted_at IS NOT NULL
    GROUP BY l.id, se.product
    HAVING SUM(CASE WHEN se.txn_type='rezerwacja' THEN se.quantity
                    WHEN se.txn_type='zwolnienie_rez' THEN -se.quantity END) > 0
  LOOP
    INSERT INTO public.stock_events(product, txn_type, quantity, lead_id, reference, note)
    VALUES (r.product, 'zwolnienie_rez', r.net_reserved, r.lead_id,
            'AUDIT:DEDUPE',
            'Zwolnienie rezerwacji dla anulowanego leada (audyt)');
  END LOOP;
END $$;
