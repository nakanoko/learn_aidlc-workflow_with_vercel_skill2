import type { NextRequest } from 'next/server';
import { ValidationError } from '@/errors/AppError';
import { actorIdSchema } from '@/schemas/invoiceSchemas';

export function requireApproverId(req: NextRequest): string {
  const raw = req.headers.get('x-approver-id');
  if (raw === null) throw new ValidationError('X-Approver-Id header is required');
  const result = actorIdSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(`X-Approver-Id is invalid: ${result.error.issues[0].message}`);
  }
  return result.data;
}
