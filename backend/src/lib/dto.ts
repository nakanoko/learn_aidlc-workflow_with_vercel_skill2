import type { AuditLog, Invoice } from '@prisma/client';

/** Strip deleted_at and format dates for API output. */
export function toInvoiceDTO(i: Invoice) {
  const {
    deleted_at: _omit,
    due_date,
    approved_at,
    rejected_at,
    created_at,
    updated_at,
    ...rest
  } = i;
  void _omit;
  return {
    ...rest,
    due_date: due_date.toISOString().slice(0, 10),
    approved_at: approved_at ? approved_at.toISOString() : null,
    rejected_at: rejected_at ? rejected_at.toISOString() : null,
    created_at: created_at.toISOString(),
    updated_at: updated_at.toISOString(),
  };
}

export function toAuditLogDTO(a: AuditLog) {
  return {
    id: a.id,
    action: a.action,
    actor_id: a.actor_id,
    invoice_id: a.invoice_id,
    before_status: a.before_status,
    after_status: a.after_status,
    note: a.note,
    created_at: a.created_at.toISOString(),
  };
}
