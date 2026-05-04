import type { Invoice, Prisma, PrismaClient } from '@prisma/client';
import type { InvoiceStatus } from '@/lib/constants';

export type TxClient = PrismaClient | Prisma.TransactionClient;

export type InvoiceCreateData = {
  invoice_number: string;
  vendor_id: string;
  invoice_amount: number;
  purchase_order_amount: number;
  due_date: Date;
  status: InvoiceStatus;
};

export type InvoiceUpdateData = {
  invoice_amount: number;
  purchase_order_amount: number;
  due_date: Date;
  status: InvoiceStatus;
  approver_id: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  deleted_at: Date | null;
};

export class InvoiceRepository {
  constructor(private prisma: PrismaClient) {}

  private db(tx?: TxClient): TxClient {
    return tx ?? this.prisma;
  }

  async create(data: InvoiceCreateData, tx?: TxClient): Promise<Invoice> {
    return this.db(tx).invoice.create({ data });
  }

  async findById(
    id: string,
    options?: { includeDeleted?: boolean },
    tx?: TxClient,
  ): Promise<Invoice | null> {
    return this.db(tx).invoice.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deleted_at: null }),
      },
    });
  }

  async findByVendorAndNumber(
    vendorId: string,
    invoiceNumber: string,
    tx?: TxClient,
  ): Promise<Invoice | null> {
    return this.db(tx).invoice.findFirst({
      where: {
        vendor_id: vendorId,
        invoice_number: invoiceNumber,
        deleted_at: null,
      },
    });
  }

  async list(
    filter: { status?: InvoiceStatus },
    paging: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<{ items: Invoice[]; total: number }> {
    const where = {
      deleted_at: null,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db(tx).invoice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: paging.limit,
        skip: paging.offset,
      }),
      this.db(tx).invoice.count({ where }),
    ]);
    return { items, total };
  }

  async update(id: string, data: Partial<InvoiceUpdateData>, tx?: TxClient): Promise<Invoice> {
    return this.db(tx).invoice.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: TxClient): Promise<void> {
    await this.db(tx).invoice.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
}
