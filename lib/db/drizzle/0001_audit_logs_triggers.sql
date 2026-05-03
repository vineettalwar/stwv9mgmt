-- Tamper-evident: block UPDATE and DELETE on audit_logs so the trail is
-- append-only at the database layer, not just the application layer.
CREATE OR REPLACE FUNCTION audit_logs_prevent_modify() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_modify();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_no_delete ON "audit_logs";
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_modify();
