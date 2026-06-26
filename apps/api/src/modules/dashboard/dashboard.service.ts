import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// M6: Live admin dashboard — all KPIs for today (with date picker support).
// Real-time queries against lots/discrepancies/defects/invoices.
// SRS 15.1, 13.8.

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // ============ TODAY'S KPIs ============
  async getToday(tenantId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const [
      pickups, deliveries, pending, completed,
      missingToday, damagedToday, clientsServed,
      clothesInside, pendingPayments, pendingInvoices,
    ] = await Promise.all([
      // Today's pickups (lots created today)
      this.prisma.lot.count({
        where: { tenantId, createdAt: { gte: dayStart, lte: dayEnd } },
      }),

      // Today's deliveries
      this.prisma.lot.count({
        where: { tenantId, deliveredAt: { gte: dayStart, lte: dayEnd } },
      }),

      // Today's pending (not yet delivered, status before delivered)
      this.prisma.lot.count({
        where: {
          tenantId,
          status: { in: ['collected', 'tagged', 'washed', 'drying', 'ironed', 'packed', 'ready'] },
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      }),

      // Today's completed
      this.prisma.lot.count({
        where: {
          tenantId, status: 'completed',
          updatedAt: { gte: dayStart, lte: dayEnd },
        },
      }),

      // Today's missing (discrepancies type=missing created today)
      this.prisma.discrepancy.count({
        where: {
          tenantId, type: 'missing',
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      }),

      // Today's damaged (defects created today)
      this.prisma.defect.count({
        where: {
          tenantId,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      }),

      // Today's clients served (distinct clients with activity)
      this.prisma.lot.groupBy({
        by: ['clientId'],
        where: { tenantId, createdAt: { gte: dayStart, lte: dayEnd } },
        _count: { clientId: true },
      }),

      // Clothes currently inside the plant (status between tagged and ready)
      this.prisma.lotItem.aggregate({
        where: {
          tenantId, lot: { status: { in: ['tagged', 'washed', 'drying', 'ironed', 'packed', 'ready'] } },
        },
        _sum: { pickupQty: true },
      }),

      // Pending payments (outstanding across all clients)
      this.prisma.ledgerEntry.aggregate({
        where: { tenantId },
        _max: { balancePaise: true },
      }),

      // Pending invoices (draft + issued + overdue + partial)
      this.prisma.invoice.count({
        where: { tenantId, status: { in: ['draft', 'issued', 'partial', 'overdue'] } },
      }),
    ]);

    // Today's revenue (from issued invoices today)
    const revenueToday = await this.prisma.invoice.aggregate({
      where: {
        tenantId, issuedAt: { gte: dayStart, lte: dayEnd },
        status: { not: 'void' },
      },
      _sum: { totalPaise: true },
    });

    // Today's cloth count (total pickup qty today)
    const clothCountToday = await this.prisma.lot.aggregate({
      where: { tenantId, createdAt: { gte: dayStart, lte: dayEnd } },
      _sum: { totalPickupQty: true },
    });

    return {
      date: targetDate.toISOString().split('T')[0],
      pickups,
      deliveries,
      pending,
      completed,
      missing: missingToday,
      damaged: damagedToday,
      revenuePaise: revenueToday._sum.totalPaise?.toString() ?? '0',
      clothCount: clothCountToday._sum.totalPickupQty ?? 0,
      clientsServed: clientsServed.length,
      clothesInside: clothesInside._sum.pickupQty ?? 0,
      pendingPaymentsPaise: pendingPayments._max.balancePaise?.toString() ?? '0',
      pendingInvoices,
    };
  }

  // ============ CLOTHES CURRENTLY INSIDE (breakdown) ============
  async getInsideBreakdown(tenantId: string) {
    const byStatus = await this.prisma.lot.groupBy({
      by: ['status'],
      where: {
        tenantId,
        status: { in: ['collected', 'tagged', 'washed', 'drying', 'ironed', 'packed', 'ready'] },
      },
      _count: { id: true },
      _sum: { totalPickupQty: true },
    });
    return byStatus.map((s) => ({
      status: s.status,
      lots: s._count.id,
      clothCount: s._sum.totalPickupQty ?? 0,
    }));
  }

  // ============ ALERTS ============
  async getAlerts(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // SLA breaches
    const slaBreaches = await this.prisma.lot.count({
      where: { tenantId, slaBreached: true, status: { not: 'completed' } },
    });

    // Open investigations
    const openInvestigations = await this.prisma.investigation.count({
      where: { tenantId, status: { in: ['open', 'investigating'] } },
    });

    // Overdue invoices
    const overdueInvoices = await this.prisma.invoice.count({
      where: {
        tenantId, status: { in: ['issued', 'partial'] },
        dueDate: { lt: new Date() },
      },
    });

    // Unresolved discrepancies
    const unresolvedDiscrepancies = await this.prisma.discrepancy.count({
      where: { tenantId, resolved: false },
    });

    // Missing items today
    const missingToday = await this.prisma.discrepancy.count({
      where: { tenantId, type: 'missing', resolved: false, createdAt: { gte: today } },
    });

    return {
      slaBreaches,
      openInvestigations,
      overdueInvoices,
      unresolvedDiscrepancies,
      missingToday,
    };
  }

  // ============ WORKER PRODUCTIVITY ============
  async getWorkerProductivity(tenantId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Count status transitions per worker today
    const history = await this.prisma.lotStatusHistory.findMany({
      where: { tenantId, occurredAt: { gte: dayStart, lte: dayEnd }, actorUserId: { not: null } },
      include: { lot: { select: { totalPickupQty: true } } },
    });

    const workerMap = new Map<string, {
      userId: string; itemsProcessed: number; transitions: number;
      byStage: Record<string, number>;
    }>();

    for (const h of history) {
      const uid = h.actorUserId!;
      if (!workerMap.has(uid)) {
        workerMap.set(uid, { userId: uid, itemsProcessed: 0, transitions: 0, byStage: {} });
      }
      const w = workerMap.get(uid)!;
      w.transitions++;
      w.byStage[h.status] = (w.byStage[h.status] ?? 0) + 1;
      w.itemsProcessed += h.lot?.totalPickupQty ?? 0;
    }

    // Enrich with user names
    const userIds = Array.from(workerMap.keys());
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));

    return Array.from(workerMap.values()).map((w) => ({
      ...w,
      workerName: userMap.get(w.userId) ?? 'Unknown',
    }));
  }

  // ============ MACHINE UTILIZATION (if machine IDs captured) ============
  async getMachineUtilization(tenantId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const machines = await this.prisma.machine.findMany({ where: { tenantId } });
    const history = await this.prisma.lotStatusHistory.findMany({
      where: { tenantId, machineId: { not: null }, occurredAt: { gte: dayStart, lte: dayEnd } },
    });

    const utilMap = new Map<string, { machineId: string; cycles: number; totalMinutes: number }>();
    for (const h of history) {
      const mid = h.machineId!;
      if (!utilMap.has(mid)) utilMap.set(mid, { machineId: mid, cycles: 0, totalMinutes: 0 });
      const u = utilMap.get(mid)!;
      u.cycles++;
      u.totalMinutes += h.durationFromPrevMinutes ?? 0;
    }

    return machines.map((m) => {
      const u = utilMap.get(m.id);
      return {
        machineId: m.id, name: m.name, type: m.type,
        cycles: u?.cycles ?? 0,
        totalMinutes: u?.totalMinutes ?? 0,
        utilizationPct: Math.min(100, Math.round(((u?.totalMinutes ?? 0) / (24 * 60)) * 100)),
      };
    });
  }
}