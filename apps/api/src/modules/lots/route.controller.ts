import { Controller, Get, Query, Req } from '@nestjs/common';
import { LotsService } from './lots.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.5 — Schedule (Field)
// GET /me/route/today       — delivery boy's sorted stops for today
// GET /me/route?date=...    — route for a specific date

@Controller('me/route')
@Roles('ADMIN', 'DELIVERY')
@Permissions('schedule:read')
export class RouteController {
  constructor(private svc: LotsService) {}

  @Get('today')
  today(@Req() req: any) {
    return this.svc.getRouteForUser(req.tenantId, req.user.sub);
  }

  @Get()
  byDate(@Req() req: any, @Query('date') date?: string) {
    return this.svc.getRouteForUser(req.tenantId, req.user.sub, date);
  }
}