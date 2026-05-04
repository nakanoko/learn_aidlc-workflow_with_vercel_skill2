import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/middleware/withErrorHandler';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '@/errors/AppError';

const fakeReq = {} as any;

async function readJson(res: Response) {
  const text = await res.text();
  return JSON.parse(text);
}

describe('withErrorHandler', () => {
  it('passes through normal responses', async () => {
    const handler = withErrorHandler(async () => NextResponse.json({ ok: true }));
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });
  });

  it('maps ValidationError to 400', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('bad input');
    });
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'bad input' });
  });

  it('maps NotFoundError to 404', async () => {
    const handler = withErrorHandler(async () => {
      throw new NotFoundError('not found');
    });
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(404);
  });

  it('maps ConflictError to 409', async () => {
    const handler = withErrorHandler(async () => {
      throw new ConflictError('conflict');
    });
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(409);
  });

  it('maps UnprocessableError to 422', async () => {
    const handler = withErrorHandler(async () => {
      throw new UnprocessableError('unprocessable');
    });
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(422);
  });

  it('maps ZodError to 400 with path:msg formatting', async () => {
    const handler = withErrorHandler(async () => {
      z.object({ x: z.string() }).parse({});
      return NextResponse.json({});
    });
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toContain('x');
  });

  it('maps SyntaxError to 400 (Invalid JSON body)', async () => {
    const handler = withErrorHandler(async () => {
      throw new SyntaxError('whatever');
    });
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Invalid JSON body' });
  });

  it('maps unknown Error to 500', async () => {
    const handler = withErrorHandler(async () => {
      throw new Error('boom');
    });
    const res = await handler(fakeReq, undefined);
    expect(res.status).toBe(500);
  });
});
