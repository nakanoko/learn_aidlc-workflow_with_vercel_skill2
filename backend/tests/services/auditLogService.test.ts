import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { AuditLogRepository } from '@/repositories/auditLogRepository';
import { AuditLogService } from '@/services/auditLogService';
import { InvoiceService } from '@/services/invoiceService';

let invoiceService: InvoiceService;
let auditLogService: AuditLogService;

beforeEach(() => {
  const invoiceRepo = new InvoiceRepository(prisma);
  const auditRepo = new AuditLogRepository(prisma);
  auditLogService = new AuditLogService(auditRepo);
  invoiceService = new InvoiceService(invoiceRepo, auditLogService, prisma);
});

const base = {
  invoice_number: 'INV-001',
  vendor_id: 'V-1',
  invoice_amount: 1000,
  purchase_order_amount: 1000,
  due_date: '2026-06-30',
};

describe('AuditLogService.list', () => {
  it('lists logs filtered by invoice_id', async () => {
    const a = await invoiceService.create({ ...base, invoice_number: 'A' }, 'actor-1');
    const b = await invoiceService.create({ ...base, invoice_number: 'B' }, 'actor-2');

    const logsA = await auditLogService.list({ invoice_id: a.id, limit: 50 });
    expect(logsA).toHaveLength(1);
    expect(logsA[0].invoice_id).toBe(a.id);

    const logsB = await auditLogService.list({ invoice_id: b.id, limit: 50 });
    expect(logsB).toHaveLength(1);
    expect(logsB[0].invoice_id).toBe(b.id);
  });

  it('lists all logs when invoice_id not provided', async () => {
    await invoiceService.create({ ...base, invoice_number: 'A' }, 'actor-1');
    await invoiceService.create({ ...base, invoice_number: 'B' }, 'actor-2');

    const all = await auditLogService.list({ limit: 50 });
    expect(all).toHaveLength(2);
  });

  it('returns empty array for non-existent invoice_id', async () => {
    const logs = await auditLogService.list({ invoice_id: 'nonexistent', limit: 50 });
    expect(logs).toEqual([]);
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await invoiceService.create({ ...base, invoice_number: `INV-${i}` }, 'actor-1');
    }
    const limited = await auditLogService.list({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('returns logs ordered by created_at desc', async () => {
    const a = await invoiceService.create(base, 'actor-1');
    await invoiceService.reject(a.id, { rejection_reason: 'r' }, 'actor-1');

    const logs = await auditLogService.list({ invoice_id: a.id, limit: 50 });
    expect(logs).toHaveLength(2);
    // First entry should be the latest action
    expect(logs[0].action).toBe('reject');
    expect(logs[1].action).toBe('create');
  });

  it('records expected fields on create action', async () => {
    const a = await invoiceService.create(base, 'actor-1');
    const logs = await auditLogService.list({ invoice_id: a.id, limit: 50 });
    expect(logs[0].action).toBe('create');
    expect(logs[0].actor_id).toBe('actor-1');
    expect(logs[0].before_status).toBeNull();
    expect(logs[0].after_status).toBe('pending');
  });
});
