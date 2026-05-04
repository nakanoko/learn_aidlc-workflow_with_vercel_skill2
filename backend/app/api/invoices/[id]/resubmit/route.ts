import { type NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { withErrorHandler } from '@/middleware/withErrorHandler';
import { requireActorId, safeJson } from '@/middleware/requireActorId';
import { idParamSchema, resubmitInvoiceSchema } from '@/schemas/invoiceSchemas';
import { invoiceService } from '@/lib/container';
import { toInvoiceDTO } from '@/lib/dto';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withCors(
  withErrorHandler(async (req: NextRequest, ctx: Ctx) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const actorId = requireActorId(req);
    const json = await safeJson(req);
    const input = resubmitInvoiceSchema.parse(json);
    const invoice = await invoiceService.resubmit(id, input, actorId);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);

export const OPTIONS = withCors(
  withErrorHandler(async () => new NextResponse(null, { status: 204 })),
);
