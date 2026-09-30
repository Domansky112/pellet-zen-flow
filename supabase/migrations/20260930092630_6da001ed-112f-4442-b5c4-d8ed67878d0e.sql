ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- Preenche a nova coluna para leads já fechados: realizados (última marcação conhecida) e anulados (data da anulação)
UPDATE public.leads
SET status_changed_at = COALESCE(delivered_at, updated_at)
WHERE status_changed_at IS NULL
  AND (COALESCE(status_key, status::text) = 'wygrany' OR reservation_status = 'wydany');

UPDATE public.leads
SET status_changed_at = deleted_at
WHERE status_changed_at IS NULL AND deleted_at IS NOT NULL;