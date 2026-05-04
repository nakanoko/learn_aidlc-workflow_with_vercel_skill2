import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { isAppError } from '@/errors/AppError';

export type RouteContext = { params: Promise<Record<string, string>> } | undefined;
export type Handler = (req: NextRequest, ctx: any) => Promise<Response>;

/**
 * Wraps a route handler to convert AppError / ZodError / unknown exceptions into a uniform JSON response.
 */
export function withErrorHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ZodError) {
        const message = e.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        return NextResponse.json({ error: message }, { status: 400 });
      }
      if (e instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      if (isAppError(e)) {
        return NextResponse.json({ error: e.message }, { status: e.httpStatus });
      }
      console.error('[unhandled]', e);
      const message = e instanceof Error ? e.message : 'Internal Server Error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
