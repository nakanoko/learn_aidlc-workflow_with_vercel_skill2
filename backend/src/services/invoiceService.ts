import type { Invoice, PrismaClient } from '@prisma/client';
import type { InvoiceRepository } from '@/repositories/invoiceRepository';
import type { AuditLogService } from './auditLogService';
import type { InvoiceStatus } from '@/lib/constants';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '@/errors/AppError';
import type {
  CreateInvoiceInput,
  ListInvoicesQuery,
  RejectInvoiceInput,
  ResubmitInvoiceInput,
} from '@/schemas/invoiceSchemas';

function toUtcDate(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T00:00:00.000Z`);
}

export class InvoiceService {
  constructor(
    private invoiceRepo: InvoiceRepository,
    private auditService: AuditLogService,
    private prisma: PrismaClient,
  ) {}

  async create(input: CreateInvoiceInput, actorId: string): Promise<Invoice> {
    const dup = await this.invoiceRepo.findByVendorAndNumber(
      input.vendor_id,
      input.invoice_number,
    );
    if (dup) {
      throw new ConflictError(
        `Invoice already exists for vendor=${input.vendor_id}, number=${input.invoice_number}`,
      );
    }

    const status: InvoiceStatus =
      input.invoice_amount === input.purchase_order_amount ? 'pending' : 'mismatch';

    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.invoiceRepo.create(
        {
          invoice_number: input.invoice_number,
          vendor_id: input.vendor_id,
          invoice_amount: input.invoice_amount,
          purchase_order_amount: input.purchase_order_amount,
          due_date: toUtcDate(input.due_date),
          status,
        },
        tx,
      );

      await this.auditService.record(
        {
          action: 'create',
          actor_id: actorId,
          invoice_id: invoice.id,
          before_status: null,
          after_status: status,
          note: null,
        },
        tx,
      );

      return invoice;
    });
  }

  async list(query: ListInvoicesQuery): Promise<{ items: Invoice[]; total: number }> {
    return this.invoiceRepo.list(
      { status: query.status },
      { limit: query.limit, offset: query.offset },
    );
  }

  async getById(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findById(id, { includeDeleted: false });
    if (!invoice) throw new NotFoundError(`Invoice not found: id=${id}`);
    return invoice;
  }

  async approve(id: string, approverId: string): Promise<Invoice> {
    const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
    if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

    switch (current.status as InvoiceStatus) {
      case 'mismatch':
        throw new UnprocessableError(
          `Cannot approve mismatched invoice (id=${id}). Status=mismatch.`,
        );
      case 'rejected':
      case 'approved':
        throw new ConflictError(
          `Cannot approve invoice in status=${current.status} (id=${id}).`,
        );
      case 'pending':
        break;
      default:
        throw new ConflictError(`Unknown status: ${current.status}`);
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.invoiceRepo.update(
        id,
        { status: 'approved', approver_id: approverId, approved_at: now },
        tx,
      );
      await this.auditService.record(
        {
          action: 'approve',
          actor_id: approverId,
          invoice_id: id,
          before_status: 'pending',
          after_status: 'approved',
          note: null,
        },
        tx,
      );
      return updated;
    });
  }

  async reject(id: string, input: RejectInvoiceInput, actorId: string): Promise<Invoice> {
    const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
    if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

    switch (current.status as InvoiceStatus) {
      case 'approved':
      case 'rejected':
        throw new ConflictError(
          `Cannot reject invoice in status=${current.status} (id=${id}).`,
        );
      case 'pending':
      case 'mismatch':
        break;
      default:
        throw new ConflictError(`Unknown status: ${current.status}`);
    }

    const now = new Date();
    const beforeStatus = current.status as InvoiceStatus;

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.invoiceRepo.update(
        id,
        {
          status: 'rejected',
          rejection_reason: input.rejection_reason,
          rejected_by: actorId,
          rejected_at: now,
        },
        tx,
      );
      await this.auditService.record(
        {
          action: 'reject',
          actor_id: actorId,
          invoice_id: id,
          before_status: beforeStatus,
          after_status: 'rejected',
          note: input.rejection_reason,
        },
        tx,
      );
      return updated;
    });
  }

  async resubmit(id: string, input: ResubmitInvoiceInput, actorId: string): Promise<Invoice> {
    const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
    if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

    if (current.status !== 'rejected') {
      throw new ConflictError(
        `Cannot resubmit invoice in status=${current.status} (id=${id}). Only rejected invoices can be resubmitted.`,
      );
    }

    const newInvoiceAmount = input.invoice_amount ?? current.invoice_amount;
    const newPoAmount = input.purchase_order_amount ?? current.purchase_order_amount;
    const newDueDate = input.due_date ? toUtcDate(input.due_date) : current.due_date;

    const nextStatus: InvoiceStatus =
      newInvoiceAmount === newPoAmount ? 'pending' : 'mismatch';

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.invoiceRepo.update(
        id,
        {
          invoice_amount: newInvoiceAmount,
          purchase_order_amount: newPoAmount,
          due_date: newDueDate,
          status: nextStatus,
        },
        tx,
      );
      await this.auditService.record(
        {
          action: 'resubmit',
          actor_id: actorId,
          invoice_id: id,
          before_status: 'rejected',
          after_status: nextStatus,
          note: null,
        },
        tx,
      );
      return updated;
    });
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
    if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

    if (current.status === 'approved') {
      throw new ConflictError(`Cannot delete approved invoice (id=${id}).`);
    }

    const beforeStatus = current.status as InvoiceStatus;

    await this.prisma.$transaction(async (tx) => {
      await this.invoiceRepo.softDelete(id, tx);
      await this.auditService.record(
        {
          action: 'delete',
          actor_id: actorId,
          invoice_id: id,
          before_status: beforeStatus,
          after_status: null,
          note: null,
        },
        tx,
      );
    });
  }
}
