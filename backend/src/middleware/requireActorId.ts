import type { NextRequest } from 'next/server';
import { ValidationError } from '@/errors/AppError';
import { actorIdSchema } from '@/schemas/invoiceSchemas';

export function requireActorId(req: NextRequest): string {
  const raw = req.headers.get('x-actor-id');
  if (raw === null) throw new ValidationError('X-Actor-Id header is required');
  const result = actorIdSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(`X-Actor-Id is invalid: ${result.error.issues[0].message}`);
  }
  return result.data;
}

export async function safeJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) throw new SyntaxError('Empty body');
  try {
    return JSON.parse(text);
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

export async function safeJsonOptional(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}
