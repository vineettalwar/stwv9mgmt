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

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityLabel: params.entityLabel ?? null,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      projectId: params.projectId ?? null,
    });
  } catch {
    // Audit logging is non-fatal — never crash the request
  }
}
