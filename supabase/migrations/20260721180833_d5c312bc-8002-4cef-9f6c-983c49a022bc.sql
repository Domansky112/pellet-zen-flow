-- Backfill: dla wszystkich potwierdzonych transportów wspólnych dopilnuj rezerwacji per lead.
DO $$
DECLARE
  _pool RECORD;
  _lead RECORD;
BEGIN
  FOR _pool IN
    SELECT id
    FROM public.transport_pools
    WHERE status = 'potwierdzony'
  LOOP
    FOR _lead IN
      SELECT l.id AS lead_id, l.reservation_status, l.product, l.quantity
      FROM public.transport_pool_items i
      JOIN public.leads l ON l.id = i.lead_id
      WHERE i.pool_id = _pool.id
        AND l.deleted_at IS NULL
        AND l.product IS NOT NULL
        AND l.quantity IS NOT NULL
        AND l.quantity > 0
        AND COALESCE(l.reservation_status, 'brak') <> 'zarezerwowany'
    LOOP
      BEGIN
        PERFORM public.reserve_stock_for_lead(_lead.lead_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Backfill: nie udało się zarezerwować leada % (pool %): %',
          _lead.lead_id, _pool.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;