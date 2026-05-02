import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(
    `CREATE OR REPLACE FUNCTION audit_logs_prevent_modify() RETURNS trigger AS $$
     BEGIN
       RAISE EXCEPTION 'audit_logs is append-only; % is not permitted', TG_OP;
     END;
     $$ LANGUAGE plpgsql;`,
  );
  await pool.query("DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;");
  await pool.query(
    "CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_modify();",
  );
  await pool.query("DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;");
  await pool.query(
    "CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_modify();",
  );
  const r = await pool.query(
    "SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal;",
  );
  console.log("Triggers installed:", r.rows.map((x) => x.tgname).join(","));
  try {
    await pool.query("UPDATE audit_logs SET actor_role = actor_role WHERE id = 1;");
    console.log("UPDATE NOT BLOCKED");
  } catch (e) {
    console.log("UPDATE BLOCKED:", (e as Error).message);
  }
  try {
    await pool.query("DELETE FROM audit_logs WHERE id = -1;");
    console.log("DELETE NOT BLOCKED");
  } catch (e) {
    console.log("DELETE BLOCKED:", (e as Error).message);
  }
} finally {
  await pool.end();
}
