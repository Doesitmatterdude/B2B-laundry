import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  InvestigationsService, CreateInvestigationDto, UpdateInvestigationDto, EventDto, ResolveDto,
} from './investigations.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.7 — Investigations
// GET    /investigations           — list with filters
// POST   /investigations           — manual create
// GET    /investigations/:id       — full case + events
// PATCH  /investigations/:id       — update assignee/stage/status
// POST   /investigations/:id/events — add comment/evidence
// POST   /investigations/:id/resolve — resolve (recovered/compensation/closed)

@Controller('investigations')
export class InvestigationsController {
  constructor(private svc: InvestigationsService) {}

  @Get()
  @Roles('ADMIN', 'CLIENT')
  @Permissions('investigation:manage')
  list(@Req() req: any, @Query() q: any) {
    // CLIENT users: scope to their own client_id
    const opts = { ...q };
    if (req.clientId) opts.clientId = req.clientId;
    return this.svc.list(req.tenantId, opts);
  }

  @Post()
  @Roles('ADMIN')
  @Permissions('investigation:manage')
  create(@Req() req: any, @Body() dto: CreateInvestigationDto) {
    return this.svc.create(req.tenantId, req.user.sub, dto);
  }

  @Get(':id')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('investigation:manage')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(req.tenantId, id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @Permissions('investigation:manage')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateInvestigationDto) {
    return this.svc.update(req.tenantId, id, dto);
  }

  @Post(':id/events')
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  @Permissions('investigation:manage')
  addEvent(@Req() req: any, @Param('id') id: string, @Body() dto: EventDto) {
    return this.svc.addEvent(req.tenantId, id, req.user.sub, dto);
  }

  @Post(':id/resolve')
  @Roles('ADMIN')
  @Permissions('investigation:manage')
  resolve(@Req() req: any, @Param('id') id: string, @Body() dto: ResolveDto) {
    return this.svc.resolve(req.tenantId, id, req.user.sub, dto);
  }
}