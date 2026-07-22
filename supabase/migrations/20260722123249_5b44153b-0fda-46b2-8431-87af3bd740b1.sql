
-- 1) Znaczniki B2B / Kurnik + cykl na leadach
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_b2b_kurnik boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cycle_days integer;

-- 2) Tabela przypomnień wstawień
CREATE TABLE IF NOT EXISTS public.poultry_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  farm_name text NOT NULL,
  tonnage numeric,
  assigned_to uuid,
  reminder_date date NOT NULL,
  status text NOT NULL DEFAULT 'do_zadzwonienia',
  notes text,
  new_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poultry_reminders_status_check CHECK (status IN
    ('do_zadzwonienia','w_trakcie','zatwierdzone','odrzucone'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poultry_reminders TO authenticated;
GRANT ALL ON public.poultry_reminders TO service_role;

ALTER TABLE public.poultry_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poultry_reminders_read_staff"
ON public.poultry_reminders FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'logistyk') OR public.has_role(auth.uid(),'transport')
);
CREATE POLICY "poultry_reminders_write_staff"
ON public.poultry_reminders FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'logistyk')
)
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'logistyk')
);

CREATE INDEX IF NOT EXISTS poultry_reminders_date_idx ON public.poultry_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS poultry_reminders_lead_idx ON public.poultry_reminders(lead_id);

DROP TRIGGER IF EXISTS trg_poultry_reminders_updated ON public.poultry_reminders;
CREATE TRIGGER trg_poultry_reminders_updated
BEFORE UPDATE ON public.poultry_reminders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Trigger: automatyczne utworzenie przypomnienia po oznaczeniu dostawy jako wydana
CREATE OR REPLACE FUNCTION public.create_poultry_reminder_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days integer;
  _base date;
  _farm text;
BEGIN
  IF NEW.is_b2b_kurnik = true
     AND NEW.reservation_status = 'wydany'
     AND (OLD.reservation_status IS DISTINCT FROM 'wydany')
  THEN
    _days := COALESCE(NEW.cycle_days, 30);
    _base := COALESCE(NEW.delivered_at::date, CURRENT_DATE);
    _farm := COALESCE(NEW.invoice_company, NEW.name, 'Ferma');

    -- idempotentnie: nie duplikuj przypomnień dla tego leada z tą samą datą
    IF NOT EXISTS (
      SELECT 1 FROM public.poultry_reminders
      WHERE lead_id = NEW.id AND reminder_date = _base + _days
    ) THEN
      INSERT INTO public.poultry_reminders
        (lead_id, farm_name, tonnage, assigned_to, reminder_date, status)
      VALUES
        (NEW.id, _farm, NEW.quantity, NEW.assigned_to, _base + _days, 'do_zadzwonienia');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_leads_poultry_reminder ON public.leads;
CREATE TRIGGER trg_leads_poultry_reminder
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.create_poultry_reminder_on_delivery();
