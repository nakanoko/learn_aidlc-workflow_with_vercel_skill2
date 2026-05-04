import { type NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { withErrorHandler } from '@/middleware/withErrorHandler';
import { requireActorId, safeJson } from '@/middleware/requireActorId';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
} from '@/schemas/invoiceSchemas';
import { invoiceService } from '@/lib/container';
import { toInvoiceDTO } from '@/lib/dto';

export const POST = withCors(
  withErrorHandler(async (req: NextRequest) => {
    const actorId = requireActorId(req);
    const json = await safeJson(req);
    const input = createInvoiceSchema.parse(json);
    const invoice = await invoiceService.create(input, actorId);
    return NextResponse.json(toInvoiceDTO(invoice), { status: 201 });
  }),
);

export const GET = withCors(
  withErrorHandler(async (req: NextRequest) => {
    const url = new URL(req.url);
    const query = listInvoicesQuerySchema.parse({
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });
    const { items, total } = await invoiceService.list(query);
    return NextResponse.json({ items: items.map(toInvoiceDTO), total });
  }),
);

export const OPTIONS = withCors(
  withErrorHandler(async () => new NextResponse(null, { status: 204 })),
);
