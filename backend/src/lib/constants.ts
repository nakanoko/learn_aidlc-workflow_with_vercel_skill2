export const INVOICE_STATUSES = ['pending', 'approved', 'rejected', 'mismatch'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const AUDIT_ACTIONS = ['create', 'approve', 'reject', 'resubmit', 'delete'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return typeof v === 'string' && (INVOICE_STATUSES as readonly string[]).includes(v);
}
