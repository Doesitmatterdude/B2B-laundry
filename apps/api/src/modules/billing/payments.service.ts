import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// M5: Payment recording (UPI/cash/bank_transfer), invoice status updates,
// ledger entries (credit), outstanding balance recalculation.
// SRS 16.4, 13.9.

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async record(tenantId: string, userId: string, dto: RecordPaymentDto) {
    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, tenantId } });
    if (!client) throw new NotFoundException('Client not found');

    let invoice = null;
    if (dto.invoiceId) {
      invoice = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, tenantId } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'void') throw new BadRequestException('Cannot pay a voided invoice');
    }

    return this.prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          tenantId, clientId: dto.clientId,
          invoiceId: dto.invoiceId ?? null,
          amountPaise: BigInt(dto.amountPaise),
          mode: dto.mode, // upi|cash|bank_transfer
          reference: dto.reference,
          note: dto.note,
          receivedBy: userId,
        },
      });

      // Update invoice if linked
      if (invoice) {
        const newPaid = invoice.amountPaidPaise + BigInt(dto.amountPaise);
        const newStatus = newPaid >= invoice.totalPaise ? 'paid' : 'partial';
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaidPaise: newPaid, status: newStatus },
        });
      }

      // Ledger entry (credit)
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { tenantId, clientId: dto.clientId },
        orderBy: { createdAt: 'desc' },
      });
      const prevBalance = lastEntry?.balancePaise ?? 0n;
      await tx.ledgerEntry.create({
        data: {
          tenantId, clientId: dto.clientId,
          type: 'payment', refId: payment.id,
          creditPaise: BigInt(dto.amountPaise),
          balancePaise: prevBalance - BigInt(dto.amountPaise),
        },
      });

      // If advance payment (no invoice linked), add to advance balance
      if (!dto.invoiceId) {
        await tx.client.update({
          where: { id: dto.clientId },
          data: { advanceBalancePaise: { increment: BigInt(dto.amountPaise) } },
        });
      }

      return tx.payment.findUnique({
        where: { id: payment.id },
        include: { invoice: true },
      });
    });
  }

  async list(tenantId: string, opts: {
    clientId?: string; invoiceId?: string; mode?: string;
    page?: number; limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const where: any = { tenantId };
    if (opts.clientId) where.clientId = opts.clientId;
    if (opts.invoiceId) where.invoiceId = opts.invoiceId;
    if (opts.mode) where.mode = opts.mode;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where, orderBy: { receivedAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        include: { invoice: { select: { invoiceNumber: true, status: true } }, client: { select: { name: true, code: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }
}

export class RecordPaymentDto {
  clientId!: string;
  invoiceId?: string;
  amountPaise!: number;
  mode!: string; // upi|cash|bank_transfer
  reference?: string;
  note?: string;
}