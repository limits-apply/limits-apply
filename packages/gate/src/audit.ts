export type AuditEvent = "update" | "activate" | "rollback" | "noop" | "failure";

export interface AuditEntry {
  event: AuditEvent;
  at: string;
  oldVerdict: string | null;
  newVerdict: string | null;
  profileHash: string;
  reason?: string;
}

export function auditEntry(event: AuditEvent, values: Omit<AuditEntry, "event">): AuditEntry {
  return { event, ...values };
}

export function isNoop(previous: string | null, next: string): boolean {
  return previous === next;
}
