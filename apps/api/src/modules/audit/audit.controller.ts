import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 19.2, 13.x — Audit log endpoints (Admin only)
// GET /audit-logs           — query with filters
// GET /audit-logs/activity  — activity logs
// GET /audit-logs/:entityType/:entityId — entity trail

@Controller('audit-logs')
@Roles('ADMIN')
@Permissions('audit:read')
export class AuditController {
  constructor(private svc: AuditService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.list(req.tenantId, q);
  }

  @Get('activity')
  activity(@Req() req: any, @Query('userId') userId?: string, @Query('page') page?: string) {
    return this.svc.getActivityLogs(req.tenantId, userId, page ? +page : 1);
  }

  @Get(':entityType/:entityId')
  entityTrail(@Req() req: any, @Param('entityType') et: string, @Param('entityId') eid: string) {
    return this.svc.getEntityTrail(req.tenantId, et, eid);
  }
}