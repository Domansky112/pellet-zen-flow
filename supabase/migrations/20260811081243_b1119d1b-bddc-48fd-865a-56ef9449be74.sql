CREATE TABLE public.transport_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vehicle_class text NOT NULL DEFAULT 'duzy',
  capacity_tons numeric NOT NULL DEFAULT 24,
  scheduled_date date,
  delivery_window text,
  status text NOT NULL DEFAULT 'draft',
  transport_id uuid REFERENCES public.transports(id) ON DELETE SET NULL,
  route_km numeric,
  route_minutes integer,
  route_cost numeric,
  cost_per_km numeric,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_drafts TO authenticated;
GRANT ALL ON public.transport_drafts TO service_role;
ALTER TABLE public.transport_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transport_drafts staff read" ON public.transport_drafts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'));

CREATE POLICY "transport_drafts staff insert" ON public.transport_drafts FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk')) AND created_by = auth.uid());

CREATE POLICY "transport_drafts staff update" ON public.transport_drafts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'));

CREATE POLICY "transport_drafts staff delete" ON public.transport_drafts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'));

CREATE TRIGGER trg_transport_drafts_updated BEFORE UPDATE ON public.transport_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.transport_draft_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.transport_drafts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tons numeric NOT NULL DEFAULT 0,
  stop_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_id, lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_draft_items TO authenticated;
GRANT ALL ON public.transport_draft_items TO service_role;
ALTER TABLE public.transport_draft_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transport_draft_items staff read" ON public.transport_draft_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'));

CREATE POLICY "transport_draft_items staff insert" ON public.transport_draft_items FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'))
  AND EXISTS (SELECT 1 FROM public.transport_drafts d WHERE d.id = draft_id AND d.status = 'draft'));

CREATE POLICY "transport_draft_items staff update" ON public.transport_draft_items FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'));

CREATE POLICY "transport_draft_items staff delete" ON public.transport_draft_items FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'logistyk'));

CREATE INDEX idx_transport_draft_items_draft ON public.transport_draft_items(draft_id);
CREATE INDEX idx_transport_drafts_status ON public.transport_drafts(status);