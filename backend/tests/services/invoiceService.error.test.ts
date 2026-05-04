import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { AuditLogRepository } from '@/repositories/auditLogRepository';
import { AuditLogService } from '@/services/auditLogService';
import { InvoiceService } from '@/services/invoiceService';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '@/errors/AppError';

let invoiceService: InvoiceService;

beforeEach(() => {
  const invoiceRepo = new InvoiceRepository(prisma);
  const auditRepo = new AuditLogRepository(prisma);
  const auditService = new AuditLogService(auditRepo);
  invoiceService = new InvoiceService(invoiceRepo, auditService, prisma);
});

const base = {
  invoice_number: 'INV-001',
  vendor_id: 'V-1',
  invoice_amount: 1000,
  purchase_order_amount: 1000,
  due_date: '2026-06-30',
};

describe('create errors', () => {
  it('rejects duplicate (vendor_id, invoice_number) with ConflictError (409)', async () => {
    await invoiceService.create(base, 'actor-1');
    await expect(invoiceService.create(base, 'actor-1')).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('approve errors', () => {
  it('throws NotFoundError on missing id', async () => {
    await expect(invoiceService.approve('nonexistent', 'approver-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws UnprocessableError on mismatch (422)', async () => {
    const inv = await invoiceService.create(
      { ...base, purchase_order_amount: 999 },
      'actor-1',
    );
    await expect(invoiceService.approve(inv.id, 'approver-1')).rejects.toBeInstanceOf(
      UnprocessableError,
    );
  });

  it('throws ConflictError on already approved (409)', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.approve(inv.id, 'approver-1');
    await expect(invoiceService.approve(inv.id, 'approver-2')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('throws ConflictError on rejected', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.reject(inv.id, { rejection_reason: 'r' }, 'actor-1');
    await expect(invoiceService.approve(inv.id, 'approver-1')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe('reject errors', () => {
  it('throws NotFoundError on missing id', async () => {
    await expect(
      invoiceService.reject('nonexistent', { rejection_reason: 'r' }, 'actor-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ConflictError on approved', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.approve(inv.id, 'approver-1');
    await expect(
      invoiceService.reject(inv.id, { rejection_reason: 'r' }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError on already rejected (no double reject)', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.reject(inv.id, { rejection_reason: 'r' }, 'actor-1');
    await expect(
      invoiceService.reject(inv.id, { rejection_reason: 'r2' }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('resubmit errors', () => {
  it('throws ConflictError when status=pending', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await expect(
      invoiceService.resubmit(inv.id, { invoice_amount: 2000 }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when status=mismatch', async () => {
    const inv = await invoiceService.create(
      { ...base, purchase_order_amount: 999 },
      'actor-1',
    );
    await expect(
      invoiceService.resubmit(inv.id, { invoice_amount: 999 }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when status=approved', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.approve(inv.id, 'approver-1');
    await expect(
      invoiceService.resubmit(inv.id, { invoice_amount: 100 }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError on missing id', async () => {
    await expect(
      invoiceService.resubmit('nonexistent', { invoice_amount: 100 }, 'actor-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('softDelete errors', () => {
  it('throws ConflictError when status=approved', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.approve(inv.id, 'approver-1');
    await expect(invoiceService.softDelete(inv.id, 'actor-1')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('throws NotFoundError on missing id', async () => {
    await expect(invoiceService.softDelete('nonexistent', 'actor-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError on already deleted id', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.softDelete(inv.id, 'actor-1');
    await expect(invoiceService.softDelete(inv.id, 'actor-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('getById errors', () => {
  it('throws NotFoundError on missing id', async () => {
    await expect(invoiceService.getById('nonexistent')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError on soft-deleted id', async () => {
    const inv = await invoiceService.create(base, 'actor-1');
    await invoiceService.softDelete(inv.id, 'actor-1');
    await expect(invoiceService.getById(inv.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
