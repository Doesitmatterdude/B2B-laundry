import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Delete } from '@nestjs/common';
import {
  ClientsService, CreateClientDto, UpdateClientDto, ScheduleDto, ContactDto, RateCardDto, AssignmentDto,
} from './clients.service';
import { Roles, Permissions } from '../../common/decorators';

// REST contracts per SRS Section 13.4.
// All routes require ADMIN role (except client:read for CLIENT users on their own data).
// Tenant scope is injected from JWT via req.tenantId (TenantGuard).

@Controller('clients')
export class ClientsController {
  constructor(private svc: ClientsService) {}

  @Get()
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  @Permissions('client:read')
  list(@Req() req: any, @Query() q: any) {
    // CLIENT users are scoped to their own client_id (enforced in service via req.clientId).
    return this.svc.list(req.tenantId, q);
  }

  @Post()
  @Roles('ADMIN')
  @Permissions('client:create')
  create(@Req() req: any, @Body() dto: CreateClientDto) {
    return this.svc.create(req.tenantId, dto);
  }

  @Get(':id')
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  @Permissions('client:read')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(req.tenantId, id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @Permissions('client:edit')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.svc.update(req.tenantId, id, dto);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @Permissions('client:deactivate')
  deactivate(@Req() req: any, @Param('id') id: string) {
    return this.svc.setActivation(req.tenantId, id, false);
  }

  @Post(':id/activate')
  @Roles('ADMIN')
  @Permissions('client:deactivate')
  activate(@Req() req: any, @Param('id') id: string) {
    return this.svc.setActivation(req.tenantId, id, true);
  }

  // ---- Schedule ----
  @Get(':id/schedule')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('client:read')
  getSchedule(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(req.tenantId, id).then((c) => c.schedule);
  }

  @Put(':id/schedule')
  @Roles('ADMIN')
  @Permissions('client:edit')
  upsertSchedule(@Req() req: any, @Param('id') id: string, @Body() dto: ScheduleDto) {
    return this.svc.upsertSchedule(req.tenantId, id, dto);
  }

  // ---- Contacts ----
  @Get(':id/contacts')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('client:read')
  listContacts(@Req() req: any, @Param('id') id: string) {
    return this.svc.listContacts(req.tenantId, id);
  }

  @Post(':id/contacts')
  @Roles('ADMIN')
  @Permissions('client:edit')
  addContact(@Req() req: any, @Param('id') id: string, @Body() dto: ContactDto) {
    return this.svc.addContact(req.tenantId, id, dto);
  }

  // ---- Rate Cards ----
  @Get(':id/rate-cards')
  @Roles('ADMIN', 'CLIENT')
  @Permissions('client:read')
  listRateCards(@Req() req: any, @Param('id') id: string) {
    return this.svc.listRateCards(req.tenantId, id);
  }

  @Post(':id/rate-cards')
  @Roles('ADMIN')
  @Permissions('client:edit')
  createRateCard(@Req() req: any, @Param('id') id: string, @Body() dto: RateCardDto) {
    return this.svc.createRateCard(req.tenantId, id, dto);
  }

  // ---- Worker Assignments ----
  @Get(':id/assignments')
  @Roles('ADMIN')
  @Permissions('client:read')
  listAssignments(@Req() req: any, @Param('id') id: string) {
    return this.svc.listAssignments(req.tenantId, id);
  }

  @Post(':id/assignments')
  @Roles('ADMIN')
  @Permissions('client:edit')
  addAssignment(@Req() req: any, @Param('id') id: string, @Body() dto: AssignmentDto) {
    return this.svc.addAssignment(req.tenantId, id, dto);
  }

  @Delete(':id/assignments/:assignmentId')
  @Roles('ADMIN')
  @Permissions('client:edit')
  removeAssignment(@Req() req: any, @Param('id') id: string, @Param('assignmentId') aid: string) {
    return this.svc.removeAssignment(req.tenantId, id, aid);
  }
}