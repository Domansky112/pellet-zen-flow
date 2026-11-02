ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS rate_per_ton numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS affiliate_partner_id uuid REFERENCES public.affiliate_partners(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.auto_affiliate_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rate numeric; _tons numeric;
BEGIN
  IF NEW.affiliate_partner_id IS NULL OR NEW.delivered_at IS NULL OR OLD.delivered_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM affiliate_commissions WHERE lead_id = NEW.id AND partner_id = NEW.affiliate_partner_id) THEN
    RETURN NEW;
  END IF;
  SELECT rate_per_ton INTO _rate FROM affiliate_partners WHERE id = NEW.affiliate_partner_id;
  _tons := COALESCE(NEW.quantity, 0);
  IF COALESCE(_rate, 0) <= 0 OR _tons <= 0 THEN RETURN NEW; END IF;
  INSERT INTO affiliate_commissions (partner_id, lead_id, description, amount, tons, rate_per_ton, commission_date, status, notes)
  VALUES (NEW.affiliate_partner_id, NEW.id,
    'Dostawa ' || COALESCE(NEW.lead_number, '') || ' ' || COALESCE(NEW.invoice_company, NEW.name),
    round(_tons * _rate, 2), _tons, _rate, (NEW.delivered_at AT TIME ZONE 'Europe/Warsaw')::date,
    'nierozliczona', 'Naliczono automatycznie po dostawie');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_affiliate_commission ON public.leads;
CREATE TRIGGER trg_auto_affiliate_commission AFTER UPDATE OF delivered_at ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.auto_affiliate_commission();