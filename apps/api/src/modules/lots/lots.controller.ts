import {
  Body, Controller, Get, Param, Post, Query, Req,
} from '@nestjs/common';
import { LotsService, PickupDto } from './lots.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.6 — Lots (Operations)
// POST /lots         — create pickup (COLLECTED), idempotent
// GET  /lots         — list with filters
// GET  /lots/:id     — full lot detail
// M3 will add: /lots/:id/tagging, /lots/:id/status, /lots/:id/packing, /lots/:id/deliver

@Controller('lots')
export class LotsController {
  constructor(private svc: LotsService) {}

  @Post()
  @Roles('ADMIN', 'DELIVERY')
  @Permissions('lot:create')
  createPickup(@Req() req: any, @Body() dto: PickupDto) {
    return this.svc.createPickup(req.tenantId, req.user.sub, dto);
  }

  @Get()
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  @Permissions('lot:read')
  list(@Req() req: any, @Query() q: any) {
    // CLIENT users: scope to their own client_id
    const opts = { ...q };
    if (req.clientId) opts.clientId = req.clientId;
    return this.svc.list(req.tenantId, opts);
  }

  @Get(':id')
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  @Permissions('lot:read')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(req.tenantId, id);
  }
}