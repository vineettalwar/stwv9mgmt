import { db, auditLogsTable } from "@workspace/db";

export interface LogAuditParams {
  actorId: number | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number;
  entityLabel?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  projectId?: number | null;
}

// Structural type satisfied by both NodePgDatabase and PgTransaction
type AuditClient = Pick<typeof db, "insert">;

function buildAuditValues(params: LogAuditParams) {
  return {
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    entityLabel: params.entityLabel ?? null,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    projectId: params.projectId ?? null,
  };
}

/**
 * Fail-closed: use inside a db.transaction() so audit and mutation succeed/fail atomically.
 * Errors propagate to the caller — the transaction will roll back on failure.
 */
export async function logAuditTx(client: AuditClient, params: LogAuditParams): Promise<void> {
  await client.insert(auditLogsTable).values(buildAuditValues(params));
}

/**
 * Best-effort standalone audit for routes that do not use a transaction.
 * Failures are surfaced in server logs but never crash the request.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await db.insert(auditLogsTable).values(buildAuditValues(params));
  } catch (err) {
    console.error("[auditLogger] FAILED to write audit record:", err, params);
  }
}
