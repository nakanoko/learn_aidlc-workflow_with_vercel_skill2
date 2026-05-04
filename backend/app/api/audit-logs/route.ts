import { type NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { withErrorHandler } from '@/middleware/withErrorHandler';
import { auditLogQuerySchema } from '@/schemas/auditLogSchemas';
import { auditLogService } from '@/lib/container';
import { toAuditLogDTO } from '@/lib/dto';

export const GET = withCors(
  withErrorHandler(async (req: NextRequest) => {
    const url = new URL(req.url);
    const query = auditLogQuerySchema.parse({
      invoice_id: url.searchParams.get('invoice_id') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    const items = await auditLogService.list(query);
    return NextResponse.json({ items: items.map(toAuditLogDTO) });
  }),
);

export const OPTIONS = withCors(
  withErrorHandler(async () => new NextResponse(null, { status: 204 })),
);
