import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// Missing-cloth investigation case management.
// Auto-created by workflow (tagging/packing/delivery) or manually by Admin.
// Full lifecycle: Open → Investigating → Recovered / Compensation / Closed.
// SRS 10.6, 13.7.

@Injectable()
export class InvestigationsService {
  constructor(private prisma: PrismaService) {}

  // ---------- LIST ----------
  async list(tenantId: string, opts: {
    status?: string; clientId?: string; stage?: string;
    page?: number; limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const where: Prisma.InvestigationWhereInput = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.clientId) where.clientId = opts.clientId;
    if (opts.stage) where.disappearedStage = opts.stage;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.investigation.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { select: { id: true, name: true, code: true } },
          lot: { select: { id: true, lotNumber: true } },
          events: { orderBy: { createdAt: 'asc' }, take: 5 },
        },
      }),
      this.prisma.investigation.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // ---------- GET ONE ----------
  async getById(tenantId: string, id: string) {
    const inv = await this.prisma.investigation.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        lot: { include: { items: { include: { category: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inv) throw new NotFoundException('Investigation not found');
    return inv;
  }

  // ---------- MANUAL CREATE ----------
  async create(tenantId: string, userId: string, dto: CreateInvestigationDto) {
    const caseNumber = `CASE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return this.prisma.investigation.create({
      data: {
        tenantId, caseNumber,
        clientId: dto.clientId,
        lotId: dto.lotId,
        categoryId: dto.categoryId,
        qtyMissing: dto.qtyMissing,
        disappearedStage: dto.disappearedStage,
        responsibleUserId: dto.responsibleUserId,
        status: 'open',
        assignedTo: dto.assignedTo ?? userId,
      },
      include: { client: true, lot: true },
    });
  }

  // ---------- UPDATE (assign, change stage attribution) ----------
  async update(tenantId: string, id: string, dto: UpdateInvestigationDto) {
    const inv = await this.prisma.investigation.findFirst({ where: { id, tenantId } });
    if (!inv) throw new NotFoundException('Investigation not found');
    const data: Prisma.InvestigationUpdateInput = {};
    if (dto.assignedTo) data.assignedTo = dto.assignedTo;
    if (dto.disappearedStage) data.disappearedStage = dto.disappearedStage;
    if (dto.responsibleUserId) data.responsibleUserId = dto.responsibleUserId;
    if (dto.status) data.status = dto.status;
    return this.prisma.investigation.update({ where: { id }, data });
  }

  // ---------- ADD EVENT (comment / evidence) ----------
  async addEvent(tenantId: string, id: string, userId: string, dto: EventDto) {
    const inv = await this.prisma.investigation.findFirst({ where: { id, tenantId } });
    if (!inv) throw new NotFoundException('Investigation not found');

    const event = await this.prisma.investigationEvent.create({
      data: {
        tenantId, investigationId: id,
        actorUserId: userId,
        type: dto.type ?? 'comment',
        message: dto.message,
        meta: dto.meta ?? {},
      },
    });

    // Link evidence photos
    if (dto.mediaIds) {
      for (const mid of dto.mediaIds) {
        await this.prisma.mediaFile.updateMany({
          where: { id: mid, tenantId },
          data: { refTable: 'investigations', refId: id, context: 'evidence' },
        });
      }
    }

    // If status change included
    if (dto.statusChange && dto.statusChange !== inv.status) {
      await this.prisma.investigation.update({
        where: { id },
        data: { status: dto.statusChange },
      });
    }

    return event;
  }

  // ---------- RESOLVE ----------
  // recovered: item found → reconcile counts, close case
  // compensation: pay client → create credit note, close case
  // closed: write-off with reason
  async resolve(tenantId: string, id: string, userId: string, dto: ResolveDto) {
    const inv = await this.prisma.investigation.findFirst({
      where: { id, tenantId },
      include: { lot: true, client: true },
    });
    if (!inv) throw new NotFoundException('Investigation not found');
    if (inv.status === 'closed' || inv.status === 'recovered') {
      throw new BadRequestException(`Case already ${inv.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      let compensationPaise = 0n;

      if (dto.resolution === 'recovered') {
        // Mark the discrepancy as resolved
        await tx.discrepancy.updateMany({
          where: { lotId: inv.lotId, categoryId: inv.categoryId, type: 'missing', resolved: false },
          data: { resolved: true },
        });
      } else if (dto.resolution === 'compensation') {
        compensationPaise = BigInt(dto.compensationPaise ?? 0);
        if (compensationPaise > 0n) {
          // Create credit note
          await tx.creditNote.create({
            data: {
              tenantId,
              clientId: inv.clientId,
              investigationId: inv.id,
              amountPaise: compensationPaise,
              reason: dto.reason ?? 'Missing cloth compensation',
            },
          });
          // Update client advance balance (credit)
          const client = await tx.client.findUnique({ where: { id: inv.clientId } });
          if (client) {
            await tx.client.update({
              where: { id: inv.clientId },
              data: { advanceBalancePaise: client.advanceBalancePaise + compensationPaise },
            });
          }
        }
      }

      // Update investigation
      await tx.investigation.update({
        where: { id },
        data: {
          status: dto.resolution, // recovered|compensation|closed
          resolution: dto.reason,
          compensationPaise,
          closedAt: new Date(),
        },
      });

      // Add resolution event
      await tx.investigationEvent.create({
        data: {
          tenantId, investigationId: id,
          actorUserId: userId,
          type: 'resolution',
          message: `Resolved as ${dto.resolution}: ${dto.reason ?? ''}`,
          meta: { resolution: dto.resolution, compensationPaise: compensationPaise.toString() },
        },
      });

      return tx.investigation.findUnique({
        where: { id },
        include: { events: { orderBy: { createdAt: 'asc' } }, client: true, lot: true },
      });
    });
  }
}

// ============ DTOs ============
export class CreateInvestigationDto {
  clientId!: string;
  lotId?: string;
  categoryId?: string;
  qtyMissing!: number;
  disappearedStage?: string;
  responsibleUserId?: string;
  assignedTo?: string;
}

export class UpdateInvestigationDto {
  assignedTo?: string;
  disappearedStage?: string;
  responsibleUserId?: string;
  status?: string;
}

export class EventDto {
  type?: string; // comment|status_change|evidence|resolution
  message?: string;
  meta?: any;
  mediaIds?: string[];
  statusChange?: string;
}

export class ResolveDto {
  resolution!: string; // recovered|compensation|closed
  reason?: string;
  compensationPaise?: number;
}