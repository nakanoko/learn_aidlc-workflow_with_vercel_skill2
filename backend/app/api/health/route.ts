import { NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { prisma } from '@/lib/prisma';

export const GET = withCors(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ status: 'degraded', error }, { status: 503 });
  }
});

export const OPTIONS = withCors(async () => new NextResponse(null, { status: 204 }));
