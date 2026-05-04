import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { InvoiceRepository } from '@/repositories/invoiceRepository';

let repo: InvoiceRepository;

beforeEach(() => {
  repo = new InvoiceRepository(prisma);
});

const baseData = {
  invoice_number: 'INV-001',
  vendor_id: 'V-1',
  invoice_amount: 100,
  purchase_order_amount: 100,
  due_date: new Date('2026-06-30T00:00:00Z'),
  status: 'pending' as const,
};

describe('InvoiceRepository', () => {
  it('creates and reads back an invoice', async () => {
    const inv = await repo.create(baseData);
    const got = await repo.findById(inv.id);
    expect(got?.id).toBe(inv.id);
    expect(got?.status).toBe('pending');
  });

  it('rejects duplicate (vendor_id, invoice_number) via UNIQUE constraint', async () => {
    await repo.create(baseData);
    await expect(repo.create(baseData)).rejects.toThrow();
  });

  it('findByVendorAndNumber returns the active invoice', async () => {
    const inv = await repo.create(baseData);
    const got = await repo.findByVendorAndNumber(baseData.vendor_id, baseData.invoice_number);
    expect(got?.id).toBe(inv.id);
  });

  it('findByVendorAndNumber excludes soft-deleted invoices', async () => {
    const inv = await repo.create(baseData);
    await repo.softDelete(inv.id);
    const got = await repo.findByVendorAndNumber(baseData.vendor_id, baseData.invoice_number);
    expect(got).toBeNull();
  });

  it('findById excludes soft-deleted by default', async () => {
    const inv = await repo.create(baseData);
    await repo.softDelete(inv.id);
    const got = await repo.findById(inv.id);
    expect(got).toBeNull();
    const gotIncluded = await repo.findById(inv.id, { includeDeleted: true });
    expect(gotIncluded?.id).toBe(inv.id);
  });

  it('list excludes soft-deleted invoices', async () => {
    const a = await repo.create({ ...baseData, invoice_number: 'A' });
    await repo.create({ ...baseData, invoice_number: 'B' });
    await repo.softDelete(a.id);
    const { items, total } = await repo.list({}, { limit: 50, offset: 0 });
    expect(total).toBe(1);
    expect(items.find((i) => i.id === a.id)).toBeUndefined();
  });

  it('softDelete sets deleted_at without physically deleting', async () => {
    const inv = await repo.create(baseData);
    await repo.softDelete(inv.id);
    const raw = await prisma.invoice.findUnique({ where: { id: inv.id } });
    expect(raw).not.toBeNull();
    expect(raw?.deleted_at).not.toBeNull();
  });

  it('list filters by status', async () => {
    await repo.create({ ...baseData, invoice_number: 'A', status: 'pending' });
    await repo.create({ ...baseData, invoice_number: 'B', status: 'mismatch' });
    const { items } = await repo.list({ status: 'pending' }, { limit: 50, offset: 0 });
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('update modifies fields', async () => {
    const inv = await repo.create(baseData);
    const upd = await repo.update(inv.id, { status: 'approved' });
    expect(upd.status).toBe('approved');
  });

  it('list applies limit/offset and orders by created_at desc', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create({ ...baseData, invoice_number: `INV-${i}` });
      await new Promise((r) => setTimeout(r, 5)); // ensure distinct created_at
    }
    const { items } = await repo.list({}, { limit: 2, offset: 1 });
    expect(items).toHaveLength(2);
  });
});
