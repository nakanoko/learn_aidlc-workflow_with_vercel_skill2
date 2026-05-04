import { describe, it, expect } from 'vitest';
import {
  createInvoiceSchema,
  resubmitInvoiceSchema,
  rejectInvoiceSchema,
  listInvoicesQuerySchema,
  actorIdSchema,
  dueDateSchema,
} from '@/schemas/invoiceSchemas';

describe('createInvoiceSchema', () => {
  const valid = {
    invoice_number: 'INV-001',
    vendor_id: 'V-1',
    invoice_amount: 1000,
    purchase_order_amount: 1000,
    due_date: '2026-06-30',
  };

  it('parses a valid input', () => {
    expect(createInvoiceSchema.parse(valid)).toEqual(valid);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(() =>
      createInvoiceSchema.parse({ ...valid, extra: 'x' }),
    ).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => createInvoiceSchema.parse({ ...valid, invoice_amount: -1 })).toThrow();
  });

  it('rejects non-integer amount', () => {
    expect(() => createInvoiceSchema.parse({ ...valid, invoice_amount: 1.5 })).toThrow();
  });

  it('rejects amount given as a string', () => {
    expect(() => createInvoiceSchema.parse({ ...valid, invoice_amount: '1000' })).toThrow();
  });

  it('rejects bad date format', () => {
    expect(() => createInvoiceSchema.parse({ ...valid, due_date: '2026/06/30' })).toThrow();
  });

  it('rejects non-existent date (Feb 30)', () => {
    expect(() => createInvoiceSchema.parse({ ...valid, due_date: '2026-02-30' })).toThrow();
  });

  it('rejects too-long invoice_number', () => {
    expect(() =>
      createInvoiceSchema.parse({ ...valid, invoice_number: 'a'.repeat(51) }),
    ).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => createInvoiceSchema.parse({ ...valid, vendor_id: undefined })).toThrow();
  });
});

describe('resubmitInvoiceSchema', () => {
  it('accepts when at least one field is provided', () => {
    expect(resubmitInvoiceSchema.parse({ invoice_amount: 100 })).toEqual({ invoice_amount: 100 });
  });

  it('rejects empty object via refine', () => {
    expect(() => resubmitInvoiceSchema.parse({})).toThrow();
  });

  it('rejects unknown fields (.strict)', () => {
    expect(() =>
      resubmitInvoiceSchema.parse({ invoice_amount: 100, vendor_id: 'V-1' }),
    ).toThrow();
  });

  it('rejects negative invoice_amount', () => {
    expect(() => resubmitInvoiceSchema.parse({ invoice_amount: -1 })).toThrow();
  });

  it('rejects bad due_date', () => {
    expect(() => resubmitInvoiceSchema.parse({ due_date: 'bad' })).toThrow();
  });
});

describe('rejectInvoiceSchema', () => {
  it('parses valid reason', () => {
    expect(rejectInvoiceSchema.parse({ rejection_reason: 'reason' })).toEqual({
      rejection_reason: 'reason',
    });
  });

  it('rejects empty reason', () => {
    expect(() => rejectInvoiceSchema.parse({ rejection_reason: '' })).toThrow();
  });

  it('rejects 501-char reason', () => {
    expect(() =>
      rejectInvoiceSchema.parse({ rejection_reason: 'a'.repeat(501) }),
    ).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      rejectInvoiceSchema.parse({ rejection_reason: 'r', extra: 'x' }),
    ).toThrow();
  });
});

describe('listInvoicesQuerySchema', () => {
  it('applies defaults', () => {
    const v = listInvoicesQuerySchema.parse({});
    expect(v.limit).toBe(50);
    expect(v.offset).toBe(0);
    expect(v.status).toBeUndefined();
  });

  it('parses string limit/offset', () => {
    const v = listInvoicesQuerySchema.parse({ limit: '10', offset: '5' });
    expect(v.limit).toBe(10);
    expect(v.offset).toBe(5);
  });

  it('rejects limit=0', () => {
    expect(() => listInvoicesQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('rejects limit=101', () => {
    expect(() => listInvoicesQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects status outside enum', () => {
    expect(() => listInvoicesQuerySchema.parse({ status: 'invalid' })).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() => listInvoicesQuerySchema.parse({ offset: '-1' })).toThrow();
  });
});

describe('actorIdSchema', () => {
  it('accepts valid ids', () => {
    expect(actorIdSchema.parse('user-001')).toBe('user-001');
    expect(actorIdSchema.parse('User_42')).toBe('User_42');
  });

  it('rejects empty', () => {
    expect(() => actorIdSchema.parse('')).toThrow();
  });

  it('rejects 51 chars', () => {
    expect(() => actorIdSchema.parse('a'.repeat(51))).toThrow();
  });

  it('rejects special characters', () => {
    expect(() => actorIdSchema.parse('user@001')).toThrow();
    expect(() => actorIdSchema.parse('user 001')).toThrow();
    expect(() => actorIdSchema.parse('user!')).toThrow();
  });
});

describe('dueDateSchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(dueDateSchema.parse('2026-06-30')).toBe('2026-06-30');
  });

  it('rejects bad month', () => {
    expect(() => dueDateSchema.parse('2026-13-01')).toThrow();
  });
});
