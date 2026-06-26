import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { PortalService } from './portal.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.10 — Client Portal endpoints
// All routes are CLIENT-scoped (req.clientId from JWT).
// GET /portal/overview     — home dashboard
// GET /portal/history      — pickup/delivery history
// GET /portal/pending      — pending/missing/damaged
// GET /portal/invoices     — invoices
// GET /portal/schedule     — pickup/delivery schedule
// GET /portal/announcements — announcements
// GET /portal/receipts/:lotId — digital receipt for a lot

@Controller('portal')
@Roles('CLIENT')
@Permissions('client:read')
export class PortalController {
  constructor(private svc: PortalService) {}

  @Get('overview')
  overview(@Req() req: any) {
    return this.svc.overview(req.tenantId, req.clientId);
  }

  @Get('history')
  history(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.history(req.tenantId, req.clientId, page ? +page : 1, limit ? +limit : 20);
  }

  @Get('pending')
  pending(@Req() req: any) {
    return this.svc.pending(req.tenantId, req.clientId);
  }

  @Get('invoices')
  invoices(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.invoices(req.tenantId, req.clientId, page ? +page : 1, limit ? +limit : 20);
  }

  @Get('schedule')
  schedule(@Req() req: any) {
    return this.svc.schedule(req.tenantId, req.clientId);
  }

  @Get('announcements')
  announcements(@Req() req: any) {
    return this.svc.announcements(req.tenantId);
  }

  @Get('receipts/:lotId')
  receipt(@Req() req: any, @Param('lotId') lotId: string) {
    return this.svc.receipt(req.tenantId, req.clientId, lotId);
  }
}