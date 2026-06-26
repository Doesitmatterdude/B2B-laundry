import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { WorkflowService, TaggingDto, StatusDto, PackingDto } from './workflow.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.6 — Lot workflow endpoints (M3)
// POST /lots/:id/tagging   — tagger recount + reconciliation + defects
// POST /lots/:id/status    — advance wash pipeline status
// POST /lots/:id/packing   — packer three-way reconciliation

@Controller('lots')
export class WorkflowController {
  constructor(private svc: WorkflowService) {}

  @Post(':id/tagging')
  @Roles('ADMIN', 'TAGGER')
  @Permissions('lot:tag')
  submitTagging(@Req() req: any, @Param('id') id: string, @Body() dto: TaggingDto) {
    return this.svc.submitTagging(req.tenantId, req.user.sub, id, dto);
  }

  @Post(':id/status')
  @Roles('ADMIN', 'TAGGER', 'PACKER')
  @Permissions('lot:washstatus')
  advanceStatus(@Req() req: any, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.svc.advanceStatus(req.tenantId, req.user.sub, id, dto);
  }

  @Post(':id/packing')
  @Roles('ADMIN', 'PACKER')
  @Permissions('lot:pack')
  submitPacking(@Req() req: any, @Param('id') id: string, @Body() dto: PackingDto) {
    return this.svc.submitPacking(req.tenantId, req.user.sub, id, dto);
  }
}