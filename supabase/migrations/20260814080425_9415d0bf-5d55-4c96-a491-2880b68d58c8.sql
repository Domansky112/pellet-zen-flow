CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  position text,
  daily_rate numeric NOT NULL DEFAULT 0,
  pallet_rate numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aktywny',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees admin all" ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employee_work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  entry_type text NOT NULL DEFAULT 'dniowka',
  pallets_count numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'do_wyplaty',
  notes text,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_work_logs_type_chk CHECK (entry_type IN ('dniowka','akord','wolne','nieobecnosc')),
  CONSTRAINT employee_work_logs_status_chk CHECK (status IN ('do_wyplaty','wyplacone')),
  CONSTRAINT employee_work_logs_unique_day UNIQUE (employee_id, work_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_work_logs TO authenticated;
GRANT ALL ON public.employee_work_logs TO service_role;
ALTER TABLE public.employee_work_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_work_logs admin all" ON public.employee_work_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_employee_work_logs_updated BEFORE UPDATE ON public.employee_work_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_employee_work_logs_emp_date ON public.employee_work_logs(employee_id, work_date);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;