import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../config/prisma.service';
import { ClientsModule } from './clients.module';
import { CategoriesModule } from '../categories/categories.module';
import { JwtModule } from '@nestjs/jwt';

/**
 * M1 integration tests — Client & Catalog.
 * Requires a running Postgres (DATABASE_URL in env).
 * Tests: CRUD lifecycle, schedule upsert, category CRUD, template seeding,
 *        and **tenant isolation** (cross-tenant data is invisible).
 */
describe('Clients & Categories (M1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;
  let tokenA: string;
  let tokenB: string;

  const JWT_SECRET = 'test_jwt_secret_m1';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: JWT_SECRET }),
        ClientsModule,
        CategoriesModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);

    // Create two tenants for isolation testing
    const tA = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-a' },
      update: {}, create: { name: 'Tenant A', slug: 'test-tenant-a' },
    });
    const tB = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-b' },
      update: {}, create: { name: 'Tenant B', slug: 'test-tenant-b' },
    });
    tenantA = tA.id;
    tenantB = tB.id;

    // Generate JWTs simulating ADMIN users in each tenant
    const jwt = moduleRef.get(JwtModule).encode;
    // Use signAsync via JwtService
    const jwtSvc = moduleRef.get('JwtService');
    tokenA = await jwtSvc.signAsync({ sub: 'user-a', tenant_id: tenantA, role: 'ADMIN', perms: ['client:create', 'client:edit', 'client:read', 'client:deactivate', 'category:manage'] });
    tokenB = await jwtSvc.signAsync({ sub: 'user-b', tenant_id: tenantB, role: 'ADMIN', perms: ['client:create', 'client:edit', 'client:read', 'client:deactivate', 'category:manage'] });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.category.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.client.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await app.close();
  });

  const authA = { Authorization: `Bearer ${tokenA}` };
  const authB = { Authorization: `Bearer ${tokenB}` };

  // ---- Client CRUD ----
  it('creates a client (tenant A)', async () => {
    const res = await request(app.getHttpServer())
      .post('/clients')
      .set(authA)
      .send({
        name: 'Sunrise Hotel',
        businessType: 'hotel',
        gstin: '29ABCDE1234F1Z5',
        contact: { name: 'Priya', phone: '+919800001111' },
        schedule: { pickupDays: [1, 3, 5], deliveryDays: [2, 4, 6], pickupFrequency: 'alt' },
        categories: [
          { name: 'Bedsheet', icon: '🛏️', ratePaise: 1500 },
          { name: 'Towel', icon: '🧺', ratePaise: 800 },
        ],
      })
      .expect(201);

    expect(res.body.name).toBe('Sunrise Hotel');
    expect(res.body.code).toMatch(/^HTL-\d{4}$/);
    expect(res.body.contacts).toHaveLength(1);
    expect(res.body.schedule.pickupDays).toEqual([1, 3, 5]);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(2);
    expect(res.body.rateCards).toHaveLength(1);
    expect(res.body.rateCards[0].items.length).toBeGreaterThanOrEqual(2);
  });

  it('lists clients (tenant A)', async () => {
    const res = await request(app.getHttpServer())
      .get('/clients')
      .set(authA)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.meta).toBeDefined();
  });

  // ---- Tenant Isolation ----
  it('tenant B cannot see tenant A clients', async () => {
    const res = await request(app.getHttpServer())
      .get('/clients')
      .set(authB)
      .expect(200);
    const names = res.body.data.map((c: any) => c.name);
    expect(names).not.toContain('Sunrise Hotel');
  });

  it('tenant B cannot fetch tenant A client by id', async () => {
    const listRes = await request(app.getHttpServer()).get('/clients').set(authA);
    const clientId = listRes.body.data[0].id;
    await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set(authB)
      .expect(404); // Not found because tenant scope filters it out
  });

  // ---- Category CRUD ----
  it('creates a category (tenant A)', async () => {
    const listRes = await request(app.getHttpServer()).get('/clients').set(authA);
    const clientId = listRes.body.data[0].id;

    const res = await request(app.getHttpServer())
      .post(`/clients/${clientId}/categories`)
      .set(authA)
      .send({ name: 'Chef Uniform', icon: '👨‍🍳', unit: 'item' })
      .expect(201);
    expect(res.body.name).toBe('Chef Uniform');
    expect(res.body.active).toBe(true);
  });

  it('seeds categories from hotel template', async () => {
    const listRes = await request(app.getHttpServer()).get('/clients').set(authA);
    const clientId = listRes.body.data[0].id;

    const res = await request(app.getHttpServer())
      .post(`/clients/${clientId}/categories/seed-template?businessType=hotel`)
      .set(authA)
      .expect(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('deactivates a category (soft delete)', async () => {
    const listRes = await request(app.getHttpServer()).get('/clients').set(authA);
    const clientId = listRes.body.data[0].id;
    const catRes = await request(app.getHttpServer())
      .get(`/clients/${clientId}/categories`)
      .set(authA);
    const catId = catRes.body[0].id;

    await request(app.getHttpServer())
      .delete(`/clients/${clientId}/categories/${catId}`)
      .set(authA)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/clients/${clientId}/categories?active=true`)
      .set(authA);
    expect(after.body.find((c: any) => c.id === catId)).toBeUndefined();
  });

  // ---- Deactivate / Activate ----
  it('deactivates and reactivates a client', async () => {
    const listRes = await request(app.getHttpServer()).get('/clients').set(authA);
    const clientId = listRes.body.data[0].id;

    await request(app.getHttpServer())
      .post(`/clients/${clientId}/deactivate`)
      .set(authA)
      .expect(200);

    const inactive = await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set(authA);
    expect(inactive.body.status).toBe('inactive');

    await request(app.getHttpServer())
      .post(`/clients/${clientId}/activate`)
      .set(authA)
      .expect(200);

    const active = await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set(authA);
    expect(active.body.status).toBe('active');
  });

  // ---- Rate Card ----
  it('creates a new effective-dated rate card (closes previous)', async () => {
    const listRes = await request(app.getHttpServer()).get('/clients').set(authA);
    const clientId = listRes.body.data[0].id;
    const cats = await request(app.getHttpServer())
      .get(`/clients/${clientId}/categories`)
      .set(authA);

    const res = await request(app.getHttpServer())
      .post(`/clients/${clientId}/rate-cards`)
      .set(authA)
      .send({
        effectiveFrom: new Date().toISOString(),
        items: [{ categoryId: cats.body[0].id, ratePaise: 2000, unit: 'item' }],
      })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.effectiveTo).toBeNull();

    // Previous rate card should now have effectiveTo set
    const cards = await request(app.getHttpServer())
      .get(`/clients/${clientId}/rate-cards`)
      .set(authA);
    expect(cards.body.length).toBeGreaterThanOrEqual(2);
    const prev = cards.body.find((c: any) => c.id !== res.body.id);
    expect(prev.effectiveTo).not.toBeNull();
  });
});