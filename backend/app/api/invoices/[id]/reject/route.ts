import { type NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { withErrorHandler } from '@/middleware/withErrorHandler';
import { requireActorId, safeJson } from '@/middleware/requireActorId';
import { idParamSchema, rejectInvoiceSchema } from '@/schemas/invoiceSchemas';
import { invoiceService } from '@/lib/container';
import { toInvoiceDTO } from '@/lib/dto';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withCors(
  withErrorHandler(async (req: NextRequest, ctx: Ctx) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const actorId = requireActorId(req);
    const json = await safeJson(req);
    const input = rejectInvoiceSchema.parse(json);
    const invoice = await invoiceService.reject(id, input, actorId);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);

export const OPTIONS = withCors(
  withErrorHandler(async () => new NextResponse(null, { status: 204 })),
);
