import type { AuditLog } from '@prisma/client';
import type { AuditLogCreateData, AuditLogRepository } from '@/repositories/auditLogRepository';
import type { TxClient } from '@/repositories/invoiceRepository';

export class AuditLogService {
  constructor(private auditRepo: AuditLogRepository) {}

  async record(input: AuditLogCreateData, tx?: TxClient): Promise<void> {
    await this.auditRepo.create(input, tx);
  }

  async list(query: { invoice_id?: string; limit: number }): Promise<AuditLog[]> {
    return this.auditRepo.list(
      { invoice_id: query.invoice_id },
      { limit: query.limit },
    );
  }
}
