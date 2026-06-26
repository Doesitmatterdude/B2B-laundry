import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { CategoriesService, CreateCategoryDto, UpdateCategoryDto } from './categories.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.4: /clients/:id/categories
// Workers (TAGGER/PACKER/DELIVERY) can read categories for assigned clients.
// Only ADMIN can manage (create/update/delete) categories.

@Controller('clients/:clientId/categories')
export class CategoriesController {
  constructor(private svc: CategoriesService) {}

  @Get()
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  @Permissions('client:read')
  list(@Req() req: any, @Param('clientId') clientId: string, @Query('active') active?: string) {
    return this.svc.list(req.tenantId, clientId, active === 'true');
  }

  @Post()
  @Roles('ADMIN')
  @Permissions('category:manage')
  create(@Req() req: any, @Param('clientId') clientId: string, @Body() dto: CreateCategoryDto) {
    return this.svc.create(req.tenantId, clientId, dto);
  }

  @Post('seed-template')
  @Roles('ADMIN')
  @Permissions('category:manage')
  seedTemplate(@Req() req: any, @Param('clientId') clientId: string, @Query('businessType') bt: string) {
    return this.svc.seedFromTemplate(req.tenantId, clientId, bt);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @Permissions('category:manage')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.svc.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @Permissions('category:manage')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(req.tenantId, id);
  }
}