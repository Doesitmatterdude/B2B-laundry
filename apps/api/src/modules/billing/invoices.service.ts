import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// M5: Invoice generation from delivered/completed lots, GST computation,
// PDF generation (stub — Puppeteer integration at M8), outstanding tracking.
// SRS 16, 13.9.

// GST rates per category (from rate_card_items.gstRate). Default 18%.
// Intra-state: CGST + SGST (half each). Inter-state: IGST (full).

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  // ============ GENERATE INVOICE (draft) ============
  // Collects all delivered/completed lots in the period not yet invoiced,
  // computes line items from lot_items × historical rate, applies GST.
  async generate(tenantId: string, dto: GenerateInvoiceDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId, deletedAt: null },
      include: { contacts: { where: { isPrimary: true }, take: 1 } },
    });
    if (!client) throw new NotFoundException('Client not found');

    // Tenant GSTIN for intra/inter-state determination
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const isIntraState = tenant?.gstin && client.gstin &&
      tenant.gstin.slice(0, 2) === client.gstin.slice(0, 2);

    // Find lots in period that are delivered/completed and not yet invoiced
    const lots = await this.prisma.lot.findMany({
      where: {
        tenantId, clientId: dto.clientId,
        status: { in: ['delivered', 'completed'] },
        deliveredAt: {
          gte: new Date(dto.periodStart),
          lte: new Date(dto.periodEnd + 'T23:59:59'),
        },
      },
      include: { items: { include: { category: true } } },
    });

    if (lots.length === 0) throw new BadRequestException('No delivered lots in this period');

    // Build line items: aggregate by category across lots
    const lineMap = new Map<string, {
      categoryId: string; categoryName: string; hsnCode: string | null;
      qty: number; unit: string; ratePaise: bigint; gstRate: number;
      lotIds: string[];
    }>();

    for (const lot of lots) {
      for (const li of lot.items) {
        const delivered = li.deliveredQty ?? 0;
        if (delivered <= 0) continue;

        // Get historical rate from rate card valid at lot's pickup date
        const rate = await this.getRateAtDate(tenantId, dto.clientId, li.categoryId, lot.pickupAt ?? lot.createdAt);
        const rateCardItem = rate?.rateCardItem;
        const ratePaise = rateCardItem?.ratePaise ?? li.ratePaise ?? 0n;
        const gstRate = Number(rateCardItem?.gstRate ?? 18.0);
        const hsnCode = rateCardItem?.hsnCode ?? null;

        const key = li.categoryId;
        if (!lineMap.has(key)) {
          lineMap.set(key, {
            categoryId: li.categoryId,
            categoryName: li.category?.name ?? '',
            hsnCode,
            qty: 0, unit: li.unit ?? 'item',
            ratePaise, gstRate,
            lotIds: [],
          });
        }
        const line = lineMap.get(key)!;
        line.qty += delivered;
        line.lotIds.push(lot.id);
      }
    }

    // Compute totals
    let subtotalPaise = 0n;
    let cgstPaise = 0n;
    let sgstPaise = 0n;
    let igstPaise = 0n;

    const lines = Array.from(lineMap.values()).map((l) => {
      const lineTotal = l.ratePaise * BigInt(l.qty);
      subtotalPaise += lineTotal;
      const gstAmount = (lineTotal * BigInt(Math.round(l.gstRate * 100))) / 10000n;
      if (isIntraState) {
        cgstPaise += gstAmount / 2n;
        sgstPaise += gstAmount / 2n;
      } else {
        igstPaise += gstAmount;
      }
      return {
        categoryId: l.categoryId,
        description: l.categoryName,
        hsnCode: l.hsnCode,
        qty: l.qty,
        unit: l.unit,
        ratePaise: l.ratePaise,
        gstRate: l.gstRate,
        lineTotalPaise: lineTotal,
        lotIds: l.lotIds,
      };
    });

    const totalPaise = subtotalPaise + cgstPaise + sgstPaise + igstPaise;

    // Apply credit notes (compensation from investigations)
    const creditNotes = await this.prisma.creditNote.findMany({
      where: { tenantId, clientId: dto.clientId, invoiceId: null },
    });
    const creditTotal = creditNotes.reduce((sum, cn) => sum + cn.amountPaise, 0n);
    const netTotal = totalPaise - creditTotal;

    // Generate invoice number
    const invoiceNumber = await this.nextInvoiceNumber(tenantId);
    const dueDate = this.computeDueDate(dto.periodEnd, client.paymentTermsDays);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          tenantId, clientId: dto.clientId,
          invoiceNumber,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          status: 'draft',
          subtotalPaise,
          cgstPaise, sgstPaise, igstPaise,
          totalPaise: netTotal,
          dueDate,
        },
      });

      // Create invoice lines
      for (const line of lines) {
        await tx.invoiceLine.create({
          data: {
            tenantId, invoiceId: invoice.id,
            categoryId: line.categoryId,
            description: line.description,
            hsnCode: line.hsnCode,
            qty: line.qty, unit: line.unit,
            ratePaise: line.ratePaise,
            gstRate: line.gstRate,
            lineTotalPaise: line.lineTotalPaise,
          },
        });
      }

      // Link credit notes to this invoice
      if (creditNotes.length > 0) {
        await tx.creditNote.updateMany({
          where: { id: { in: creditNotes.map((cn) => cn.id) } },
          data: { invoiceId: invoice.id },
        });
      }

      // Ledger entry (debit)
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { tenantId, clientId: dto.clientId },
        orderBy: { createdAt: 'desc' },
      });
      const prevBalance = lastEntry?.balancePaise ?? 0n;
      await tx.ledgerEntry.create({
        data: {
          tenantId, clientId: dto.clientId,
          type: 'invoice', refId: invoice.id,
          debitPaise: netTotal,
          balancePaise: prevBalance + netTotal,
        },
      });

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: { lines: true, client: true },
      });
    });
  }

  // ============ ISSUE INVOICE (finalize + PDF) ============
  async issue(tenantId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'draft') throw new BadRequestException(`Invoice is ${inv.status}, not draft`);

    // TODO(M8): generate PDF via Puppeteer, upload to GCS, set pdfMediaId
    // For now, mark as issued with a placeholder.
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'issued', issuedAt: new Date() },
      include: { lines: true, client: true },
    });
  }

  // ============ LIST ============
  async list(tenantId: string, opts: {
    clientId?: string; status?: string; from?: string; to?: string;
    page?: number; limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const where: Prisma.InvoiceWhereInput = { tenantId };
    if (opts.clientId) where.clientId = opts.clientId;
    if (opts.status) where.status = opts.status;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = new Date(opts.from);
      if (opts.to) where.createdAt.lte = new Date(opts.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        include: { client: { select: { id: true, name: true, code: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // ============ GET BY ID ============
  async getById(tenantId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { lines: true, client: true, payments: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  // ============ VOID ============
  async voidInvoice(tenantId: string, invoiceId: string, reason: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'paid') throw new BadRequestException('Cannot void a paid invoice');

    return this.prisma.$transaction(async (tx) => {
      // Reverse ledger entry
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { tenantId, clientId: inv.clientId },
        orderBy: { createdAt: 'desc' },
      });
      const prevBalance = lastEntry?.balancePaise ?? 0n;
      await tx.ledgerEntry.create({
        data: {
          tenantId, clientId: inv.clientId,
          type: 'adjustment', refId: inv.id,
          creditPaise: inv.totalPaise,
          balancePaise: prevBalance - inv.totalPaise,
        },
      });

      // Audit
      await tx.auditLog.create({
        data: {
          tenantId, action: 'void_invoice',
          entityType: 'invoice', entityId: inv.id,
          after: { reason },
        },
      });

      return tx.invoice.update({ where: { id: invoiceId }, data: { status: 'void' } });
    });
  }

  // ============ CLIENT LEDGER ============
  async getLedger(tenantId: string, clientId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: 'asc' },
    });
    const last = entries[entries.length - 1];
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { advanceBalancePaise: true, creditLimitPaise: true },
    });
    return {
      entries,
      outstandingBalance: last?.balancePaise ?? 0n,
      advanceBalance: client?.advanceBalancePaise ?? 0n,
      creditLimit: client?.creditLimitPaise ?? 0n,
    };
  }

  // ============ HELPERS ============
  private async getRateAtDate(tenantId: string, clientId: string, categoryId: string, date: Date) {
    const rateCard = await this.prisma.rateCard.findFirst({
      where: {
        tenantId, clientId,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      include: { items: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    const item = rateCard?.items.find((i) => i.categoryId === categoryId);
    return { rateCard, rateCardItem: item };
  }

  private async nextInvoiceNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({
      where: { tenantId, createdAt: { gte: new Date(`${year}-01-01`) } },
    });
    return `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }

  private computeDueDate(periodEnd: string, termsDays: number): Date {
    const d = new Date(periodEnd);
    d.setDate(d.getDate() + termsDays);
    return d;
  }
}

// ============ DTOs ============
export class GenerateInvoiceDto {
  clientId!: string;
  periodStart!: string; // YYYY-MM-DD
  periodEnd!: string;   // YYYY-MM-DD
}