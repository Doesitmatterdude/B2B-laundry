import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { SupportService } from './support.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.10 — Support tickets
// GET  /tickets           — list (client: own only; admin: all)
// POST /tickets           — create ticket (client)
// POST /tickets/:id/messages — reply to ticket
// POST /tickets/:id/status   — update status (admin)

@Controller('tickets')
export class SupportController {
  constructor(private svc: SupportService) {}

  @Get()
  @Roles('ADMIN', 'CLIENT')
  @Permissions('client:read')
  list(@Req() req: any) {
    return this.svc.list(req.tenantId, req.clientId);
  }

  @Post()
  @Roles('CLIENT', 'ADMIN')
  @Permissions('client:read')
  create(@Req() req: any, @Body() dto: { subject: string; body: string; priority?: string }) {
    return this.svc.create(req.tenantId, req.clientId ?? req.body?.clientId, req.user.sub, dto);
  }

  @Post(':id/messages')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('client:read')
  reply(@Req() req: any, @Param('id') id: string, @Body() body: { body: string }) {
    return this.svc.reply(req.tenantId, id, req.user.sub, body.body);
  }

  @Post(':id/status')
  @Roles('ADMIN')
  @Permissions('client:read')
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: string }) {
    return this.svc.updateStatus(req.tenantId, id, body.status);
  }
}