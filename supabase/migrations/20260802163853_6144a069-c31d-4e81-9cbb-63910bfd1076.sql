CREATE TABLE public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'inne',
  identifier text,
  purchase_value numeric,
  purchase_date date,
  next_service_date date,
  status text NOT NULL DEFAULT 'sprawny',
  notes text,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO authenticated;
GRANT ALL ON public.fixed_assets TO service_role;

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_fixed_assets" ON public.fixed_assets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'transport')
    OR public.has_role(auth.uid(),'logistyk')
  );

CREATE POLICY "admin_manage_fixed_assets" ON public.fixed_assets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_fixed_assets_updated_at
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expenses ADD COLUMN fixed_asset_id uuid REFERENCES public.fixed_assets(id) ON DELETE SET NULL;
CREATE INDEX idx_expenses_fixed_asset ON public.expenses(fixed_asset_id);