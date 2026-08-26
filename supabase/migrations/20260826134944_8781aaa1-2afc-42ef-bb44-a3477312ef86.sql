ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS tons numeric,
  ADD COLUMN IF NOT EXISTS rate_per_ton numeric;