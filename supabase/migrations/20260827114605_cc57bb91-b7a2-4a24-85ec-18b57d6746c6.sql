CREATE TABLE public.lead_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  batch_no integer NOT NULL,
  tons numeric NOT NULL CHECK (tons > 0),
  status text NOT NULL DEFAULT 'oczekuje',
  transport_id uuid REFERENCES public.transports(id) ON DELETE SET NULL,
  notes text,
  delivered_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, batch_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_batches TO authenticated;
GRANT ALL ON public.lead_batches TO service_role;

ALTER TABLE public.lead_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read lead batches" ON public.lead_batches
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'warehouse') OR public.has_role(auth.uid(), 'transport')
    OR public.has_role(auth.uid(), 'logistyk')
  );

CREATE POLICY "Staff can write lead batches" ON public.lead_batches
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'warehouse') OR public.has_role(auth.uid(), 'transport')
    OR public.has_role(auth.uid(), 'logistyk')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'warehouse') OR public.has_role(auth.uid(), 'transport')
    OR public.has_role(auth.uid(), 'logistyk')
  );

CREATE TRIGGER update_lead_batches_updated_at
  BEFORE UPDATE ON public.lead_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_lead_batches_lead ON public.lead_batches(lead_id);
CREATE INDEX idx_lead_batches_transport ON public.lead_batches(transport_id);

ALTER TABLE public.transport_items ADD COLUMN batch_id uuid REFERENCES public.lead_batches(id) ON DELETE SET NULL;
ALTER TABLE public.transport_draft_items ADD COLUMN batch_id uuid REFERENCES public.lead_batches(id) ON DELETE SET NULL;