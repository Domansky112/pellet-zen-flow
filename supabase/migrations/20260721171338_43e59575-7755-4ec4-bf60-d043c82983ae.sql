
-- 1. Leads: nowe kolumny
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS reservation_status text NOT NULL DEFAULT 'brak'
    CHECK (reservation_status IN ('brak','zarezerwowany','wydany','zwolniony'));

CREATE INDEX IF NOT EXISTS leads_reservation_status_idx
  ON public.leads(reservation_status);

-- 2. Notatki
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read notes" ON public.lead_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "Staff insert notes" ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales'))
    AND author_id = auth.uid()
  );
CREATE POLICY "Author or admin update notes" ON public.lead_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Author or admin delete notes" ON public.lead_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.mark_note_edited()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited := true;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_lead_notes_edit BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.mark_note_edited();

-- 3. Szablony ofert
CREATE TABLE IF NOT EXISTS public.offer_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  product text,
  subject text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_templates TO authenticated;
GRANT ALL ON public.offer_templates TO service_role;

ALTER TABLE public.offer_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read templates" ON public.offer_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "Admin write templates" ON public.offer_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.offer_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.offer_templates (name, product, subject, body) VALUES
  ('Pellet paleta — oferta wstępna', 'pellet_paleta',
   'Oferta pellet paleta — Słoneczny Pellet',
   E'Dzień dobry {{name}},\n\ndziękujemy za zainteresowanie naszym pelletem.\nOferujemy pellet w paletach — {{quantity}} t.\nCena obowiązująca dziś: [uzupełnić].\nDostawa z Witoroży 21-570.\n\nPozdrawiam,\nZespół Słoneczny Pellet'),
  ('Pellet big-bag — oferta', 'pellet_bigbag',
   'Oferta pellet big-bag — Słoneczny Pellet',
   E'Dzień dobry {{name}},\n\ndziękujemy za zapytanie.\nProponujemy pellet w big-bagach — {{quantity}} t.\nCena: [uzupełnić] zł/t netto.\n\nPozdrawiam,\nZespół Słoneczny Pellet'),
  ('Wspólny transport — potwierdzenie zapisu', null,
   'Potwierdzenie zapisu na wspólny transport',
   E'Dzień dobry {{name}},\n\npotwierdzamy zapis na wspólny transport ({{quantity}} t).\nDamy znać, gdy skonsolidujemy trasę — koszt frachtu podzielimy proporcjonalnie.\n\nPozdrawiam,\nZespół Słoneczny Pellet')
ON CONFLICT DO NOTHING;

-- 4. Transakcyjna rezerwacja stanu magazynowego dla leada
CREATE OR REPLACE FUNCTION public.reserve_stock_for_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _physical numeric := 0;
  _reserved numeric := 0;
  _available numeric := 0;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % nie istnieje', _lead_id;
  END IF;
  IF _lead.product IS NULL OR _lead.quantity IS NULL OR _lead.quantity <= 0 THEN
    RAISE EXCEPTION 'Lead nie ma określonego produktu / ilości';
  END IF;
  IF _lead.reservation_status = 'zarezerwowany' THEN
    RETURN; -- idempotentne
  END IF;

  -- Blokada wszystkich zdarzeń dla produktu (serializuje równoległe rezerwacje)
  PERFORM 1 FROM public.stock_events
    WHERE product = _lead.product
    FOR UPDATE;

  SELECT
    COALESCE(SUM(CASE WHEN txn_type IN ('przyjecie','korekta') THEN quantity
                      WHEN txn_type = 'wydanie' THEN -quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN txn_type = 'rezerwacja' THEN quantity
                      WHEN txn_type = 'zwolnienie_rez' THEN -quantity ELSE 0 END), 0)
  INTO _physical, _reserved
  FROM public.stock_events WHERE product = _lead.product;

  _available := _physical - _reserved;
  IF _lead.quantity > _available THEN
    RAISE EXCEPTION 'Za mało dostępnego stanu: % t (dostępne %)', _lead.quantity, _available;
  END IF;

  INSERT INTO public.stock_events(product, txn_type, quantity, lead_id, reference, note, created_by)
  VALUES (_lead.product, 'rezerwacja', _lead.quantity, _lead.id,
          'LEAD:' || LEFT(_lead.id::text, 8),
          'Auto-rezerwacja przy zapisie leada',
          auth.uid());

  UPDATE public.leads SET reservation_status = 'zarezerwowany' WHERE id = _lead.id;
END; $$;

REVOKE ALL ON FUNCTION public.reserve_stock_for_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_stock_for_lead(uuid) TO authenticated, service_role;

-- 5. Zwolnienie rezerwacji → wydanie towaru
CREATE OR REPLACE FUNCTION public.release_reservation_as_wydanie(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _net_reserved numeric := 0;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % nie istnieje', _lead_id;
  END IF;
  IF _lead.product IS NULL THEN
    RAISE EXCEPTION 'Lead nie ma produktu';
  END IF;

  PERFORM 1 FROM public.stock_events
    WHERE product = _lead.product FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN txn_type='rezerwacja' THEN quantity
                            WHEN txn_type='zwolnienie_rez' THEN -quantity ELSE 0 END),0)
    INTO _net_reserved
    FROM public.stock_events
    WHERE lead_id = _lead.id AND product = _lead.product;

  IF _net_reserved <= 0 THEN
    RAISE EXCEPTION 'Brak aktywnej rezerwacji dla tego leada';
  END IF;

  INSERT INTO public.stock_events(product, txn_type, quantity, lead_id, reference, note, created_by)
  VALUES
    (_lead.product, 'zwolnienie_rez', _net_reserved, _lead.id,
     'LEAD:' || LEFT(_lead.id::text, 8), 'Wydanie towaru — zwolnienie rezerwacji', auth.uid()),
    (_lead.product, 'wydanie', _net_reserved, _lead.id,
     'LEAD:' || LEFT(_lead.id::text, 8), 'Wydanie towaru z rezerwacji', auth.uid());

  UPDATE public.leads SET reservation_status = 'wydany', status = 'wygrany' WHERE id = _lead.id;
END; $$;

REVOKE ALL ON FUNCTION public.release_reservation_as_wydanie(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_reservation_as_wydanie(uuid) TO authenticated, service_role;
