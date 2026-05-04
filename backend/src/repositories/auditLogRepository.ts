import type { AuditLog, PrismaClient } from '@prisma/client';
import type { AuditAction, InvoiceStatus } from '@/lib/constants';
import type { TxClient } from './invoiceRepository';

export type AuditLogCreateData = {
  action: AuditAction;
  actor_id: string;
  invoice_id: string;
  before_status: InvoiceStatus | null;
  after_status: InvoiceStatus | null;
  note: string | null;
};

export class AuditLogRepository {
  constructor(private prisma: PrismaClient) {}

  private db(tx?: TxClient): TxClient {
    return tx ?? this.prisma;
  }

  async create(data: AuditLogCreateData, tx?: TxClient): Promise<AuditLog> {
    return this.db(tx).auditLog.create({
      data: {
        action: data.action,
        actor_id: data.actor_id,
        invoice_id: data.invoice_id,
        before_status: data.before_status ?? null,
        after_status: data.after_status ?? null,
        note: data.note ?? null,
      },
    });
  }

  async list(
    filter: { invoice_id?: string },
    paging: { limit: number },
    tx?: TxClient,
  ): Promise<AuditLog[]> {
    const where = filter.invoice_id ? { invoice_id: filter.invoice_id } : {};
    return this.db(tx).auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: paging.limit,
    });
  }
}
