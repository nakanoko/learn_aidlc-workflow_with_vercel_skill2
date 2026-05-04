import { z } from 'zod';
import { idParamPrimitive } from './invoiceSchemas';

export const auditLogQuerySchema = z.object({
  invoice_id: idParamPrimitive.optional(),
  limit: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 50 : Number(v)),
    z.number().int().min(1).max(200),
  ),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
