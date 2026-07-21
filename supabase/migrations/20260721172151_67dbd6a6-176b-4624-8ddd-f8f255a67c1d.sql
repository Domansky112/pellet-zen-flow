
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS invoice_company text,
  ADD COLUMN IF NOT EXISTS invoice_nip text,
  ADD COLUMN IF NOT EXISTS invoice_address text;
