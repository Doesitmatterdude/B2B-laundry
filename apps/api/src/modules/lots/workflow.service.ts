import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// M3: Tagging (recount + reconciliation + QC), Wash pipeline status,
// Packing (three-way reconciliation + auto stage-attribution).
// SRS 10.2, 10.3, 10.4, 13.6.

// Valid lot status transitions (forward-only by default; admin override for backward)
const FORWARD_PIPELINE = [
  'collected', 'tagged', 'washed', 'drying', 'ironed', 'packed', 'ready', 'delivered', 'completed',
];

@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService) {}

  // ============ TAGGING ============
  // Tagger recounts each category, system compares with pickup.
  // Mismatches must be classified. Defects flagged with photos.
  async submitTagging(tenantId: string, userId: string, lotId: string, dto: TaggingDto) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, tenantId },
      include: { items: { include: { category: true } }, client: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    if (lot.status !== 'collected' && lot.status !== 'tagged') {
      throw new BadRequestException(`Lot status ${lot.status} — cannot tag (must be collected)`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update tagging quantities on lot_items
      for (const item of dto.items) {
        const lotItem = lot.items.find((li) => li.categoryId === item.categoryId);
        if (!lotItem) throw new BadRequestException(`Category ${item.categoryId} not in this lot`);
        await tx.lotItem.update({
          where: { id: lotItem.id },
          data: { taggingQty: item.taggingQty },
        });
      }

      // 2. Process discrepancies (pickup vs tagging)
      for (const d of dto.discrepancies ?? []) {
        const lotItem = lot.items.find((li) => li.categoryId === d.categoryId);
        if (!lotItem) continue;
        await tx.discrepancy.create({
          data: {
            tenantId, lotId,
            categoryId: d.categoryId,
            stage: 'pickup_vs_tag',
            type: d.type, // missing|extra|unknown|found
            qty: d.qty,
            createdBy: userId,
          },
        });
      }

      // 3. Process defects (QC flags with photos)
      for (const def of dto.defects ?? []) {
        await tx.defect.create({
          data: {
            tenantId, lotId,
            categoryId: def.categoryId,
            type: def.type, // already_damaged|stained|burn|torn|color_fade|button_missing|zipper_broken|other
            qty: def.qty ?? 1,
            note: def.note,
            detectedStage: 'tagging',
            detectedBy: userId,
          },
        });
        // Link photos
        if (def.mediaIds) {
          for (const mid of def.mediaIds) {
            await tx.mediaFile.updateMany({
              where: { id: mid, tenantId },
              data: { refTable: 'defects', context: 'tagging' },
            });
          }
        }
      }

      // 4. Auto-detect unclassified mismatches (pickup vs tagging)
      const updatedItems = await tx.lotItem.findMany({ where: { lotId } });
      for (const li of updatedItems) {
        if (li.taggingQty !== null && li.taggingQty !== li.pickupQty) {
          const hasDiscrepancy = (dto.discrepancies ?? []).some((d) => d.categoryId === li.categoryId);
          if (!hasDiscrepancy) {
            const delta = li.pickupQty - li.taggingQty;
            await tx.discrepancy.create({
              data: {
                tenantId, lotId, categoryId: li.categoryId,
                stage: 'pickup_vs_tag',
                type: delta > 0 ? 'missing' : 'extra',
                qty: Math.abs(delta),
                createdBy: userId,
              },
            });
          }
        }
      }

      // 5. Status transition: collected → tagged
      await this.recordStatusTransition(tx, tenantId, lotId, 'tagged', userId);

      // 6. Auto-open investigation if missing items exceed threshold
      const missingCount = await tx.discrepancy.count({
        where: { lotId, type: 'missing', stage: 'pickup_vs_tag', resolved: false },
      });
      if (missingCount > 0) {
        await this.autoOpenInvestigation(tx, tenantId, lot, 'pickup_vs_tag', userId);
      }

      return tx.lot.findUnique({
        where: { id: lotId },
        include: {
          items: { include: { category: true } },
          discrepancies: true,
          defects: true,
          statusHistory: { orderBy: { occurredAt: 'asc' } },
        },
      });
    });
  }

  // ============ WASH PIPELINE STATUS ============
  async advanceStatus(tenantId: string, userId: string, lotId: string, dto: StatusDto) {
    const lot = await this.prisma.lot.findFirst({ where: { id: lotId, tenantId } });
    if (!lot) throw new NotFoundException('Lot not found');

    const currentIdx = FORWARD_PIPELINE.indexOf(lot.status);
    const targetIdx = FORWARD_PIPELINE.indexOf(dto.status);

    if (targetIdx === -1) throw new BadRequestException(`Invalid status: ${dto.status}`);

    // Backward transition requires admin override
    if (targetIdx < currentIdx) {
      if (!dto.adminOverride) {
        throw new BadRequestException(
          `Cannot go backward from ${lot.status} to ${dto.status} without adminOverride + reason`,
        );
      }
      if (!dto.reason) throw new BadRequestException('adminOverride requires a reason');
      // Audit the override
      await this.prisma.auditLog.create({
        data: {
          tenantId, actorUserId: userId,
          action: 'status_override',
          entityType: 'lot', entityId: lotId,
          before: { status: lot.status },
          after: { status: dto.status, reason: dto.reason },
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.lot.update({ where: { id: lotId }, data: { status: dto.status } });
      await this.recordStatusTransition(tx, tenantId, lotId, dto.status, userId, dto.machineId);

      // If delivered, compute TAT
      if (dto.status === 'delivered') {
        const collected = await tx.lotStatusHistory.findFirst({
          where: { lotId, status: 'collected' },
        });
        if (collected) {
          const tatMinutes = Math.round((Date.now() - collected.occurredAt.getTime()) / 60000);
          await tx.lot.update({ where: { id: lotId }, data: { tatMinutes, deliveredAt: new Date() } });
        }
      }

      // If completed, check no pending
      if (dto.status === 'completed') {
        await tx.lot.update({ where: { id: lotId }, data: { hasPending: false } });
      }

      return tx.lot.findUnique({ where: { id: lotId }, include: { statusHistory: { orderBy: { occurredAt: 'asc' } } } });
    });
  }

  // ============ PACKING ============
  // Packer recounts; system compares pickup | tagging | packing (three-way).
  // Auto-attributes stage of loss.
  async submitPacking(tenantId: string, userId: string, lotId: string, dto: PackingDto) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, tenantId },
      include: { items: { include: { category: true } }, client: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    if (!['ironed', 'packed'].includes(lot.status)) {
      throw new BadRequestException(`Lot status ${lot.status} — must be ironed before packing`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update packing quantities
      for (const item of dto.items) {
        const lotItem = lot.items.find((li) => li.categoryId === item.categoryId);
        if (!lotItem) throw new BadRequestException(`Category ${item.categoryId} not in this lot`);
        await tx.lotItem.update({
          where: { id: lotItem.id },
          data: { packingQty: item.packingQty },
        });
      }

      // 2. Three-way reconciliation + stage attribution
      const updatedItems = await tx.lotItem.findMany({ where: { lotId }, include: { category: true } });
      let totalPacked = 0;

      for (const li of updatedItems) {
        const pickup = li.pickupQty;
        const tagging = li.taggingQty ?? pickup;
        const packing = li.packingQty ?? tagging;
        totalPacked += packing;

        // Determine where loss occurred
        if (packing < tagging) {
          // Lost between tagging and packing
          const delta = tagging - packing;
          const hasExisting = (dto.missing ?? []).some((m) => m.categoryId === li.categoryId);
          if (!hasExisting) {
            await tx.discrepancy.create({
              data: {
                tenantId, lotId, categoryId: li.categoryId,
                stage: 'tag_vs_pack', type: 'missing', qty: delta, createdBy: userId,
              },
            });
          }
        } else if (packing > tagging) {
          // Found/extra
          const delta = packing - tagging;
          await tx.discrepancy.create({
            data: {
              tenantId, lotId, categoryId: li.categoryId,
              stage: 'tag_vs_pack', type: 'found', qty: delta, createdBy: userId,
            },
          });
        }

        // Process explicit missing items from packer
        for (const m of dto.missing ?? []) {
          if (m.categoryId === li.categoryId) {
            await tx.discrepancy.create({
              data: {
                tenantId, lotId, categoryId: m.categoryId,
                stage: 'tag_vs_pack', type: 'missing', qty: m.qty, createdBy: userId,
              },
            });
          }
        }
      }

      // 3. Process damaged items found during packing
      for (const d of dto.damaged ?? []) {
        await tx.defect.create({
          data: {
            tenantId, lotId, categoryId: d.categoryId,
            type: d.type, qty: d.qty ?? 1, note: d.note,
            detectedStage: 'packing', detectedBy: userId,
          },
        });
        if (d.mediaIds) {
          for (const mid of d.mediaIds) {
            await tx.mediaFile.updateMany({
              where: { id: mid, tenantId },
              data: { refTable: 'defects', context: 'packing' },
            });
          }
        }
      }

      // 4. Update lot totals + status
      await tx.lot.update({
        where: { id: lotId },
        data: { totalPackedQty: totalPacked, status: 'packed' },
      });

      // 5. Status transition
      await this.recordStatusTransition(tx, tenantId, lotId, 'packed', userId);

      // 6. Auto-open investigation for net shortfall
      const netShortfall = updatedItems.reduce((sum, li) => {
        const pickup = li.pickupQty;
        const packing = li.packingQty ?? 0;
        return sum + Math.max(0, pickup - packing);
      }, 0);
      if (netShortfall > 0) {
        await this.autoOpenInvestigation(tx, tenantId, lot, 'tag_vs_pack', userId);
      }

      return tx.lot.findUnique({
        where: { id: lotId },
        include: {
          items: { include: { category: true } },
          discrepancies: { orderBy: { createdAt: 'asc' } },
          defects: true,
          statusHistory: { orderBy: { occurredAt: 'asc' } },
        },
      });
    });
  }

  // ============ HELPERS ============
  private async recordStatusTransition(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lotId: string,
    status: string,
    userId: string,
    machineId?: string,
  ) {
    // Compute duration from previous status
    const prev = await tx.lotStatusHistory.findFirst({
      where: { lotId },
      orderBy: { occurredAt: 'desc' },
    });
    const now = new Date();
    const duration = prev ? Math.round((now.getTime() - prev.occurredAt.getTime()) / 60000) : null;

    await tx.lotStatusHistory.create({
      data: {
        tenantId, lotId, status,
        actorUserId: userId,
        machineId: machineId ?? null,
        occurredAt: now,
        durationFromPrevMinutes: duration,
      },
    });

    // Update lot status
    await tx.lot.update({ where: { id: lotId }, data: { status } });
  }

  private async autoOpenInvestigation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lot: any,
    stage: string,
    userId: string,
  ) {
    // Count unresolved missing across all stages for this lot
    const missingItems = await tx.discrepancy.findMany({
      where: { lotId: lot.id, type: 'missing', resolved: false },
      include: { category: true },
    });

    for (const m of missingItems) {
      // Check if an investigation already exists for this lot+category
      const existing = await tx.investigation.findFirst({
        where: { lotId: lot.id, categoryId: m.categoryId, status: { in: ['open', 'investigating'] } },
      });
      if (existing) continue;

      const caseNumber = `CASE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await tx.investigation.create({
        data: {
          tenantId,
          caseNumber,
          clientId: lot.clientId,
          lotId: lot.id,
          categoryId: m.categoryId,
          qtyMissing: m.qty,
          disappearedStage: stage,
          responsibleUserId: userId,
          status: 'open',
          assignedTo: userId,
        },
      });
    }
  }
}

// ============ DTOs ============
export class TaggingDto {
  items!: { categoryId: string; taggingQty: number }[];
  discrepancies?: { categoryId: string; type: string; qty: number }[];
  defects?: {
    categoryId: string; type: string; qty?: number;
    note?: string; mediaIds?: string[];
  }[];
}

export class StatusDto {
  status!: string;
  machineId?: string;
  occurredAt?: string;
  adminOverride?: boolean;
  reason?: string;
}

export class PackingDto {
  items!: { categoryId: string; packingQty: number }[];
  missing?: { categoryId: string; qty: number }[];
  damaged?: {
    categoryId: string; type: string; qty?: number;
    note?: string; mediaIds?: string[];
  }[];
}