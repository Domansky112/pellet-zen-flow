
ALTER TABLE public.transports
  ADD COLUMN IF NOT EXISTS telegram_t7_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_t4_sent_at TIMESTAMPTZ;

-- Drop legacy generic column if it exists (superseded by t7/t4)
-- keep it for backward compat; do not drop.
