import { z } from 'zod';

// Actor ID: 1-50 chars, alphanumeric + '-' + '_'
export const actorIdSchema = z
  .string()
  .min(1, 'X-Actor-Id is required')
  .max(50, 'X-Actor-Id must be at most 50 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'X-Actor-Id contains invalid characters');

// Invoice status (application-layer enum)
export const invoiceStatusSchema = z.enum(['pending', 'approved', 'rejected', 'mismatch']);

// Amount: integer, non-negative, capped at 999_999_999_999
export const amountSchema = z
  .number({ invalid_type_error: 'amount must be a number' })
  .int('amount must be an integer')
  .min(0, 'amount must be >= 0')
  .max(999_999_999_999, 'amount too large');

// Due date: YYYY-MM-DD
export const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD')
  .refine(
    (v) => {
      const ms = Date.parse(`${v}T00:00:00Z`);
      if (Number.isNaN(ms)) return false;
      // Validate roundtrip (rejects invalid days like 2026-02-30)
      const d = new Date(ms);
      const round = `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1)
        .toString()
        .padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
      return round === v;
    },
    { message: 'due_date is not a valid date' },
  );

// id path param (loose; ID format is not strictly checked - non-existent IDs become 404 via repository)
export const idParamPrimitive = z.string().min(1, 'id is required');

export const idParamSchema = z.object({ id: idParamPrimitive });

// Create Invoice (strict to reject unknown fields)
export const createInvoiceSchema = z
  .object({
    invoice_number: z.string().min(1).max(50),
    vendor_id: z.string().min(1).max(50),
    invoice_amount: amountSchema,
    purchase_order_amount: amountSchema,
    due_date: dueDateSchema,
  })
  .strict();

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// List query: convert string -> number with preprocess
const intCoerce = (defaultValue: number, min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? defaultValue : Number(v)),
    z.number().int().min(min).max(max),
  );

export const listInvoicesQuerySchema = z.object({
  status: invoiceStatusSchema.optional(),
  limit: intCoerce(50, 1, 100),
  offset: intCoerce(0, 0, Number.MAX_SAFE_INTEGER),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

// Approve: empty body or {} allowed
export const approveInvoiceSchema = z.object({}).strict().optional().default({});
export type ApproveInvoiceInput = z.infer<typeof approveInvoiceSchema>;

// Reject
export const rejectInvoiceSchema = z
  .object({
    rejection_reason: z
      .string()
      .min(1, 'rejection_reason is required')
      .max(500, 'rejection_reason must be at most 500 characters'),
  })
  .strict();

export type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema>;

// Resubmit (strict + refine: at least one field required)
export const resubmitInvoiceSchema = z
  .object({
    invoice_amount: amountSchema.optional(),
    purchase_order_amount: amountSchema.optional(),
    due_date: dueDateSchema.optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.invoice_amount !== undefined ||
      v.purchase_order_amount !== undefined ||
      v.due_date !== undefined,
    {
      message:
        'At least one of invoice_amount, purchase_order_amount, due_date must be provided',
    },
  );

export type ResubmitInvoiceInput = z.infer<typeof resubmitInvoiceSchema>;
