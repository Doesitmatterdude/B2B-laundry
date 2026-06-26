import { Controller, Get, Query, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.8, 15.1 — Dashboard endpoints
// GET /dashboard/today      — live KPIs
// GET /dashboard/inside     — clothes inside plant breakdown
// GET /dashboard/alerts     — SLA/missing/payment alerts
// GET /dashboard/workers    — worker productivity
// GET /dashboard/machines   — machine utilization

@Controller('dashboard')
@Roles('ADMIN')
@Permissions('dashboard:view')
export class DashboardController {
  constructor(private svc: DashboardService) {}

  @Get('today')
  today(@Req() req: any, @Query('date') date?: string) {
    return this.svc.getToday(req.tenantId, date);
  }

  @Get('inside')
  inside(@Req() req: any) {
    return this.svc.getInsideBreakdown(req.tenantId);
  }

  @Get('alerts')
  alerts(@Req() req: any) {
    return this.svc.getAlerts(req.tenantId);
  }

  @Get('workers')
  workers(@Req() req: any, @Query('date') date?: string) {
    return this.svc.getWorkerProductivity(req.tenantId, date);
  }

  @Get('machines')
  machines(@Req() req: any, @Query('date') date?: string) {
    return this.svc.getMachineUtilization(req.tenantId, date);
  }
}