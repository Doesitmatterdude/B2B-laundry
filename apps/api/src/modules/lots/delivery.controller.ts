import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { DeliveryService, DeliverDto } from './delivery.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.6 — Return delivery endpoints (M4)
// GET  /lots/:id/checklist  — delivery checklist (packed counts)
// POST /lots/:id/deliver    — record delivery + signatures + pending

@Controller('lots')
export class DeliveryController {
  constructor(private svc: DeliveryService) {}

  @Get(':id/checklist')
  @Roles('ADMIN', 'DELIVERY', 'CLIENT')
  @Permissions('lot:read')
  checklist(@Req() req: any, @Param('id') id: string) {
    return this.svc.getDeliveryChecklist(req.tenantId, id);
  }

  @Post(':id/deliver')
  @Roles('ADMIN', 'DELIVERY')
  @Permissions('lot:deliver')
  deliver(@Req() req: any, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.svc.deliverLot(req.tenantId, req.user.sub, id, dto);
  }
}