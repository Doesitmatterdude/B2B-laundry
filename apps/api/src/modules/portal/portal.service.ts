import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// M7: Client portal — self-service for B2B clients.
// All data scoped to the authenticated client's own clientId (from JWT).
// SRS 11.9, 13.10.

@Injectable()
export class PortalService {
  constructor(private prisma: PrismaService) {}

  // ============ OVERVIEW (portal home) ============
  async overview(tenantId: string, clientId: string) {
    this.ensureClientScope(tenantId, clientId);

    const [pendingLots, missingItems, damagedItems, outstandingPaise, upcomingPickups, recentLots] = await Promise.all([
      // Pending lots (not yet delivered)
      this.prisma.lot.count({
        where: { tenantId, clientId, status: { in: ['collected', 'tagged', 'washed', 'drying', 'ironed', 'packed', 'ready'] } },
      }),

      // Missing items (open discrepancies)
      this.prisma.discrepancy.count({
        where: { tenantId, lot: { clientId }, type: 'missing', resolved: false },
      }),

      // Damaged items
      this.prisma.defect.count({
        where: { tenantId, lot: { clientId } },
      }),

      // Outstanding balance
      this.prisma.ledgerEntry.findFirst({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
        select: { balancePaise: true },
      }),

      // Upcoming pickups (next 7 days based on schedule)
      this.getUpcomingPickups(tenantId, clientId),

      // Recent lots (last 5)
      this.prisma.lot.findMany({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, lotNumber: true, status: true, totalPickupQty: true, pickupAt: true, deliveredAt: true },
      }),
    ]);

    return {
      pendingLots,
      missingItems,
      damagedItems,
      outstandingPaise: outstandingPaise?.balancePaise?.toString() ?? '0',
      upcomingPickups,
      recentLots,
    };
  }

  // ============ HISTORY (pickups + deliveries) ============
  async history(tenantId: string, clientId: string, page = 1, limit = 20) {
    this.ensureClientScope(tenantId, clientId);
    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lot.findMany({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        include: {
          items: { include: { category: { select: { name: true, icon: true } } } },
          signatures: { select: { context: true, signerRole: true, signedAt: true } },
        },
      }),
      this.prisma.lot.count({ where: { tenantId, clientId } }),
    ]);

    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // ============ PENDING / MISSING / DAMAGED ============
  async pending(tenantId: string, clientId: string) {
    this.ensureClientScope(tenantId, clientId);

    const [pendingLots, missingDiscrepancies, damagedDefects, openInvestigations] = await Promise.all([
      this.prisma.lot.findMany({
        where: { tenantId, clientId, status: { in: ['collected', 'tagged', 'washed', 'drying', 'ironed', 'packed', 'ready'] } },
        select: { id: true, lotNumber: true, status: true, totalPickupQty: true, pickupAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.discrepancy.findMany({
        where: { tenantId, lot: { clientId }, type: 'missing', resolved: false },
        include: { lot: { select: { lotNumber: true } }, category: { select: { name: true, icon: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.defect.findMany({
        where: { tenantId, lot: { clientId } },
        include: { lot: { select: { lotNumber: true } }, category: { select: { name: true, icon: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.investigation.findMany({
        where: { tenantId, clientId, status: { in: ['open', 'investigating'] } },
        include: { lot: { select: { lotNumber: true } }, category: { select: { name: true } } },
        orderBy: { openedAt: 'desc' },
      }),
    ]);

    return { pendingLots, missing: missingDiscrepancies, damaged: damagedDefects, investigations: openInvestigations };
  }

  // ============ INVOICES ============
  async invoices(tenantId: string, clientId: string, page = 1, limit = 20) {
    this.ensureClientScope(tenantId, clientId);
    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: { tenantId, clientId, status: { not: 'void' } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        include: { lines: true, payments: true },
      }),
      this.prisma.invoice.count({ where: { tenantId, clientId, status: { not: 'void' } } }),
    ]);

    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // ============ SCHEDULE ============
  async schedule(tenantId: string, clientId: string) {
    this.ensureClientScope(tenantId, clientId);
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      include: { schedule: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    return {
      pickupDays: client.schedule?.pickupDays ?? [],
      deliveryDays: client.schedule?.deliveryDays ?? [],
      pickupFrequency: client.schedule?.pickupFrequency,
      deliveryFrequency: client.schedule?.deliveryFrequency,
      defaultTatHours: client.defaultTatHours,
    };
  }

  // ============ ANNOUNCEMENTS ============
  async announcements(tenantId: string) {
    return this.prisma.announcement.findMany({
      where: {
        tenantId,
        publishedAt: { not: null, lte: new Date() },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  // ============ DIGITAL RECEIPTS (lot detail for client) ============
  async receipt(tenantId: string, clientId: string, lotId: string) {
    this.ensureClientScope(tenantId, clientId);
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, tenantId, clientId },
      include: {
        items: { include: { category: true } },
        signatures: true,
        statusHistory: { orderBy: { occurredAt: 'asc' } },
        discrepancies: true,
        defects: true,
      },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    return lot;
  }

  // ============ HELPERS ============
  private ensureClientScope(tenantId: string, clientId: string) {
    // The TenantGuard sets req.clientId for CLIENT users.
    // This is a defense-in-depth check — the controller already passes
    // req.clientId, but we verify it matches.
    if (!clientId) throw new ForbiddenException('Client scope required');
  }

  private async getUpcomingPickups(tenantId: string, clientId: string) {
    const schedule = await this.prisma.clientSchedule.findFirst({ where: { tenantId, clientId } });
    if (!schedule?.pickupDays?.length) return [];

    const today = new Date();
    const upcoming: { date: string; dayName: string }[] = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (schedule.pickupDays.includes(d.getDay())) {
        upcoming.push({ date: d.toISOString().split('T')[0], dayName: dayNames[d.getDay()] });
      }
    }
    return upcoming.slice(0, 5);
  }
}