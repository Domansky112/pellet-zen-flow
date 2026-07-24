
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'inne',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read expenses"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

CREATE POLICY "Staff can insert expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
    AND created_by = auth.uid()
  );

CREATE POLICY "Owner or admin can update expenses"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE POLICY "Owner or admin can delete expenses"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX expenses_expense_date_idx ON public.expenses (expense_date DESC);
