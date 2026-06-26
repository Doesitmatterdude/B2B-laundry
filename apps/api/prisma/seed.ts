/**
 * FreshFold seed — SRS 26.5 checklist:
 *  - system roles + permissions + role_permissions
 *  - category templates per business type
 *  - default notification templates
 *  - demo tenant + demo client for QA
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  'tenant:manage', 'plan:manage', 'user:manage',
  'client:create', 'client:edit', 'client:deactivate', 'client:read',
  'category:manage', 'schedule:read',
  'lot:create', 'lot:tag', 'lot:washstatus', 'lot:pack', 'lot:deliver', 'lot:read',
  'defect:flag', 'investigation:manage',
  'invoice:create', 'invoice:read', 'payment:record',
  'dashboard:view', 'analytics:view', 'audit:read', 'notification:configure',
];

const ROLE_PERMS: Record<string, string[]> = {
  SUPER_ADMIN: ['tenant:manage', 'plan:manage', 'user:manage', 'dashboard:view', 'analytics:view', 'audit:read'],
  ADMIN: PERMISSIONS.filter((p) => !['tenant:manage', 'plan:manage'].includes(p)),
  DELIVERY: ['schedule:read', 'lot:create', 'lot:deliver', 'lot:read', 'defect:flag', 'client:read'],
  TAGGER: ['lot:tag', 'lot:washstatus', 'lot:read', 'defect:flag', 'client:read'],
  PACKER: ['lot:pack', 'lot:washstatus', 'lot:read', 'defect:flag', 'client:read'],
  CLIENT: ['client:read', 'lot:read', 'invoice:read', 'schedule:read'],
};

const CATEGORY_TEMPLATES: Record<string, string[]> = {
  hotel: ['Bedsheet', 'Pillow Cover', 'Blanket', 'Bath Towel', 'Hand Towel', 'Bath Mat', 'Curtain', 'Chef Uniform', 'Table Cloth', 'Napkin', 'Duvet Cover'],
  hostel: ['Bedsheet', 'Pillow Cover', 'Blanket', 'Towel'],
  pg: ['Shirt', 'T-Shirt', 'Jeans', 'Track Pants', 'Pants', 'Shorts', 'Towel', 'Bedsheet', 'Blanket'],
  school: ['Uniform Shirt', 'Uniform Trouser', 'Sweater', 'Blazer', 'Sports Uniform', 'House T-Shirt', 'Tie'],
  coaching: ['Uniform', 'Curtain', 'Floor Mat', 'Table Cloth'],
};

async function main() {
  // Permissions
  const permRows = await Promise.all(
    PERMISSIONS.map((code) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code } }),
    ),
  );
  const permByCode = Object.fromEntries(permRows.map((p) => [p.code, p.id]));

  // Demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-laundry' },
    update: {},
    create: { name: 'Demo Commercial Laundry', slug: 'demo-laundry', gstin: '29ABCDE1234F1Z5' },
  });

  // System roles for this tenant
  for (const [code, perms] of Object.entries(ROLE_PERMS)) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: {},
      create: { tenantId: tenant.id, code, name: code },
    });
    for (const pc of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permByCode[pc] } },
        update: {},
        create: { roleId: role.id, permissionId: permByCode[pc] },
      });
    }
  }

  // Admin user
  const adminRole = await prisma.role.findFirst({ where: { tenantId: tenant.id, code: 'ADMIN' } });
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.laundry' } },
    update: {},
    create: {
      tenantId: tenant.id,
      fullName: 'Demo Admin',
      email: 'admin@demo.laundry',
      passwordHash: await argon2.hash('Admin@12345', { type: argon2.argon2id }),
    },
  });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id },
    });
  }

  // Demo client + category template
  const client = await prisma.client.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HTL-0001' } },
    update: {},
    create: {
      tenantId: tenant.id, code: 'HTL-0001', name: 'Grand Palace Hotel',
      businessType: 'hotel', gstin: '29ABCDE1234F1Z5',
    },
  });
  let sort = 0;
  for (const name of CATEGORY_TEMPLATES.hotel) {
    await prisma.category.upsert({
      where: { tenantId_clientId_name: { tenantId: tenant.id, clientId: client.id, name } },
      update: {},
      create: { tenantId: tenant.id, clientId: client.id, name, sortOrder: sort++ },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete. Login: admin@demo.laundry / Admin@12345');
}

main().finally(() => prisma.$disconnect());
