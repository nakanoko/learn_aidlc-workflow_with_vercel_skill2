import { type NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { withErrorHandler } from '@/middleware/withErrorHandler';
import { requireActorId } from '@/middleware/requireActorId';
import { idParamSchema } from '@/schemas/invoiceSchemas';
import { invoiceService } from '@/lib/container';
import { toInvoiceDTO } from '@/lib/dto';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withCors(
  withErrorHandler(async (_req: NextRequest, ctx: Ctx) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const invoice = await invoiceService.getById(id);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);

export const DELETE = withCors(
  withErrorHandler(async (req: NextRequest, ctx: Ctx) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const actorId = requireActorId(req);
    await invoiceService.softDelete(id, actorId);
    return new NextResponse(null, { status: 204 });
  }),
);

export const OPTIONS = withCors(
  withErrorHandler(async () => new NextResponse(null, { status: 204 })),
);
