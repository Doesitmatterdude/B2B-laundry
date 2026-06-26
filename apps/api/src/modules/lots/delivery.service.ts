import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// M4: Return delivery (checklist, signature, partial/pending, dispute)
// + Missing-cloth investigation case management.
// SRS 10.5, 10.6, 13.6, 13.7.

@Injectable()
export class DeliveryService {
  constructor(private prisma: PrismaService) {}

  // ============ RETURN DELIVERY ============
  // Delivery boy delivers packed clothes. App shows checklist (packed counts).
  // Client signs. Pending items remain open. Disputes captured.
  async deliverLot(tenantId: string, userId: string, lotId: string, dto: DeliverDto) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, tenantId },
      include: { items: { include: { category: true } }, client: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    if (!['packed', 'ready', 'delivered'].includes(lot.status)) {
      throw new BadRequestException(`Lot status ${lot.status} — must be packed/ready before delivery`);
    }

    return this.prisma.$transaction(async (tx) => {
      let totalDelivered = 0;
      let hasPending = false;

      // 1. Update delivered quantities per category
      for (const item of dto.items) {
        const lotItem = lot.items.find((li) => li.categoryId === item.categoryId);
        if (!lotItem) throw new BadRequestException(`Category ${item.categoryId} not in this lot`);

        const packed = lotItem.packingQty ?? lotItem.taggingQty ?? lotItem.pickupQty;
        const delivered = item.deliveredQty;
        totalDelivered += delivered;

        // If delivered < packed, items are pending
        if (delivered < (packed ?? 0)) {
          hasPending = true;
          // Record pending as a discrepancy
          await tx.discrepancy.create({
            data: {
              tenantId, lotId, categoryId: item.categoryId,
              stage: 'pack_vs_delivery', type: 'missing',
              qty: (packed ?? 0) - delivered, createdBy: userId,
            },
          });
        }

        await tx.lotItem.update({
          where: { id: lotItem.id },
          data: { deliveredQty: delivered },
        });
      }

      // 2. Save client signature
      if (dto.signature) {
        await tx.signature.create({
          data: {
            tenantId, lotId,
            context: 'delivery',
            signerRole: 'client',
            signerName: dto.signature.signerName,
            mediaFileId: dto.signature.mediaId,
          },
        });
      }

      // 3. Save delivery boy signature
      if (dto.deliverySignature) {
        await tx.signature.create({
          data: {
            tenantId, lotId,
            context: 'delivery',
            signerRole: 'delivery',
            signerName: dto.deliverySignature.signerName,
            mediaFileId: dto.deliverySignature.mediaId,
          },
        });
      }

      // 4. Handle dispute
      let hasDispute = false;
      if (dto.disputeNote) {
        hasDispute = true;
        await tx.auditLog.create({
          data: {
            tenantId, actorUserId: userId,
            action: 'delivery_dispute',
            entityType: 'lot', entityId: lotId,
            after: { disputeNote: dto.disputeNote, photos: dto.disputePhotos ?? [] },
          },
        });
        // Link dispute photos
        if (dto.disputePhotos) {
          for (const pid of dto.disputePhotos) {
            await tx.mediaFile.updateMany({
              where: { id: pid, tenantId },
              data: { refTable: 'lots', refId: lotId, context: 'dispute' },
            });
          }
        }
      }

      // 5. Update lot
      const now = new Date();
      const collected = await tx.lotStatusHistory.findFirst({
        where: { lotId, status: 'collected' },
      });
      const tatMinutes = collected ? Math.round((now.getTime() - collected.occurredAt.getTime()) / 60000) : null;

      await tx.lot.update({
        where: { id: lotId },
        data: {
          status: hasPending ? 'delivered' : 'delivered',
          deliveredAt: now,
          deliveryUserId: userId,
          deliveryLat: dto.gps?.lat,
          deliveryLng: dto.gps?.lng,
          totalDeliveredQty: totalDelivered,
          hasPending,
          hasDispute,
          tatMinutes,
        },
      });

      // 6. Status history
      const prev = await tx.lotStatusHistory.findFirst({
        where: { lotId }, orderBy: { occurredAt: 'desc' },
      });
      await tx.lotStatusHistory.create({
        data: {
          tenantId, lotId, status: 'delivered',
          actorUserId: userId,
          occurredAt: now,
          durationFromPrevMinutes: prev ? Math.round((now.getTime() - prev.occurredAt.getTime()) / 60000) : null,
          meta: { gps: dto.gps, totalDelivered, hasPending, hasDispute },
        },
      });

      // 7. If no pending and no dispute, auto-complete
      if (!hasPending && !hasDispute) {
        await tx.lot.update({ where: { id: lotId }, data: { status: 'completed' } });
        await tx.lotStatusHistory.create({
          data: {
            tenantId, lotId, status: 'completed',
            actorUserId: userId,
            occurredAt: new Date(),
            meta: { autoCompleted: true },
          },
        });
      }

      // 8. Auto-open investigation for missing items at delivery stage
      if (hasPending) {
        const missingItems = dto.items.filter((i) => {
          const li = lot.items.find((l) => l.categoryId === i.categoryId);
          const packed = li?.packingQty ?? li?.taggingQty ?? li?.pickupQty ?? 0;
          return i.deliveredQty < packed;
        });
        for (const m of missingItems) {
          const existing = await tx.investigation.findFirst({
            where: { lotId, categoryId: m.categoryId, status: { in: ['open', 'investigating'] } },
          });
          if (existing) continue;
          const li = lot.items.find((l) => l.categoryId === m.categoryId);
          const packed = li?.packingQty ?? 0;
          const caseNumber = `CASE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          await tx.investigation.create({
            data: {
              tenantId, caseNumber,
              clientId: lot.clientId, lotId,
              categoryId: m.categoryId,
              qtyMissing: packed - m.deliveredQty,
              disappearedStage: 'delivery',
              responsibleUserId: userId,
              status: 'open',
              assignedTo: userId,
            },
          });
        }
      }

      return tx.lot.findUnique({
        where: { id: lotId },
        include: {
          items: { include: { category: true } },
          signatures: true,
          discrepancies: true,
          statusHistory: { orderBy: { occurredAt: 'asc' } },
        },
      });
    });
  }

  // ============ GET DELIVERY CHECKLIST ============
  // Returns the packed quantities as a checklist for the delivery boy.
  async getDeliveryChecklist(tenantId: string, lotId: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, tenantId },
      include: {
        items: { include: { category: true } },
        client: { select: { id: true, name: true, code: true, businessType: true, address: true, lat: true, lng: true, mapsUrl: true, contacts: { where: { isPrimary: true }, take: 1 } } },
      },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const checklist = lot.items.map((li) => ({
      categoryId: li.categoryId,
      categoryName: li.category.name,
      icon: li.category.icon,
      packedQty: li.packingQty ?? li.taggingQty ?? li.pickupQty,
      deliveredQty: li.deliveredQty ?? 0,
      pending: (li.packingQty ?? li.taggingQty ?? li.pickupQty) - (li.deliveredQty ?? 0),
    }));

    return {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      client: lot.client,
      checklist,
      totalPacked: lot.totalPackedQty,
      totalDelivered: lot.totalDeliveredQty,
      hasPending: lot.hasPending,
    };
  }
}

// ============ DTOs ============
export class DeliverDto {
  items!: { categoryId: string; deliveredQty: number }[];
  signature?: { signerName: string; mediaId?: string };
  deliverySignature?: { signerName: string; mediaId?: string };
  gps?: { lat: number; lng: number; accuracy?: number };
  disputeNote?: string;
  disputePhotos?: string[];
}