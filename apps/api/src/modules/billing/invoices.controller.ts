import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { InvoicesService, GenerateInvoiceDto } from './invoices.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.9 — Invoices
// POST   /invoices/generate  — generate draft from lots
// GET    /invoices           — list with filters
// GET    /invoices/:id       — detail + lines + payments
// POST   /invoices/:id/issue — finalize (draft → issued)
// POST   /invoices/:id/void  — void with reason
// GET    /clients/:id/ledger — outstanding + ledger entries

@Controller()
export class InvoicesController {
  constructor(private svc: InvoicesService) {}

  @Post('invoices/generate')
  @Roles('ADMIN')
  @Permissions('invoice:create')
  generate(@Req() req: any, @Body() dto: GenerateInvoiceDto) {
    return this.svc.generate(req.tenantId, dto);
  }

  @Get('invoices')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('invoice:read')
  list(@Req() req: any, @Query() q: any) {
    if (req.clientId) q.clientId = req.clientId;
    return this.svc.list(req.tenantId, q);
  }

  @Get('invoices/:id')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('invoice:read')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(req.tenantId, id);
  }

  @Post('invoices/:id/issue')
  @Roles('ADMIN')
  @Permissions('invoice:create')
  issue(@Req() req: any, @Param('id') id: string) {
    return this.svc.issue(req.tenantId, id);
  }

  @Post('invoices/:id/void')
  @Roles('ADMIN')
  @Permissions('invoice:create')
  void(@Req() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.svc.voidInvoice(req.tenantId, id, body.reason);
  }

  @Get('clients/:clientId/ledger')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('invoice:read')
  ledger(@Req() req: any, @Param('clientId') clientId: string) {
    if (req.clientId && req.clientId !== clientId) {
      return { error: { code: 'FORBIDDEN', message: 'Cannot view other clients' } };
    }
    return this.svc.getLedger(req.tenantId, clientId);
  }
}