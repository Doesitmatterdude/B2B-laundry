import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// M6: Analytics — daily/weekly/monthly/yearly summaries,
// MoM/YoY comparisons, time series, heatmap, business/category-wise stats.
// Uses pre-aggregated analytics_daily_rollups + on-the-fly queries.
// SRS 15.2, 13.8.

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // ============ SUMMARY (by range) ============
  async getSummary(tenantId: string, range: string, from?: string, to?: string) {
    const { startDate, endDate } = this.resolveRange(range, from, to);

    const [lots, revenue, clothCount, missing, damaged, deliveries] = await Promise.all([
      this.prisma.lot.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, issuedAt: { gte: startDate, lte: endDate }, status: { not: 'void' } },
        _sum: { totalPaise: true },
      }),
      this.prisma.lot.aggregate({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalPickupQty: true },
      }),
      this.prisma.discrepancy.count({
        where: { tenantId, type: 'missing', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.defect.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.lot.count({
        where: { tenantId, deliveredAt: { gte: startDate, lte: endDate } },
      }),
    ]);

    // Average TAT
    const tatAgg = await this.prisma.lot.aggregate({
      where: { tenantId, tatMinutes: { not: null }, deliveredAt: { gte: startDate, lte: endDate } },
      _avg: { tatMinutes: true },
    });

    // Client growth (new clients in period)
    const newClients = await this.prisma.client.count({
      where: { tenantId, createdAt: { gte: startDate, lte: endDate }, deletedAt: null },
    });

    return {
      range, from: startDate.toISOString().split('T')[0], to: endDate.toISOString().split('T')[0],
      lots, deliveries, clothCount: clothCount._sum.totalPickupQty ?? 0,
      revenuePaise: revenue._sum.totalPaise?.toString() ?? '0',
      missing, damaged,
      avgTatMinutes: Math.round(tatAgg._avg.tatMinutes ?? 0),
      newClients,
    };
  }

  // ============ COMPARISON (MoM or YoY) ============
  async getComparison(tenantId: string, metric: string, basis: string) {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    let prevStart: Date, prevEnd: Date, lyStart: Date, lyEnd: Date;

    if (basis === 'mom') {
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else {
      // yoy
      prevStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      prevEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0, 23, 59, 59);
    }
    lyStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    lyEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0, 23, 59, 59);

    const [current, previous, lastYear] = await Promise.all([
      this.getMetricValue(tenantId, metric, currentMonthStart, currentMonthEnd),
      this.getMetricValue(tenantId, metric, prevStart, prevEnd),
      this.getMetricValue(tenantId, metric, lyStart, lyEnd),
    ]);

    const momChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const yoyChange = lastYear > 0 ? ((current - lastYear) / lastYear) * 100 : 0;

    return {
      metric, basis,
      current, previous, lastYear,
      momChangePct: Math.round(momChange * 100) / 100,
      yoyChangePct: Math.round(yoyChange * 100) / 100,
    };
  }

  // ============ TIME SERIES (for charts) ============
  async getSeries(tenantId: string, metric: string, from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = to ? new Date(to) : new Date();

    // Daily aggregation using rollups if available, else on-the-fly
    const days: { date: string; value: number }[] = [];
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= endDate) {
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);
      const value = await this.getMetricValue(tenantId, metric, cursor, dayEnd);
      days.push({ date: cursor.toISOString().split('T')[0], value });
      cursor.setDate(cursor.getDate() + 1);
    }

    return { metric, series: days };
  }

  // ============ HEATMAP (workload: day-of-week × hour) ============
  async getHeatmap(tenantId: string, from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to) : new Date();

    const lots = await this.prisma.lot.findMany({
      where: { tenantId, pickupAt: { gte: startDate, lte: endDate } },
      select: { pickupAt: true, totalPickupQty: true },
    });

    // Build 7×24 grid (day-of-week × hour)
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const lot of lots) {
      if (!lot.pickupAt) continue;
      const d = new Date(lot.pickupAt);
      grid[d.getDay()][d.getHours()] += lot.totalPickupQty;
    }

    return {
      grid, // grid[dayOfWeek][hour] = cloth count
      labels: { days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hours: Array.from({ length: 24 }, (_, i) => i) },
    };
  }

  // ============ BUSINESS-WISE STATS ============
  async getBusinessStats(tenantId: string, from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = to ? new Date(to) : new Date();

    const clients = await this.prisma.client.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, name: true, code: true, businessType: true,
        lots: {
          where: { createdAt: { gte: startDate, lte: endDate } },
          select: { totalPickupQty: true, status: true },
        },
        invoices: {
          where: { issuedAt: { gte: startDate, lte: endDate }, status: { not: 'void' } },
          select: { totalPaise: true },
        },
      },
    });

    return clients.map((c) => ({
      clientId: c.id, name: c.name, code: c.code, businessType: c.businessType,
      lotCount: c.lots.length,
      clothCount: c.lots.reduce((s, l) => s + l.totalPickupQty, 0),
      completedCount: c.lots.filter((l) => l.status === 'completed').length,
      revenuePaise: c.invoices.reduce((s, i) => s + Number(i.totalPaise), 0).toString(),
    }));
  }

  // ============ CATEGORY-WISE STATS ============
  async getCategoryStats(tenantId: string, from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = to ? new Date(to) : new Date();

    const items = await this.prisma.lotItem.findMany({
      where: {
        tenantId,
        lot: { createdAt: { gte: startDate, lte: endDate } },
      },
      include: { category: true },
    });

    const catMap = new Map<string, { name: string; icon: string; qty: number; revenuePaise: bigint }>();
    for (const item of items) {
      const key = item.categoryId;
      if (!catMap.has(key)) {
        catMap.set(key, { name: item.category.name, icon: item.category.icon ?? '👕', qty: 0, revenuePaise: 0n });
      }
      const c = catMap.get(key)!;
      c.qty += item.pickupQty;
      c.revenuePaise += (item.ratePaise ?? 0n) * BigInt(item.pickupQty);
    }

    return Array.from(catMap.values()).map((c) => ({
      ...c, revenuePaise: c.revenuePaise.toString(),
    })).sort((a, b) => b.qty - a.qty);
  }

  // ============ HELPERS ============
  private async getMetricValue(tenantId: string, metric: string, start: Date, end: Date): Promise<number> {
    switch (metric) {
      case 'revenue': {
        const r = await this.prisma.invoice.aggregate({
          where: { tenantId, issuedAt: { gte: start, lte: end }, status: { not: 'void' } },
          _sum: { totalPaise: true },
        });
        return Number(r._sum.totalPaise ?? 0n);
      }
      case 'clothCount':
      case 'cloth_volume': {
        const r = await this.prisma.lot.aggregate({
          where: { tenantId, createdAt: { gte: start, lte: end } },
          _sum: { totalPickupQty: true },
        });
        return r._sum.totalPickupQty ?? 0;
      }
      case 'lots':
      case 'pickups': {
        return this.prisma.lot.count({ where: { tenantId, createdAt: { gte: start, lte: end } } });
      }
      case 'deliveries': {
        return this.prisma.lot.count({ where: { tenantId, deliveredAt: { gte: start, lte: end } } });
      }
      case 'missing': {
        return this.prisma.discrepancy.count({
          where: { tenantId, type: 'missing', createdAt: { gte: start, lte: end } },
        });
      }
      case 'damaged': {
        return this.prisma.defect.count({
          where: { tenantId, createdAt: { gte: start, lte: end } },
        });
      }
      case 'clients': {
        return this.prisma.client.count({
          where: { tenantId, createdAt: { gte: start, lte: end }, deletedAt: null },
        });
      }
      default:
        return 0;
    }
  }

  private resolveRange(range: string, from?: string, to?: string) {
    if (from && to) return { startDate: new Date(from), endDate: new Date(to) };
    const now = new Date();
    switch (range) {
      case 'daily':
        return { startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()), endDate: now };
      case 'weekly': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { startDate: weekAgo, endDate: now };
      }
      case 'monthly':
        return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: now };
      case 'yearly':
        return { startDate: new Date(now.getFullYear(), 0, 1), endDate: now };
      default:
        return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: now };
    }
  }
}