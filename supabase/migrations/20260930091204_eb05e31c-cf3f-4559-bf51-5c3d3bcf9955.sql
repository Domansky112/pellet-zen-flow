CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _old jsonb; _new jsonb; _diff jsonb := '{}'::jsonb; _k text; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD); _id := (_old->>'id')::uuid;
    INSERT INTO audit_log(actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, _id, jsonb_build_object('old', _old));
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW); _id := (_new->>'id')::uuid;
    INSERT INTO audit_log(actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'insert', TG_TABLE_NAME, _id, jsonb_build_object('new', _new));
    RETURN NEW;
  ELSE
    _old := to_jsonb(OLD); _new := to_jsonb(NEW); _id := (_new->>'id')::uuid;
    FOR _k IN SELECT jsonb_object_keys(_new) LOOP
      IF _k NOT IN ('updated_at') AND (_new->_k) IS DISTINCT FROM (_old->_k) THEN
        _diff := _diff || jsonb_build_object(_k, jsonb_build_object('from', _old->_k, 'to', _new->_k));
      END IF;
    END LOOP;
    IF _diff <> '{}'::jsonb THEN
      INSERT INTO audit_log(actor_id, action, entity_type, entity_id, details)
      VALUES (auth.uid(), 'update', TG_TABLE_NAME, _id, jsonb_build_object('changes', _diff, 'label', COALESCE(_new->>'lead_number', _new->>'name', _new->>'description')));
    END IF;
    RETURN NEW;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','transports','transport_items','stock_events','stock_lots','lead_notes','lead_batches','expenses','employees','employee_work_logs','fixed_assets','affiliate_commissions','offer_templates','lead_statuses','pickup_locations','system_settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log(actor_id, created_at DESC);