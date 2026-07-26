
CREATE TABLE public.telegram_flow_state (
  chat_id text PRIMARY KEY,
  flow text NOT NULL,
  step text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_flow_state TO service_role;
ALTER TABLE public.telegram_flow_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access" ON public.telegram_flow_state FOR ALL USING (false) WITH CHECK (false);
