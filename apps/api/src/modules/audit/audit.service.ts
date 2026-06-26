import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// M8: Audit log query service. Audit logs are append-only (written by
// guards/interceptors/services throughout the app). This module provides
// read-only query endpoints for Admin. SRS 19.2, FR-120.

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string, opts: {
    action?: string; entityType?: string; entityId?: string;
    actorUserId?: string; from?: string; to?: string;
    page?: number; limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const where: Prisma.AuditLogWhereInput = { tenantId };
    if (opts.action) where.action = opts.action;
    if (opts.entityType) where.entityType = opts.entityType;
    if (opts.entityId) where.entityId = opts.entityId;
    if (opts.actorUserId) where.actorUserId = opts.actorUserId;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = new Date(opts.from);
      if (opts.to) where.createdAt.lte = new Date(opts.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  async getActivityLogs(tenantId: string, userId?: string, page = 1, limit = 50) {
    const where: Prisma.ActivityLogWhereInput = { tenantId };
    if (userId) where.userId = userId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // Get audit trail for a specific entity (e.g., a lot or invoice)
  async getEntityTrail(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }
}