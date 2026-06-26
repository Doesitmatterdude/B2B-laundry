import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// Lots (consignments) — the operational heart.
// M2: pickup creation (COLLECTED), list, detail, lot item lines,
// dual signatures, GPS, photo refs. Idempotent via client-generated lotUuid.
// M3 will add tagging/packing/status endpoints. SRS 10.1, 13.6.

@Injectable()
export class LotsService {
  constructor(private prisma: PrismaService) {}

  // ---------- CREATE PICKUP (COLLECTED) ----------
  // Idempotent: if lotUuid already exists, return the existing lot (no duplicate).
  async createPickup(tenantId: string, userId: string, dto: PickupDto) {
    // Idempotency check
    if (dto.lotUuid) {
      const existing = await this.prisma.lot.findFirst({
        where: { tenantId, lotNumber: dto.lotUuid },
      });
      if (existing) return this.getById(tenantId, existing.id);
    }

    // Validate client exists and is active
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId, status: 'active', deletedAt: null },
      include: { categories: { where: { active: true } } },
    });
    if (!client) throw new NotFoundException('Client not found or inactive');

    // Validate category IDs belong to this client
    const validCatIds = new Set(client.categories.map((c) => c.id));
    for (const item of dto.items) {
      if (!validCatIds.has(item.categoryId)) {
        throw new BadRequestException(`Category ${item.categoryId} not valid for this client`);
      }
    }

    // Total quantity
    const totalQty = dto.items.reduce((sum, i) => sum + (i.pickupQty ?? 0), 0);
    if (totalQty === 0 && !dto.emptyPickup) {
      throw new BadRequestException('Total quantity is 0 — set emptyPickup=true to confirm an empty pickup');
    }

    // Generate lot number: LOT-{YYYY}-{sequence}
    const year = new Date().getFullYear();
    const lotNumber = dto.lotUuid ?? await this.nextLotNumber(tenantId, year);

    // Snapshot rate from current rate card for billing
    const currentRateCard = await this.prisma.rateCard.findFirst({
      where: { tenantId, clientId: client.id, effectiveTo: null },
      include: { items: true },
    });
    const rateMap = new Map(
      (currentRateCard?.items ?? []).map((i) => [i.categoryId, i.ratePaise]),
    );

    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lot.create({
        data: {
          tenantId,
          clientId: dto.clientId,
          lotNumber,
          status: 'collected',
          pickupUserId: userId,
          pickupAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
          pickupLat: dto.gps?.lat,
          pickupLng: dto.gps?.lng,
          pickupGpsAccuracy: dto.gps?.accuracy,
          totalPickupQty: totalQty,
          notes: dto.notes,
          hasPending: false,
        },
      });

      // Lot item lines (per category)
      for (const item of dto.items) {
        await tx.lotItem.create({
          data: {
            tenantId,
            lotId: lot.id,
            categoryId: item.categoryId,
            pickupQty: item.pickupQty ?? 0,
            unit: item.unit ?? client.defaultUnit,
            ratePaise: rateMap.get(item.categoryId) ?? null,
          },
        });
      }

      // Signatures
      if (dto.signatures) {
        for (const sig of dto.signatures) {
          await tx.signature.create({
            data: {
              tenantId,
              lotId: lot.id,
              context: 'pickup',
              signerRole: sig.signerRole,
              signerName: sig.signerName,
              mediaFileId: sig.mediaId,
            },
          });
        }
      }

      // Photo proof — register media files linked to this lot
      if (dto.photos) {
        for (const photoId of dto.photos) {
          await tx.mediaFile.updateMany({
            where: { id: photoId, tenantId },
            data: { refTable: 'lots', refId: lot.id, context: 'pickup' },
          });
        }
      }

      // Status history entry
      await tx.lotStatusHistory.create({
        data: {
          tenantId,
          lotId: lot.id,
          status: 'collected',
          actorUserId: userId,
          occurredAt: lot.pickupAt!,
          meta: { gps: dto.gps, totalQty },
        },
      });

      return tx.lot.findUnique({
        where: { id: lot.id },
        include: {
          items: { include: { category: true } },
          signatures: true,
          client: { select: { id: true, name: true, code: true, businessType: true } },
        },
      });
    });
  }

  // ---------- LIST ----------
  async list(tenantId: string, opts: {
    status?: string; clientId?: string; dateFrom?: string; dateTo?: string;
    q?: string; page?: number; limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const where: Prisma.LotWhereInput = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.clientId) where.clientId = opts.clientId;
    if (opts.q) where.lotNumber = { contains: opts.q, mode: 'insensitive' };
    if (opts.dateFrom || opts.dateTo) {
      where.pickupAt = {};
      if (opts.dateFrom) where.pickupAt.gte = new Date(opts.dateFrom);
      if (opts.dateTo) where.pickupAt.lte = new Date(opts.dateTo);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { select: { id: true, name: true, code: true, businessType: true } },
          _count: { select: { items: true, discrepancies: true, defects: true } },
        },
      }),
      this.prisma.lot.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // ---------- GET BY ID ----------
  async getById(tenantId: string, id: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { category: true } },
        statusHistory: { orderBy: { occurredAt: 'asc' } },
        signatures: true,
        discrepancies: true,
        defects: true,
        client: { select: { id: true, name: true, code: true, businessType: true, address: true, lat: true, lng: true, mapsUrl: true } },
      },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    return lot;
  }

  // ---------- GET TODAY'S ROUTE (for delivery boy) ----------
  // Returns sorted stops: pickups + returns for today, for clients assigned to this user.
  async getRouteForUser(tenantId: string, userId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const dayOfWeek = targetDate.getDay(); // 0=Sun..6=Sat

    // Find clients assigned to this delivery user
    const assignments = await this.prisma.workerAssignment.findMany({
      where: { tenantId, userId, roleCode: 'DELIVERY' },
      include: {
        client: {
          include: {
            schedule: true,
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
    });

    const stops: any[] = [];

    for (const a of assignments) {
      const client = a.client;
      if (client.status !== 'active' || client.deletedAt) continue;

      // Check if today is a pickup day
      const isPickupDay = client.schedule?.pickupDays?.includes(dayOfWeek) ?? false;
      // Check if today is a delivery day
      const isDeliveryDay = client.schedule?.deliveryDays?.includes(dayOfWeek) ?? false;

      // Pending issues: open discrepancies/investigations
      const pendingDiscrepancies = await this.prisma.discrepancy.count({
        where: { lot: { clientId: client.id, tenantId }, resolved: false },
      });
      const openInvestigations = await this.prisma.investigation.count({
        where: { clientId: client.id, tenantId, status: { in: ['open', 'investigating'] } },
      });

      // Last pickup
      const lastLot = await this.prisma.lot.findFirst({
        where: { clientId: client.id, tenantId, status: { not: 'collected' } },
        orderBy: { pickupAt: 'desc' },
        select: { pickupAt: true, totalPickupQty: true, lotNumber: true },
      });

      // Packed lots ready for delivery (status = ready)
      const readyLots = await this.prisma.lot.findMany({
        where: { clientId: client.id, tenantId, status: 'ready' },
        select: { id: true, lotNumber: true, totalPackedQty: true },
      });

      const contact = client.contacts[0];

      if (isPickupDay) {
        stops.push({
          type: 'pickup',
          clientId: client.id,
          clientName: client.name,
          businessType: client.businessType,
          contactPhone: contact?.phone,
          mapsUrl: client.mapsUrl,
          lat: client.lat,
          lng: client.lng,
          window: `${client.schedule?.pickupWindowStart ?? ''}-${client.schedule?.pickupWindowEnd ?? ''}`,
          pendingIssues: pendingDiscrepancies + openInvestigations,
          lastPickup: lastLot ? { date: lastLot.pickupAt, qty: lastLot.totalPickupQty } : null,
          status: 'pending',
        });
      }

      if (isDeliveryDay && readyLots.length > 0) {
        stops.push({
          type: 'return',
          clientId: client.id,
          clientName: client.name,
          businessType: client.businessType,
          contactPhone: contact?.phone,
          mapsUrl: client.mapsUrl,
          lat: client.lat,
          lng: client.lng,
          window: `${client.schedule?.deliveryWindowStart ?? ''}-${client.schedule?.deliveryWindowEnd ?? ''}`,
          pendingIssues: pendingDiscrepancies + openInvestigations,
          readyLots,
          status: 'pending',
        });
      }
    }

    // Sort: pickups first (by window), then returns
    stops.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'pickup' ? -1 : 1;
      return (a.window ?? '').localeCompare(b.window ?? '');
    });

    // Assign sort_order
    stops.forEach((s, i) => (s.sortOrder = i + 1));

    return { data: stops, meta: { date: targetDate.toISOString().split('T')[0], total: stops.length } };
  }

  // ---------- HELPERS ----------
  private async nextLotNumber(tenantId: string, year: number): Promise<string> {
    const count = await this.prisma.lot.count({
      where: { tenantId, createdAt: { gte: new Date(`${year}-01-01`) } },
    });
    return `LOT-${year}-${String(count + 1).padStart(6, '0')}`;
  }
}

// ---------- DTOs ----------
export class PickupDto {
  lotUuid?: string;        // client-generated for idempotency
  clientId!: string;
  items!: { categoryId: string; pickupQty: number; unit?: string }[];
  gps?: { lat: number; lng: number; accuracy?: number };
  signatures?: { signerRole: string; signerName?: string; mediaId?: string }[];
  photos?: string[];       // media_file IDs
  notes?: string;
  emptyPickup?: boolean;
  capturedAt?: string;     // ISO timestamp (for offline sync)
}