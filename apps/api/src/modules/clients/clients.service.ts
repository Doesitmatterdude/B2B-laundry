import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

// Tenant-scoped data access: every query injects tenantId from the JWT
// (set by TenantGuard). Client users are further scoped to their own
// clientId (ownership scope). SRS 7.2, 8.x, 13.4.

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  // ---------- LIST ----------
  async list(tenantId: string, opts: {
    q?: string; businessType?: string; status?: string;
    page?: number; limit?: number; sort?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const where: Prisma.ClientWhereInput = { tenantId, deletedAt: null };
    if (opts.businessType) where.businessType = opts.businessType;
    if (opts.status) where.status = opts.status;
    if (opts.q) {
      where.OR = [
        { name: { contains: opts.q, mode: 'insensitive' } },
        { code: { contains: opts.q, mode: 'insensitive' } },
      ];
    }
    const orderBy: Prisma.ClientOrderByWithRelationInput = {};
    const sort = opts.sort ?? '-createdAt';
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    if (['createdAt', 'name', 'code', 'businessType', 'status'].includes(field)) {
      orderBy[field as keyof Prisma.ClientOrderByWithRelationInput] = desc ? 'desc' : 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where, orderBy, skip: (page - 1) * limit, take: limit,
        include: { contacts: { where: { isPrimary: true }, take: 1 }, _count: { select: { lots: true } } },
      }),
      this.prisma.client.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // ---------- GET ONE (360) ----------
  async getById(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contacts: true,
        schedule: true,
        rateCards: { orderBy: { effectiveFrom: 'desc' }, include: { items: true } },
        categories: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  // ---------- CREATE (wizard payload) ----------
  async create(tenantId: string, dto: CreateClientDto) {
    // Generate sequential code if not provided
    const code = dto.code ?? await this.nextCode(tenantId, dto.businessType);

    const existing = await this.prisma.client.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (existing) throw new ConflictException(`Client code ${code} already exists`);

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          tenantId, code,
          name: dto.name,
          businessType: dto.businessType,
          gstin: dto.gstin,
          legalName: dto.legalName,
          billingAddress: dto.billingAddress,
          address: dto.address,
          lat: dto.location?.lat,
          lng: dto.location?.lng,
          placeId: dto.location?.place_id,
          mapsUrl: dto.location?.maps_url,
          paymentTermsDays: dto.paymentTermsDays ?? 30,
          billingCycle: dto.billingCycle ?? 'monthly',
          billingDay: dto.billingDay ?? 1,
          creditLimitPaise: dto.creditLimitPaise ? BigInt(dto.creditLimitPaise) : 0n,
          defaultUnit: dto.defaultUnit ?? 'item',
          defaultTatHours: dto.defaultTatHours ?? 48,
          notes: dto.notes,
          tags: dto.tags ?? [],
        },
      });

      // Primary contact
      if (dto.contact) {
        await tx.clientContact.create({
          data: { tenantId, clientId: client.id, ...dto.contact, isPrimary: true },
        });
      }

      // Schedule
      if (dto.schedule) {
        await tx.clientSchedule.create({
          data: {
            tenantId, clientId: client.id,
            pickupDays: dto.schedule.pickupDays ?? [],
            deliveryDays: dto.schedule.deliveryDays ?? [],
            pickupFrequency: dto.schedule.pickupFrequency,
            deliveryFrequency: dto.schedule.deliveryFrequency,
          },
        });
      }

      // Seed categories from template if provided, or from dto.categories
      const catNames = dto.categories?.map((c) => c.name) ?? [];
      if (catNames.length > 0) {
        let sortOrder = 0;
        for (const c of dto.categories!) {
          await tx.category.create({
            data: {
              tenantId, clientId: client.id,
              name: c.name, unit: c.unit ?? dto.defaultUnit ?? 'item',
              icon: c.icon, sortOrder: sortOrder++,
            },
          });
        }
      }

      // Initial rate card + items
      if (dto.categories && dto.categories.some((c) => c.ratePaise)) {
        const rateCard = await tx.rateCard.create({
          data: { tenantId, clientId: client.id, effectiveFrom: new Date() },
        });
        const cats = await tx.category.findMany({ where: { tenantId, clientId: client.id } });
        const catMap = new Map(cats.map((c) => [c.name, c.id]));
        for (const c of dto.categories!) {
          if (c.ratePaise && catMap.has(c.name)) {
            await tx.rateCardItem.create({
              data: {
                rateCardId: rateCard.id,
                categoryId: catMap.get(c.name)!,
                unit: c.unit ?? 'item',
                ratePaise: BigInt(c.ratePaise),
                hsnCode: c.hsnCode,
                gstRate: c.gstRate ?? 18.0,
              },
            });
          }
        }
      }

      // Worker assignments
      if (dto.assignments) {
        for (const a of dto.assignments) {
          await tx.workerAssignment.create({
            data: { tenantId, clientId: client.id, userId: a.user_id, roleCode: a.role_code, isDefault: a.is_default ?? true },
          });
        }
      }

      return tx.client.findUnique({
        where: { id: client.id },
        include: { contacts: true, schedule: true, categories: { orderBy: { sortOrder: 'asc' } }, rateCards: { include: { items: true } } },
      });
    });
  }

  // ---------- UPDATE ----------
  async update(tenantId: string, id: string, dto: UpdateClientDto) {
    const client = await this.prisma.client.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!client) throw new NotFoundException('Client not found');

    const data: Prisma.ClientUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.businessType !== undefined) data.businessType = dto.businessType;
    if (dto.gstin !== undefined) data.gstin = dto.gstin;
    if (dto.legalName !== undefined) data.legalName = dto.legalName;
    if (dto.billingAddress !== undefined) data.billingAddress = dto.billingAddress;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.lat !== undefined) data.lat = dto.lat;
    if (dto.lng !== undefined) data.lng = dto.lng;
    if (dto.placeId !== undefined) data.placeId = dto.placeId;
    if (dto.mapsUrl !== undefined) data.mapsUrl = dto.mapsUrl;
    if (dto.paymentTermsDays !== undefined) data.paymentTermsDays = dto.paymentTermsDays;
    if (dto.billingCycle !== undefined) data.billingCycle = dto.billingCycle;
    if (dto.billingDay !== undefined) data.billingDay = dto.billingDay;
    if (dto.creditLimitPaise !== undefined) data.creditLimitPaise = BigInt(dto.creditLimitPaise);
    if (dto.defaultUnit !== undefined) data.defaultUnit = dto.defaultUnit;
    if (dto.defaultTatHours !== undefined) data.defaultTatHours = dto.defaultTatHours;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.client.update({ where: { id }, data });
  }

  // ---------- DEACTIVATE / ACTIVATE ----------
  async setActivation(tenantId: string, id: string, active: boolean) {
    const client = await this.prisma.client.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!client) throw new NotFoundException('Client not found');
    return this.prisma.client.update({
      where: { id },
      data: { status: active ? 'active' : 'inactive' },
    });
  }

  // ---------- SCHEDULE ----------
  async upsertSchedule(tenantId: string, clientId: string, dto: ScheduleDto) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null } });
    if (!client) throw new NotFoundException('Client not found');
    return this.prisma.clientSchedule.upsert({
      where: { clientId },
      update: {
        pickupDays: dto.pickupDays,
        deliveryDays: dto.deliveryDays,
        pickupFrequency: dto.pickupFrequency,
        deliveryFrequency: dto.deliveryFrequency,
      },
      create: { tenantId, clientId, ...dto },
    });
  }

  // ---------- CONTACTS ----------
  async listContacts(tenantId: string, clientId: string) {
    await this.ensureExists(tenantId, clientId);
    return this.prisma.clientContact.findMany({ where: { tenantId, clientId } });
  }

  async addContact(tenantId: string, clientId: string, dto: ContactDto) {
    await this.ensureExists(tenantId, clientId);
    return this.prisma.clientContact.create({ data: { tenantId, clientId, ...dto } });
  }

  // ---------- RATE CARDS ----------
  async listRateCards(tenantId: string, clientId: string) {
    await this.ensureExists(tenantId, clientId);
    return this.prisma.rateCard.findMany({
      where: { tenantId, clientId },
      orderBy: { effectiveFrom: 'desc' },
      include: { items: true },
    });
  }

  async createRateCard(tenantId: string, clientId: string, dto: RateCardDto) {
    await this.ensureExists(tenantId, clientId);
    // Close previous rate card
    await this.prisma.rateCard.updateMany({
      where: { tenantId, clientId, effectiveTo: null },
      data: { effectiveTo: dto.effectiveFrom },
    });
    return this.prisma.rateCard.create({
      data: {
        tenantId, clientId,
        effectiveFrom: dto.effectiveFrom,
        items: {
          create: dto.items.map((i) => ({
            categoryId: i.categoryId,
            unit: i.unit ?? 'item',
            ratePaise: BigInt(i.ratePaise),
            hsnCode: i.hsnCode,
            gstRate: i.gstRate ?? 18.0,
          })),
        },
      },
      include: { items: true },
    });
  }

  // ---------- WORKER ASSIGNMENTS ----------
  async listAssignments(tenantId: string, clientId: string) {
    await this.ensureExists(tenantId, clientId);
    return this.prisma.workerAssignment.findMany({ where: { tenantId, clientId } });
  }

  async addAssignment(tenantId: string, clientId: string, dto: AssignmentDto) {
    await this.ensureExists(tenantId, clientId);
    return this.prisma.workerAssignment.create({
      data: { tenantId, clientId, userId: dto.user_id, roleCode: dto.role_code, isDefault: dto.is_default ?? true },
    });
  }

  async removeAssignment(tenantId: string, clientId: string, assignmentId: string) {
    return this.prisma.workerAssignment.delete({ where: { id: assignmentId } });
  }

  // ---------- HELPERS ----------
  private async ensureExists(tenantId: string, clientId: string) {
    const c = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null } });
    if (!c) throw new NotFoundException('Client not found');
  }

  private async nextCode(tenantId: string, businessType: string): Promise<string> {
    const prefix = { hotel: 'HTL', hostel: 'HST', pg: 'PG', school: 'SCH', coaching: 'COA', other: 'GEN' }[businessType] ?? 'GEN';
    const count = await this.prisma.client.count({ where: { tenantId, businessType } });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }
}

// ---------- DTOs ----------
export class CreateClientDto {
  name!: string;
  businessType!: string;
  code?: string;
  gstin?: string;
  legalName?: string;
  billingAddress?: string;
  address?: string;
  location?: { lat?: number; lng?: number; place_id?: string; maps_url?: string };
  paymentTermsDays?: number;
  billingCycle?: string;
  billingDay?: number;
  creditLimitPaise?: number;
  defaultUnit?: string;
  defaultTatHours?: number;
  notes?: string;
  tags?: string[];
  contact?: { name: string; phone?: string; altPhone?: string; email?: string };
  schedule?: { pickupDays?: number[]; deliveryDays?: number[]; pickupFrequency?: string; deliveryFrequency?: string };
  categories?: { name: string; unit?: string; icon?: string; ratePaise?: number; hsnCode?: string; gstRate?: number }[];
  assignments?: { user_id: string; role_code: string; is_default?: boolean }[];
}

export class UpdateClientDto {
  name?: string;
  businessType?: string;
  gstin?: string;
  legalName?: string;
  billingAddress?: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  mapsUrl?: string;
  paymentTermsDays?: number;
  billingCycle?: string;
  billingDay?: number;
  creditLimitPaise?: number;
  defaultUnit?: string;
  defaultTatHours?: number;
  notes?: string;
  tags?: string[];
  status?: string;
}

export class ScheduleDto {
  pickupDays!: number[];
  deliveryDays!: number[];
  pickupFrequency?: string;
  deliveryFrequency?: string;
}

export class ContactDto {
  name!: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  isPrimary?: boolean;
}

export class RateCardDto {
  effectiveFrom!: Date;
  items!: { categoryId: string; unit?: string; ratePaise: number; hsnCode?: string; gstRate?: number }[];
}

export class AssignmentDto {
  user_id!: string;
  role_code!: string;
  is_default?: boolean;
}