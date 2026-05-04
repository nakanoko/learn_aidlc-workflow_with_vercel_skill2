import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { AuditLogRepository } from '@/repositories/auditLogRepository';
import { InvoiceRepository } from '@/repositories/invoiceRepository';

let auditRepo: AuditLogRepository;
let invoiceRepo: InvoiceRepository;

beforeEach(() => {
  auditRepo = new AuditLogRepository(prisma);
  invoiceRepo = new InvoiceRepository(prisma);
});

async function createInvoice(num: string) {
  return invoiceRepo.create({
    invoice_number: num,
    vendor_id: 'V-1',
    invoice_amount: 100,
    purchase_order_amount: 100,
    due_date: new Date('2026-06-30T00:00:00Z'),
    status: 'pending',
  });
}

describe('AuditLogRepository', () => {
  it('creates an audit log entry', async () => {
    const inv = await createInvoice('A');
    const log = await auditRepo.create({
      action: 'create',
      actor_id: 'actor-1',
      invoice_id: inv.id,
      before_status: null,
      after_status: 'pending',
      note: null,
    });
    expect(log.id).toBeTruthy();
    expect(log.action).toBe('create');
  });

  it('lists logs filtered by invoice_id', async () => {
    const a = await createInvoice('A');
    const b = await createInvoice('B');
    await auditRepo.create({
      action: 'create',
      actor_id: 'actor-1',
      invoice_id: a.id,
      before_status: null,
      after_status: 'pending',
      note: null,
    });
    await auditRepo.create({
      action: 'create',
      actor_id: 'actor-2',
      invoice_id: b.id,
      before_status: null,
      after_status: 'pending',
      note: null,
    });
    const aLogs = await auditRepo.list({ invoice_id: a.id }, { limit: 50 });
    expect(aLogs).toHaveLength(1);
    expect(aLogs[0].invoice_id).toBe(a.id);
  });

  it('lists all logs when no filter', async () => {
    const a = await createInvoice('A');
    await auditRepo.create({
      action: 'create',
      actor_id: 'actor-1',
      invoice_id: a.id,
      before_status: null,
      after_status: 'pending',
      note: null,
    });
    await auditRepo.create({
      action: 'approve',
      actor_id: 'approver-1',
      invoice_id: a.id,
      before_status: 'pending',
      after_status: 'approved',
      note: null,
    });
    const logs = await auditRepo.list({}, { limit: 50 });
    expect(logs).toHaveLength(2);
  });

  it('orders logs by created_at desc', async () => {
    const a = await createInvoice('A');
    await auditRepo.create({
      action: 'create',
      actor_id: 'actor-1',
      invoice_id: a.id,
      before_status: null,
      after_status: 'pending',
      note: null,
    });
    await new Promise((r) => setTimeout(r, 10));
    await auditRepo.create({
      action: 'approve',
      actor_id: 'approver-1',
      invoice_id: a.id,
      before_status: 'pending',
      after_status: 'approved',
      note: null,
    });
    const logs = await auditRepo.list({ invoice_id: a.id }, { limit: 50 });
    expect(logs[0].action).toBe('approve');
    expect(logs[1].action).toBe('create');
  });

  it('respects limit', async () => {
    const a = await createInvoice('A');
    for (let i = 0; i < 3; i++) {
      await auditRepo.create({
        action: 'create',
        actor_id: `actor-${i}`,
        invoice_id: a.id,
        before_status: null,
        after_status: 'pending',
        note: null,
      });
    }
    const logs = await auditRepo.list({}, { limit: 2 });
    expect(logs).toHaveLength(2);
  });
});
