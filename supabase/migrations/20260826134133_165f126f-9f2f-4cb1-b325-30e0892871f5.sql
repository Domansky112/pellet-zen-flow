CREATE TABLE public.affiliate_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  email text,
  nip text,
  bank_account text,
  notes text,
  status text NOT NULL DEFAULT 'aktywny',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_partners TO authenticated;
GRANT ALL ON public.affiliate_partners TO service_role;
ALTER TABLE public.affiliate_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_partners_admin_all" ON public.affiliate_partners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.affiliate_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'przelew',
  notes text,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_settlements TO authenticated;
GRANT ALL ON public.affiliate_settlements TO service_role;
ALTER TABLE public.affiliate_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_settlements_admin_all" ON public.affiliate_settlements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  commission_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'nierozliczona',
  settlement_id uuid REFERENCES public.affiliate_settlements(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_affiliate_commissions_partner ON public.affiliate_commissions(partner_id);
CREATE INDEX idx_affiliate_commissions_status ON public.affiliate_commissions(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_commissions TO authenticated;
GRANT ALL ON public.affiliate_commissions TO service_role;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_commissions_admin_all" ON public.affiliate_commissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_affiliate_partners_updated BEFORE UPDATE ON public.affiliate_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_affiliate_settlements_updated BEFORE UPDATE ON public.affiliate_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_affiliate_commissions_updated BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Zbiorcze rozliczenie prowizji: oznacza pozycje jako wypłacone i tworzy koszt
CREATE OR REPLACE FUNCTION public.settle_affiliate_commissions(
  _partner_id uuid,
  _commission_ids uuid[],
  _paid_at date DEFAULT CURRENT_DATE,
  _method text DEFAULT 'przelew',
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _total numeric := 0;
  _cnt int := 0;
  _partner text;
  _expense_id uuid;
  _settlement_id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Tylko administrator' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO _partner FROM public.affiliate_partners WHERE id = _partner_id;
  IF _partner IS NULL THEN
    RAISE EXCEPTION 'Partner nie istnieje' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO _total, _cnt
    FROM public.affiliate_commissions
   WHERE partner_id = _partner_id
     AND status = 'nierozliczona'
     AND (_commission_ids IS NULL OR id = ANY(_commission_ids));

  IF _cnt = 0 THEN
    RAISE EXCEPTION 'Brak nierozliczonych pozycji do wypłaty' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.expenses(description, amount, expense_date, category, vat_rate, notes, created_by)
  VALUES ('Prowizja afiliacyjna — ' || _partner, _total, _paid_at, 'prowizje', 0,
          COALESCE(_notes, '') || ' (pozycji: ' || _cnt || ')', _uid)
  RETURNING id INTO _expense_id;

  INSERT INTO public.affiliate_settlements(partner_id, total_amount, paid_at, method, notes, expense_id, created_by)
  VALUES (_partner_id, _total, _paid_at, _method, _notes, _expense_id, _uid)
  RETURNING id INTO _settlement_id;

  UPDATE public.affiliate_commissions
     SET status = 'wyplacona', settlement_id = _settlement_id
   WHERE partner_id = _partner_id
     AND status = 'nierozliczona'
     AND (_commission_ids IS NULL OR id = ANY(_commission_ids));

  INSERT INTO public.audit_log(entity_type, entity_id, action, actor_id, details)
  VALUES ('affiliate', _partner_id, 'settlement', _uid,
    jsonb_build_object('settlement_id', _settlement_id, 'total', _total, 'count', _cnt, 'expense_id', _expense_id));

  RETURN jsonb_build_object('ok', true, 'settlement_id', _settlement_id, 'total', _total, 'count', _cnt);
END; $$;