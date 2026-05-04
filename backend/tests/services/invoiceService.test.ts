import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { AuditLogRepository } from '@/repositories/auditLogRepository';
import { AuditLogService } from '@/services/auditLogService';
import { InvoiceService } from '@/services/invoiceService';

let invoiceRepo: InvoiceRepository;
let auditRepo: AuditLogRepository;
let auditService: AuditLogService;
let invoiceService: InvoiceService;

beforeEach(() => {
  invoiceRepo = new InvoiceRepository(prisma);
  auditRepo = new AuditLogRepository(prisma);
  auditService = new AuditLogService(auditRepo);
  invoiceService = new InvoiceService(invoiceRepo, auditService, prisma);
});

const baseInput = {
  invoice_number: 'INV-001',
  vendor_id: 'V-1',
  invoice_amount: 1000,
  purchase_order_amount: 1000,
  due_date: '2026-06-30',
};

describe('InvoiceService.create', () => {
  it('creates pending invoice when amounts match', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    expect(inv.status).toBe('pending');
    const logs = await prisma.auditLog.findMany({ where: { invoice_id: inv.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('create');
    expect(logs[0].after_status).toBe('pending');
    expect(logs[0].actor_id).toBe('actor-1');
  });

  it('creates mismatch invoice when amounts differ', async () => {
    const inv = await invoiceService.create(
      { ...baseInput, invoice_amount: 1000, purchase_order_amount: 2000 },
      'actor-1',
    );
    expect(inv.status).toBe('mismatch');
    const logs = await prisma.auditLog.findMany({ where: { invoice_id: inv.id } });
    expect(logs[0].after_status).toBe('mismatch');
  });
});

describe('InvoiceService.list & getById', () => {
  it('lists invoices excluding deleted ones', async () => {
    const a = await invoiceService.create(
      { ...baseInput, invoice_number: 'A' },
      'actor-1',
    );
    await invoiceService.create({ ...baseInput, invoice_number: 'B' }, 'actor-1');
    await invoiceService.softDelete(a.id, 'actor-1');

    const { items, total } = await invoiceService.list({ limit: 50, offset: 0 });
    expect(total).toBe(1);
    expect(items.find((i) => i.id === a.id)).toBeUndefined();
  });

  it('filters by status', async () => {
    await invoiceService.create({ ...baseInput, invoice_number: 'A' }, 'actor-1');
    await invoiceService.create(
      {
        ...baseInput,
        invoice_number: 'B',
        invoice_amount: 1000,
        purchase_order_amount: 999,
      },
      'actor-1',
    );

    const pending = await invoiceService.list({ status: 'pending', limit: 50, offset: 0 });
    expect(pending.items.every((i) => i.status === 'pending')).toBe(true);

    const mismatch = await invoiceService.list({ status: 'mismatch', limit: 50, offset: 0 });
    expect(mismatch.items.every((i) => i.status === 'mismatch')).toBe(true);
  });

  it('getById returns the invoice', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    const got = await invoiceService.getById(inv.id);
    expect(got.id).toBe(inv.id);
  });
});

describe('InvoiceService.approve', () => {
  it('approves a pending invoice and writes audit log', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    const approved = await invoiceService.approve(inv.id, 'approver-1');
    expect(approved.status).toBe('approved');
    expect(approved.approver_id).toBe('approver-1');
    expect(approved.approved_at).not.toBeNull();
    const logs = await prisma.auditLog.findMany({
      where: { invoice_id: inv.id },
      orderBy: { created_at: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1].action).toBe('approve');
    expect(logs[1].before_status).toBe('pending');
    expect(logs[1].after_status).toBe('approved');
    expect(logs[1].actor_id).toBe('approver-1');
  });
});

describe('InvoiceService.reject', () => {
  it('rejects pending invoice', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    const rejected = await invoiceService.reject(
      inv.id,
      { rejection_reason: 'wrong amount' },
      'actor-2',
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejection_reason).toBe('wrong amount');
    expect(rejected.rejected_by).toBe('actor-2');
    expect(rejected.rejected_at).not.toBeNull();
  });

  it('rejects mismatch invoice', async () => {
    const inv = await invoiceService.create(
      { ...baseInput, purchase_order_amount: 999 },
      'actor-1',
    );
    expect(inv.status).toBe('mismatch');
    const r = await invoiceService.reject(inv.id, { rejection_reason: 'r' }, 'actor-1');
    expect(r.status).toBe('rejected');
  });
});

describe('InvoiceService.resubmit', () => {
  it('moves rejected -> pending when amounts match', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    const r = await invoiceService.reject(inv.id, { rejection_reason: 'r' }, 'actor-1');
    const back = await invoiceService.resubmit(
      r.id,
      { invoice_amount: 2000, purchase_order_amount: 2000 },
      'actor-1',
    );
    expect(back.status).toBe('pending');
    expect(back.invoice_amount).toBe(2000);
    // History fields preserved
    expect(back.rejection_reason).toBe('r');
  });

  it('moves rejected -> mismatch when amounts differ', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    const r = await invoiceService.reject(inv.id, { rejection_reason: 'r' }, 'actor-1');
    const back = await invoiceService.resubmit(r.id, { invoice_amount: 999 }, 'actor-1');
    expect(back.status).toBe('mismatch');
  });

  it('preserves unchanged fields when partial input', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    const r = await invoiceService.reject(inv.id, { rejection_reason: 'r' }, 'actor-1');
    const back = await invoiceService.resubmit(r.id, { due_date: '2026-12-31' }, 'actor-1');
    expect(back.invoice_amount).toBe(baseInput.invoice_amount);
    expect(back.due_date.toISOString().slice(0, 10)).toBe('2026-12-31');
  });
});

describe('InvoiceService.softDelete', () => {
  it('soft-deletes a pending invoice and getById then 404s', async () => {
    const inv = await invoiceService.create(baseInput, 'actor-1');
    await invoiceService.softDelete(inv.id, 'actor-1');
    await expect(invoiceService.getById(inv.id)).rejects.toThrow(/not found/);
  });
});
