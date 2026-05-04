import type { InvoiceStatus } from './invoice';

export type AuditAction = 'create' | 'approve' | 'reject' | 'resubmit' | 'delete';

export type AuditLog = {
  id: string;
  action: AuditAction;
  actor_id: string;
  invoice_id: string;
  before_status: InvoiceStatus | null;
  after_status: InvoiceStatus | null;
  note: string | null;
  created_at: string;
};
