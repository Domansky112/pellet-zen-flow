
ALTER TABLE public.offer_templates
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms'));
