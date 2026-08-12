CREATE TABLE public.stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product product_type NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  remaining_quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 8,
  supplier text,
  invoice_number text,
  note text,
  stock_event_id uuid REFERENCES public.stock_events(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_lots TO authenticated;
GRANT ALL ON public.stock_lots TO service_role;
ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_lots read staff" ON public.stock_lots FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'transport')
  OR public.has_role(auth.uid(),'logistyk')
);
CREATE POLICY "stock_lots write warehouse" ON public.stock_lots FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));

CREATE INDEX idx_stock_lots_fifo ON public.stock_lots (product, created_at) WHERE remaining_quantity > 0;

CREATE TRIGGER trg_stock_lots_updated BEFORE UPDATE ON public.stock_lots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.stock_lot_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
  stock_event_id uuid REFERENCES public.stock_events(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  product product_type NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  cost numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_lot_consumptions TO authenticated;
GRANT ALL ON public.stock_lot_consumptions TO service_role;
ALTER TABLE public.stock_lot_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lot_consumptions read staff" ON public.stock_lot_consumptions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'transport')
  OR public.has_role(auth.uid(),'logistyk')
);
CREATE POLICY "lot_consumptions write warehouse" ON public.stock_lot_consumptions FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));

CREATE INDEX idx_lot_consumptions_lead ON public.stock_lot_consumptions (lead_id);

-- FIFO: każde wydanie zdejmuje tonaż z najstarszych partii
CREATE OR REPLACE FUNCTION public.consume_lots_fifo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _left numeric;
  _take numeric;
  _lot public.stock_lots%ROWTYPE;
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

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_stock_events_fifo
AFTER INSERT ON public.stock_events
FOR EACH ROW EXECUTE FUNCTION public.consume_lots_fifo();

-- Cofnięcie rozchodu przywraca tonaż do partii
CREATE OR REPLACE FUNCTION public.restore_lot_on_consumption_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.stock_lots
     SET remaining_quantity = LEAST(quantity, remaining_quantity + OLD.quantity)
   WHERE id = OLD.lot_id;
  RETURN OLD;
END; $$;

CREATE TRIGGER trg_lot_consumption_restore
BEFORE DELETE ON public.stock_lot_consumptions
FOR EACH ROW EXECUTE FUNCTION public.restore_lot_on_consumption_delete();

REVOKE EXECUTE ON FUNCTION public.consume_lots_fifo() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.restore_lot_on_consumption_delete() FROM authenticated, anon;