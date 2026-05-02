import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  // INSERT is allowed (the triggers block UPDATE/DELETE only).
  const ins = await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, entity_label, actor_name)
     VALUES (NULL, 'system', 'tamper_test', 'audit_logs', 0, 'tamper-evident verification', 'system')
     RETURNING id;`,
  );
  const id = ins.rows[0].id as number;
  console.log("Inserted test row id =", id);

  let updateBlocked = false;
  let deleteBlocked = false;
  try {
    await pool.query("UPDATE audit_logs SET actor_role = 'tampered' WHERE id = $1;", [id]);
  } catch (e) {
    updateBlocked = true;
    console.log("UPDATE BLOCKED:", (e as Error).message);
  }
  try {
    await pool.query("DELETE FROM audit_logs WHERE id = $1;", [id]);
  } catch (e) {
    deleteBlocked = true;
    console.log("DELETE BLOCKED:", (e as Error).message);
  }
  if (!updateBlocked) console.log("FAIL: UPDATE was not blocked");
  if (!deleteBlocked) console.log("FAIL: DELETE was not blocked");
  if (updateBlocked && deleteBlocked) console.log("OK: append-only enforcement verified");
} finally {
  await pool.end();
}
