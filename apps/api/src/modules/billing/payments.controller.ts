import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { PaymentsService, RecordPaymentDto } from './payments.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.9 — Payments
// POST /payments       — record payment (UPI/cash/bank)
// GET  /payments       — list with filters

@Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Post()
  @Roles('ADMIN')
  @Permissions('payment:record')
  record(@Req() req: any, @Body() dto: RecordPaymentDto) {
    return this.svc.record(req.tenantId, req.user.sub, dto);
  }

  @Get()
  @Roles('ADMIN', 'CLIENT')
  @Permissions('invoice:read')
  list(@Req() req: any, @Query() q: any) {
    if (req.clientId) q.clientId = req.clientId;
    return this.svc.list(req.tenantId, q);
  }
}