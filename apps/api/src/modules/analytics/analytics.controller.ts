import { Controller, Get, Query, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.8, 15.2 — Analytics endpoints
// GET /analytics/summary     — ?range=daily|weekly|monthly|yearly&from&to
// GET /analytics/compare     — ?metric=revenue&basis=mom|yoy
// GET /analytics/series      — ?metric=revenue&from&to (time series for charts)
// GET /analytics/heatmap     — workload heatmap (day×hour)
// GET /analytics/workers     — worker productivity (alias to dashboard)
// GET /analytics/clients     — business-wise stats
// GET /analytics/categories  — category-wise stats

@Controller('analytics')
@Roles('ADMIN')
@Permissions('analytics:view')
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}

  @Get('summary')
  summary(@Req() req: any, @Query() q: any) {
    return this.svc.getSummary(req.tenantId, q.range ?? 'monthly', q.from, q.to);
  }

  @Get('compare')
  compare(@Req() req: any, @Query('metric') metric: string, @Query('basis') basis: string) {
    return this.svc.getComparison(req.tenantId, metric || 'revenue', basis || 'mom');
  }

  @Get('series')
  series(@Req() req: any, @Query('metric') metric: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getSeries(req.tenantId, metric || 'revenue', from, to);
  }

  @Get('heatmap')
  heatmap(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getHeatmap(req.tenantId, from, to);
  }

  @Get('clients')
  businessStats(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getBusinessStats(req.tenantId, from, to);
  }

  @Get('categories')
  categoryStats(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getCategoryStats(req.tenantId, from, to);
  }
}