import { type NextRequest, NextResponse } from 'next/server';
import type { Handler } from './withErrorHandler';

const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOW_HEADERS = 'Content-Type, X-Actor-Id, X-Approver-Id';

function allowOrigin(): string {
  return process.env.CORS_ALLOW_ORIGIN ?? 'http://localhost:3001';
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin(),
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '600',
  };
}

/**
 * CORS middleware. Adds CORS headers to all responses and short-circuits OPTIONS preflight with 204.
 * Must be the outermost wrapper so error responses also receive the headers.
 */
export function withCors(handler: Handler): Handler {
  return async (req: NextRequest, ctx: any) => {
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }
    const res = await handler(req, ctx);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
    return new NextResponse(res.body, { status: res.status, headers });
  };
}

export const corsOptions = withCors(
  async () => new NextResponse(null, { status: 204 }),
);
