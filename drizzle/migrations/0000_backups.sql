CREATE TABLE public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'manual',
  size_bytes bigint,
  tables_count integer,
  data jsonb NOT NULL
);
GRANT SELECT, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read backups" ON public.backups FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete backups" ON public.backups FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.create_backup(_kind text DEFAULT 'manual')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; snap jsonb := '{}'::jsonb; part jsonb; cnt int := 0; new_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Brak uprawnień administratora';
  END IF;
  FOR r IN SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'backups'
           ORDER BY table_name LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM public.%I t', r.table_name) INTO part;
    snap := snap || jsonb_build_object(r.table_name, part);
    cnt := cnt + 1;
  END LOOP;
  INSERT INTO public.backups(kind, data, tables_count, size_bytes)
  VALUES (CASE WHEN _kind = 'weekly' THEN 'weekly' ELSE 'manual' END,
          jsonb_build_object('created_at', now(), 'tables', snap), cnt, octet_length(snap::text))
  RETURNING id INTO new_id;
  -- keep last 12 backups
  DELETE FROM public.backups WHERE id IN (
    SELECT id FROM public.backups ORDER BY created_at DESC OFFSET 12);
  RETURN new_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_backup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_backup(text) TO authenticated;