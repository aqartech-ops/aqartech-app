// Seed: platform admin + starter plans (+ optional demo company).
// Run:  npm run db:seed        (safe to run many times — it never overwrites what admins edited)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ALL = ['dashboard', 'properties', 'tenants', 'financials', 'maintenance', 'documents', 'owners', 'users', 'settings'];

// Starter plans. Prices are in baisa (1 OMR = 1000). These are only a starting point:
// platform admins change prices, limits and sections from the admin panel at any time.
const STARTER_PLANS = [
  {
    code: 'individual',
    nameEn: 'Individual Owner',
    nameAr: 'مالك فرد',
    audience: 'INDIVIDUAL',
    priceMonthly: 10000,
    priceYearly: 100000,
    limits: { properties: 5, units: 30, users: 5, owners: 0 },
    features: ['dashboard', 'properties', 'tenants', 'financials', 'maintenance', 'documents', 'users', 'settings'],
    sortOrder: 1,
  },
  {
    code: 'basic',
    nameEn: 'Basic',
    nameAr: 'الأساسية',
    audience: 'COMPANY',
    priceMonthly: 15000,
    priceYearly: 150000,
    limits: { properties: 10, units: 100, users: 5, owners: 10 },
    features: ['dashboard', 'properties', 'tenants', 'financials', 'users', 'settings'],
    sortOrder: 2,
  },
  {
    code: 'pro',
    nameEn: 'Pro',
    nameAr: 'المتقدمة',
    audience: 'COMPANY',
    priceMonthly: 35000,
    priceYearly: 350000,
    limits: { properties: 50, units: 500, users: 15, owners: 50 },
    features: ALL,
    sortOrder: 3,
  },
  {
    code: 'enterprise',
    nameEn: 'Enterprise',
    nameAr: 'الشركات الكبرى',
    audience: 'COMPANY',
    priceMonthly: 75000,
    priceYearly: 750000,
    limits: { properties: null, units: null, users: null, owners: null },
    features: ALL,
    sortOrder: 4,
  },
];

async function main() {
  // 1) Platform admin
  const email = (process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || password.length < 10) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars) in backend/.env before seeding.');
  }
  const existingAdmin = await prisma.platformAdmin.findUnique({ where: { email } });
  if (!existingAdmin) {
    await prisma.platformAdmin.create({
      data: { email, name: process.env.ADMIN_NAME ?? 'Platform Admin', passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`✔ platform admin created: ${email}`);
  } else {
    console.log(`• platform admin exists: ${email}`);
  }

  // 2) Starter plans — created only if missing
  for (const plan of STARTER_PLANS) {
    const exists = await prisma.plan.findUnique({ where: { code: plan.code } });
    if (!exists) {
      await prisma.plan.create({ data: plan });
      console.log(`✔ plan created: ${plan.code}`);
    }
  }

  // 3) Optional demo company (SEED_DEMO=1) with an ACTIVE subscription, for testing the app
  if (process.env.SEED_DEMO === '1') {
    const demoEmail = 'demo@aqartech.test';
    if (!(await prisma.user.findUnique({ where: { email: demoEmail } }))) {
      const pro = await prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
      const company = await prisma.company.create({
        data: { name: 'Demo Properties LLC', ownerName: 'Demo Owner', email: demoEmail, type: 'COMPANY' },
      });
      await prisma.subscription.create({
        data: { companyId: company.id, planId: pro.id, status: 'ACTIVE', startDate: new Date() },
      });
      await prisma.user.create({
        data: {
          companyId: company.id,
          name: 'Demo Owner',
          email: demoEmail,
          isCompanyAdmin: true,
          passwordHash: await bcrypt.hash('Demo@12345', 12),
        },
      });
      console.log(`✔ demo company created — login: ${demoEmail} / Demo@12345`);
    }

    // Demo portfolio (only if the demo company has no properties yet)
    const demoUser = await prisma.user.findUnique({ where: { email: demoEmail } });
    if (demoUser && (await prisma.property.count({ where: { companyId: demoUser.companyId } })) === 0) {
      const companyId = demoUser.companyId;
      const garden = await prisma.property.create({
        data: { companyId, name: 'بناية الحدائق', category: 'BUILDING', ownership: 'MANAGED', governorate: 'مسقط', wilayat: 'بوشر', floors: 3, propertyValue: 1800000000, investmentCost: 1500000000 },
      });
      const units = [];
      for (const floor of [1, 2, 3]) {
        for (const n of [1, 2, 3]) {
          const number = `${floor}0${n}`;
          units.push({
            companyId,
            propertyId: garden.id,
            number,
            floor: String(floor),
            type: number === '103' ? 'SHOP' : 'APARTMENT',
            askingRent: number === '103' ? 450000 : 280000 + floor * 10000,
            bedrooms: number === '103' ? null : 2,
            status: ['202', '303'].includes(number) ? 'VACANT' : 'OCCUPIED',
          });
        }
      }
      await prisma.unit.createMany({ data: units });
      const villas = await prisma.property.create({
        data: { companyId, name: 'مجمع فلل السيب', category: 'VILLA_COMPOUND', ownership: 'OWNED', governorate: 'مسقط', wilayat: 'السيب' },
      });
      await prisma.unit.createMany({
        data: ['V1', 'V2', 'V3', 'V4'].map((number, i) => ({
          companyId,
          propertyId: villas.id,
          number,
          type: 'VILLA',
          askingRent: 650000,
          bedrooms: 4,
          status: i === 3 ? 'MAINTENANCE' : 'OCCUPIED',
        })),
      });
      console.log('✔ demo properties created (2 properties, 13 units)');
    }

    // Demo owners + management agreement + partners (only if none yet)
    const garden = demoUser
      ? await prisma.property.findFirst({ where: { companyId: demoUser.companyId, name: 'بناية الحدائق', deletedAt: null } })
      : null;
    if (garden && (await prisma.owner.count({ where: { companyId: garden.companyId } })) === 0) {
      const companyId = garden.companyId;
      const owner1 = await prisma.owner.create({
        data: { companyId, name: 'سالم بن خلفان الحارثي', phone: '+96899112233', civilId: '12345678', bankName: 'بنك مسقط', accountNumber: 'OM810270000012345678901' },
      });
      const owner2 = await prisma.owner.create({ data: { companyId, name: 'مريم بنت سعيد البلوشية', phone: '+96892334455' } });
      await prisma.managementAgreement.create({
        data: { companyId, propertyId: garden.id, ownerId: owner1.id, startDate: new Date('2026-01-01T00:00:00Z'), feeMethod: 'PERCENT_OF_COLLECTED', feeRateBp: 500 },
      });
      await prisma.propertyPartner.createMany({
        data: [
          { companyId, propertyId: garden.id, ownerId: owner1.id, shareBp: 6000 },
          { companyId, propertyId: garden.id, ownerId: owner2.id, shareBp: 4000 },
        ],
      });
      console.log('✔ demo owners created (2 owners, 1 management agreement, partners 60/40)');
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
