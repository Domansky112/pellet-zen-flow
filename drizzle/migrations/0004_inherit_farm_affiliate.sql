CREATE OR REPLACE FUNCTION public.inherit_farm_affiliate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.affiliate_partner_id IS NULL THEN
    IF NEW.parent_lead_id IS NOT NULL THEN
      SELECT affiliate_partner_id INTO NEW.affiliate_partner_id FROM public.leads WHERE id = NEW.parent_lead_id;
    END IF;
    IF NEW.affiliate_partner_id IS NULL AND NULLIF(regexp_replace(coalesce(NEW.invoice_nip,''),'\D','','g'),'') IS NOT NULL THEN
      SELECT affiliate_partner_id INTO NEW.affiliate_partner_id FROM public.leads
      WHERE affiliate_partner_id IS NOT NULL AND deleted_at IS NULL
        AND regexp_replace(coalesce(invoice_nip,''),'\D','','g') = regexp_replace(NEW.invoice_nip,'\D','','g')
      ORDER BY created_at DESC LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inherit_farm_affiliate ON public.leads;
CREATE TRIGGER trg_inherit_farm_affiliate BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.inherit_farm_affiliate();