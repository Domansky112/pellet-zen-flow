CREATE TABLE public.correction_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correction_people TO authenticated;
GRANT ALL ON public.correction_people TO service_role;
ALTER TABLE public.correction_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage correction people" ON public.correction_people FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.correction_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_id uuid NOT NULL REFERENCES public.correction_people(id) ON DELETE RESTRICT,
  debtor_id uuid NOT NULL REFERENCES public.correction_people(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  entry_date date NOT NULL DEFAULT current_date,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'otwarte' CHECK (status IN ('otwarte','rozliczone')),
  settled_at date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (creditor_id <> debtor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correction_entries TO authenticated;
GRANT ALL ON public.correction_entries TO service_role;
ALTER TABLE public.correction_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage correction entries" ON public.correction_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_correction_people_updated BEFORE UPDATE ON public.correction_people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_correction_entries_updated BEFORE UPDATE ON public.correction_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();