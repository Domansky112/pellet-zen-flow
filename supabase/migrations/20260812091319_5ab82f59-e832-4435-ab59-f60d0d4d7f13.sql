REVOKE ALL ON FUNCTION public.consume_lots_fifo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_lot_on_consumption_delete() FROM PUBLIC, anon, authenticated;