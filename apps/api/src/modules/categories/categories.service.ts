import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// Per-client clothing categories. Workers see only the active categories
// for the client whose lot they're processing. SRS Section 9, 13.4.

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string, clientId: string, activeOnly = false) {
    const where: Prisma.CategoryWhereInput = { tenantId, clientId };
    if (activeOnly) where.active = true;
    return this.prisma.category.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(tenantId: string, clientId: string, dto: CreateCategoryDto) {
    await this.ensureClient(tenantId, clientId);
    const maxSort = await this.prisma.category.aggregate({
      where: { tenantId, clientId }, _max: { sortOrder: true },
    });
    return this.prisma.category.create({
      data: {
        tenantId, clientId,
        name: dto.name,
        code: dto.code,
        unit: dto.unit ?? 'item',
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1,
        washProgram: dto.washProgram,
        expectedWeightG: dto.expectedWeightG,
        active: dto.active ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const cat = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Category not found');
    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.washProgram !== undefined) data.washProgram = dto.washProgram;
    if (dto.expectedWeightG !== undefined) data.expectedWeightG = dto.expectedWeightG;
    if (dto.active !== undefined) data.active = dto.active;
    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    // Soft-deactivate rather than hard-delete to preserve historical lots.
    const cat = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.category.update({ where: { id }, data: { active: false } });
  }

  // Seed categories from a business-type template (SRS 9.4)
  async seedFromTemplate(tenantId: string, clientId: string, businessType: string) {
    await this.ensureClient(tenantId, clientId);
    const templates: Record<string, string[]> = {
      hotel: ['Bedsheet', 'Pillow Cover', 'Blanket', 'Bath Towel', 'Hand Towel', 'Bath Mat', 'Curtain', 'Chef Uniform', 'Table Cloth', 'Napkin', 'Duvet Cover'],
      hostel: ['Bedsheet', 'Pillow Cover', 'Blanket', 'Towel'],
      pg: ['Shirt', 'T-Shirt', 'Jeans', 'Track Pants', 'Pants', 'Shorts', 'Towel', 'Bedsheet', 'Blanket'],
      school: ['Uniform Shirt', 'Uniform Trouser', 'Sweater', 'Blazer', 'Sports Uniform', 'House T-Shirt', 'Tie'],
      coaching: ['Uniform', 'Curtain', 'Floor Mat', 'Table Cloth'],
    };
    const names = templates[businessType];
    if (!names) return [];
    let sort = 0;
    const created = [];
    for (const name of names) {
      const existing = await this.prisma.category.findUnique({
        where: { tenantId_clientId_name: { tenantId, clientId, name } },
      });
      if (!existing) {
        created.push(
          await this.prisma.category.create({
            data: { tenantId, clientId, name, sortOrder: sort++, unit: 'item' },
          }),
        );
      }
    }
    return created;
  }

  private async ensureClient(tenantId: string, clientId: string) {
    const c = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null } });
    if (!c) throw new NotFoundException('Client not found');
  }
}

export class CreateCategoryDto {
  name!: string;
  code?: string;
  unit?: string;
  icon?: string;
  sortOrder?: number;
  washProgram?: string;
  expectedWeightG?: number;
  active?: boolean;
}

export class UpdateCategoryDto {
  name?: string;
  code?: string;
  unit?: string;
  icon?: string;
  sortOrder?: number;
  washProgram?: string;
  expectedWeightG?: number;
  active?: boolean;
}