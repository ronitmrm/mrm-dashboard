CREATE OR REPLACE FUNCTION identity.audit_user_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.banned IS DISTINCT FROM NEW.banned THEN
    INSERT INTO audit.events (
      event_type, target_schema, target_table, target_id,
      before_state, after_state, metadata,
      source_system, source_table, source_id
    ) VALUES (
      'access.user.status_changed', 'identity', 'users', NEW.id,
      jsonb_build_object('banned', OLD.banned),
      jsonb_build_object('banned', NEW.banned),
      jsonb_build_object('attribution', 'pending'),
      'mrm-dashboard', 'identity_user_trigger', gen_random_uuid()::text
    );
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit.events (
      event_type, target_schema, target_table, target_id,
      before_state, after_state, metadata,
      source_system, source_table, source_id
    ) VALUES (
      'access.user.role_changed', 'identity', 'users', NEW.id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role),
      jsonb_build_object('attribution', 'pending'),
      'mrm-dashboard', 'identity_user_trigger', gen_random_uuid()::text
    );
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS audit_user_access_change ON identity.users;
CREATE TRIGGER audit_user_access_change
AFTER UPDATE OF banned, role ON identity.users
FOR EACH ROW
EXECUTE FUNCTION identity.audit_user_access_change();
