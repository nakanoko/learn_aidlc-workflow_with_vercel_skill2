import { type NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { withErrorHandler } from '@/middleware/withErrorHandler';
import { requireApproverId } from '@/middleware/requireApproverId';
import { safeJsonOptional } from '@/middleware/requireActorId';
import { approveInvoiceSchema, idParamSchema } from '@/schemas/invoiceSchemas';
import { invoiceService } from '@/lib/container';
import { toInvoiceDTO } from '@/lib/dto';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withCors(
  withErrorHandler(async (req: NextRequest, ctx: Ctx) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const approverId = requireApproverId(req);
    const json = await safeJsonOptional(req);
    approveInvoiceSchema.parse(json);
    const invoice = await invoiceService.approve(id, approverId);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);

export const OPTIONS = withCors(
  withErrorHandler(async () => new NextResponse(null, { status: 204 })),
);
