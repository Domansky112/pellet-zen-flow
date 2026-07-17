-- Roles enum & user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'warehouse', 'transport');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Auto-assign admin to specific email, otherwise sales
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email = 'timexx99@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'sales')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CRM: leads ============
CREATE TYPE public.lead_source AS ENUM ('www', 'email', 'telefon', 'b2b', 'inne');
CREATE TYPE public.lead_status AS ENUM ('nowy', 'w_kontakcie', 'oferta', 'wygrany', 'przegrany');
CREATE TYPE public.product_type AS ENUM ('pellet_paleta', 'pellet_bigbag', 'brykiet', 'inne');

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  city text,
  postal_code text,
  source lead_source NOT NULL DEFAULT 'www',
  status lead_status NOT NULL DEFAULT 'nowy',
  product product_type,
  quantity numeric,
  notes text,
  priority int NOT NULL DEFAULT 3,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read leads" ON public.leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "Staff write leads" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Warehouse ============
CREATE TYPE public.stock_txn_type AS ENUM ('przyjecie', 'wydanie', 'rezerwacja', 'zwolnienie_rez', 'korekta');

CREATE TABLE public.stock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product product_type NOT NULL,
  txn_type stock_txn_type NOT NULL,
  quantity numeric NOT NULL,
  reference text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_events TO authenticated;
GRANT ALL ON public.stock_events TO service_role;
ALTER TABLE public.stock_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Warehouse read events" ON public.stock_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "Warehouse write events" ON public.stock_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));
CREATE POLICY "Admin modify events" ON public.stock_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin delete events" ON public.stock_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ Transport ============
CREATE TYPE public.transport_status AS ENUM ('planowany', 'potwierdzony', 'w_trasie', 'dostarczony', 'anulowany');

CREATE TABLE public.transports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date date NOT NULL,
  zone text,
  city text,
  postal_code text,
  driver text,
  vehicle text,
  capacity_kg numeric,
  status transport_status NOT NULL DEFAULT 'planowany',
  telegram_alert_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transports TO authenticated;
GRANT ALL ON public.transports TO service_role;
ALTER TABLE public.transports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transport read" ON public.transports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'warehouse'));
CREATE POLICY "Transport write" ON public.transports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'transport'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'transport'));
CREATE TRIGGER trg_transports_updated BEFORE UPDATE ON public.transports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.transport_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_id uuid NOT NULL REFERENCES public.transports(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  product product_type NOT NULL,
  quantity numeric NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_items TO authenticated;
GRANT ALL ON public.transport_items TO service_role;
ALTER TABLE public.transport_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transport items read" ON public.transport_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'transport') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'warehouse'));
CREATE POLICY "Transport items write" ON public.transport_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'transport'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'transport'));

-- ============ Telegram config ============
CREATE TABLE public.telegram_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE,
  label text,
  is_whitelisted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_chats TO authenticated;
GRANT ALL ON public.telegram_chats TO service_role;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin telegram" ON public.telegram_chats FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ Stock view ============
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT
  product,
  COALESCE(SUM(CASE
    WHEN txn_type = 'przyjecie' THEN quantity
    WHEN txn_type = 'wydanie' THEN -quantity
    WHEN txn_type = 'korekta' THEN quantity
    ELSE 0 END), 0) AS physical,
  COALESCE(SUM(CASE
    WHEN txn_type = 'rezerwacja' THEN quantity
    WHEN txn_type = 'zwolnienie_rez' THEN -quantity
    ELSE 0 END), 0) AS reserved
FROM public.stock_events
GROUP BY product;

GRANT SELECT ON public.stock_balance TO authenticated;