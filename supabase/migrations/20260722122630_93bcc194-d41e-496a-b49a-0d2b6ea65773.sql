
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS payment_amount_gross numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_settled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_payment_status_idx ON public.leads(payment_status);
