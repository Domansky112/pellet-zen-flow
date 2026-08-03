ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 23;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_vat_rate_allowed') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_vat_rate_allowed CHECK (vat_rate IN (0, 8, 23));
  END IF;
END $$;