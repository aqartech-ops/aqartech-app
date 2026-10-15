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
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
