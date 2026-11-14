// Demo data reset (إعادة تعبئة البيانات التجريبية) — for the demo company only, never in production.
//
//   npm run demo:reset
//
// 1) Deletes ALL the demo company's operational data (properties, units, owners, tenants, leases, charges,
//    payments, cheques, expenses, work orders, vendors, statements, payouts, documents, journal, counters,
//    closed periods, activity log). The company, its users, roles, subscription, expense items and custom
//    sections stay. It asks you to type "yes" first.
// 2) Builds a fresh example through the real API (so every amount is posted to the books exactly as the app does):
//    2 buildings, each with its own owner and management agreement; 6 tenants, one apartment each (3 per building);
//    6 months of rent with different payment behaviour (on time, late, 90+ days in arrears, cheques, a lease ending soon);
//    utilities, cleaning, insurance, a vendor and a maintenance job per building (one done with its cost, one open);
//    an owner transfer.
//
// The backend must be running (npm run start:dev). Options (backend/.env or the command line):
//   DEMO_EMAIL     (default demo@aqartech.test)   DEMO_PASSWORD (default Demo@12345)
//   API_URL        (default http://localhost:PORT, PORT from .env or 3000)
import 'dotenv/config';
import readline from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';

const EMAIL = (process.env.DEMO_EMAIL || 'demo@aqartech.test').toLowerCase();
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';
const API = (process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const prisma = new PrismaClient();

// ------------------------------------------------------------------ dates (UTC midnights, relative to today)
const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (n) => new Date(today.getTime() + n * DAY);
const monthStart = (back) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
const minDate = (a, b) => (a < b ? a : b);
const omr = (n) => Math.round(n * 1000); // OMR → baisa

// ------------------------------------------------------------------ API client
let token = null;
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data?.message ?? data)}${data?.field ? ` (${data.field})` : ''}`);
  return data;
}
const get = (p) => call('GET', p);
const post = (p, b) => call('POST', p, b ?? {});
const put = (p, b) => call('PUT', p, b);

// ------------------------------------------------------------------ 1) wipe
async function wipe(companyId) {
  const c = { companyId };
  const steps = [
    ['owner portal sign-ins', () => prisma.user.deleteMany({ where: { companyId, ownerId: { not: null } } })],
    ['documents', () => prisma.document.deleteMany({ where: c })],
    ['document readings', () => prisma.ocrRecognition.deleteMany({ where: c })],
    ['municipality records', () => prisma.municipalityRecord.deleteMany({ where: c })],
    ['owner statements', () => prisma.ownerStatement.deleteMany({ where: c })],
    ['owner payouts', () => prisma.ownerPayout.deleteMany({ where: c })],
    ['expenses', () => prisma.expense.deleteMany({ where: c })],
    ['work orders', () => prisma.workOrder.deleteMany({ where: c })],
    ['vendors', () => prisma.vendor.deleteMany({ where: c })],
    ['cheques', () => prisma.cheque.deleteMany({ where: c })],
    ['payments', () => prisma.payment.deleteMany({ where: c })],
    ['rent charges', () => prisma.rentCharge.deleteMany({ where: c })],
    ['journal lines', () => prisma.journalLine.deleteMany({ where: c })],
    ['journal reversal links', () => prisma.journalEntry.updateMany({ where: { ...c, reversesId: { not: null } }, data: { reversesId: null } })],
    ['journal entries', () => prisma.journalEntry.deleteMany({ where: c })],
    ['leases', () => prisma.lease.deleteMany({ where: c })],
    ['management agreements', () => prisma.managementAgreement.deleteMany({ where: c })],
    ['property partners', () => prisma.propertyPartner.deleteMany({ where: c })],
    ['owners', () => prisma.owner.deleteMany({ where: c })],
    ['tenants', () => prisma.tenant.deleteMany({ where: c })],
    ['units', () => prisma.unit.deleteMany({ where: c })],
    ['properties', () => prisma.property.deleteMany({ where: c })],
    ['closed periods', () => prisma.periodClose.deleteMany({ where: c })],
    ['numbering counters', () => prisma.counter.deleteMany({ where: c })],
    ['activity log', () => prisma.activityLog.deleteMany({ where: c })],
    ['role property limits', () => prisma.role.updateMany({ where: c, data: { propertyIds: [] } })],
  ];
  for (const [label, run] of steps) {
    const r = await run();
    if (r.count) console.log(`  − ${label}: ${r.count}`);
  }
}

// ------------------------------------------------------------------ 2) the example
const BUILDINGS = [
  {
    name: 'بناية النخيل',
    governorate: 'مسقط',
    wilayat: 'بوشر',
    address: 'الخوير، شارع 33',
    floors: 2,
    owner: { name: 'سالم بن خلفان الحارثي', civilId: '10293847', phone: '+96899112233', nationality: 'عُماني', bankName: 'بنك مسقط', accountName: 'سالم خلفان الحارثي', accountNumber: 'OM810270000012345678901' },
    fee: { feeMethod: 'PERCENT_OF_COLLECTED', feeRateBp: 500 }, // 5% of what is collected
    units: [
      { number: '101', floor: '1', bedrooms: 2, askingRent: 280 },
      { number: '102', floor: '1', bedrooms: 2, askingRent: 280 },
      { number: '201', floor: '2', bedrooms: 3, askingRent: 330 },
      { number: '202', floor: '2', bedrooms: 3, askingRent: 330 },
    ],
  },
  {
    name: 'عمارة الريان',
    governorate: 'مسقط',
    wilayat: 'السيب',
    address: 'الموالح الجنوبية، سكة 4512',
    floors: 2,
    owner: { name: 'مريم بنت سعيد البلوشية', civilId: '11223344', phone: '+96892334455', nationality: 'عُمانية', bankName: 'بنك ظفار', accountName: 'مريم سعيد البلوشية', accountNumber: 'OM450340000098765432100' },
    fee: { feeMethod: 'PERCENT_OF_COLLECTED', feeRateBp: 700 }, // 7%
    units: [
      { number: 'A1', floor: '1', bedrooms: 1, askingRent: 220 },
      { number: 'A2', floor: '1', bedrooms: 2, askingRent: 260 },
      { number: 'B1', floor: '2', bedrooms: 2, askingRent: 270 },
      { number: 'B2', floor: '2', bedrooms: 3, askingRent: 310 },
    ],
  },
];

// one apartment each; `pay` = how this tenant behaves
const TENANTS = [
  { building: 0, unit: '101', rent: 280, start: -180, months: 12, pay: 'onTime', method: 'BANK_TRANSFER', t: { name: 'أحمد بن علي الكندي', civilId: '9876543', phone: '+96891234567', nationality: 'عُماني', employer: 'وزارة الصحة', idExpiry: 600 } },
  { building: 0, unit: '102', rent: 280, start: -150, months: 12, pay: 'lastMonthLate', method: 'CASH', t: { name: 'Rahul Menon', civilId: '87654321', phone: '+96895556677', nationality: 'Indian', employer: 'Oman LNG', idExpiry: 25 } },
  { building: 0, unit: '201', rent: 330, start: -210, months: 12, pay: 'stopped', method: 'CASH', t: { name: 'خالد بن سيف الريامي', civilId: '6543210', phone: '+96893445566', nationality: 'عُماني', employer: 'أعمال حرة' } },
  { building: 1, unit: 'A1', rent: 220, start: -160, months: 12, pay: 'postDated', method: 'BANK_TRANSFER', t: { name: 'فاطمة بنت ناصر الهنائية', civilId: '7654321', phone: '+96899887766', nationality: 'عُمانية', employer: 'جامعة السلطان قابوس', idExpiry: 400 } },
  { building: 1, unit: 'A2', rent: 260, start: -140, months: 12, pay: 'cheques', method: 'CHEQUE', t: { name: 'John Mathews', civilId: '76543219', phone: '+96896778899', nationality: 'British', employer: 'PDO' } },
  { building: 1, unit: 'B1', rent: 270, start: -320, months: 12, pay: 'twoLate', method: 'CASH', t: { name: 'مؤسسة النجمة للتجارة', type: 'COMPANY', crNumber: '1234567', phone: '+96824112233', guarantorName: 'سعيد بن حمد العامري', guarantorPhone: '+96899001122' } },
];

const BANKS = ['بنك مسقط', 'البنك الوطني العماني', 'بنك ظفار', 'بنك صحار الدولي'];

async function build(companyId) {
  const cats = await get('/expense-categories?all=1');
  const cat = (key) => {
    const c = cats.find((x) => x.nameEn.toLowerCase().startsWith(key));
    if (!c) throw new Error(`expense item "${key}" not found`);
    return c.id;
  };
  const vendor = await post('/vendors', { name: 'مؤسسة الإتقان للصيانة', phone: '+96895001122', specialty: 'تكييف وسباكة وكهرباء' });

  const properties = [];
  for (const b of BUILDINGS) {
    const property = await post('/properties', { name: b.name, category: 'BUILDING', ownership: 'MANAGED', governorate: b.governorate, wilayat: b.wilayat, address: b.address, floors: b.floors });
    const units = {};
    for (const u of b.units) {
      units[u.number] = await post(`/properties/${property.id}/units`, { number: u.number, floor: u.floor, type: 'APARTMENT', bedrooms: u.bedrooms, bathrooms: 2, askingRent: omr(u.askingRent), status: 'VACANT' });
    }
    const owner = await post('/owners', { type: 'INDIVIDUAL', ...b.owner });
    await put(`/properties/${property.id}/agreement`, { ownerId: owner.id, startDate: iso(monthStart(12)), statementPeriod: 'MONTHLY', ...b.fee });
    properties.push({ ...b, property, units, owner });
    console.log(`  + ${b.name}: ${b.units.length} units, owner ${b.owner.name}`);
  }

  // the units existed all year (occupancy counts a unit from the day it was added)
  await prisma.unit.updateMany({ where: { companyId }, data: { createdAt: monthStart(12) } });

  let chequeNo = 300100;
  for (const [i, x] of TENANTS.entries()) {
    const b = properties[x.building];
    const tenant = await post('/tenants', { type: x.t.type ?? 'INDIVIDUAL', ...x.t, idExpiry: x.t.idExpiry ? iso(plusDays(x.t.idExpiry)) : undefined });
    const start = plusDays(x.start);
    const startDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + x.months, 0));
    const lease = await post('/leases', {
      unitId: b.units[x.unit].id,
      tenantId: tenant.id,
      startDate: iso(startDate),
      endDate: iso(endDate),
      monthlyRent: omr(x.rent),
      deposit: omr(x.rent),
      paymentFrequency: 'MONTHLY',
      dueDay: 1,
      activate: true,
    });
    const detail = await get(`/leases/${lease.id}`);
    const due = [...(detail.depositCharge ? [detail.depositCharge] : []), ...detail.schedule.filter((s) => s.status !== 'CANCELLED')]
      .map((c) => ({ amount: c.amount, dueDate: new Date(c.dueDate) }))
      .filter((c) => c.dueDate <= today)
      .sort((a, b) => a.dueDate - b.dueDate);
    // how many of the due charges (deposit first) this tenant paid
    const unpaid = { onTime: 0, lastMonthLate: 1, stopped: 4, postDated: 0, cheques: 0, twoLate: 2 }[x.pay];
    const paid = due.slice(0, Math.max(0, due.length - unpaid));
    const bank = BANKS[i % BANKS.length];
    for (const c of paid) {
      const date = minDate(new Date(c.dueDate.getTime() + ((i % 3) + 1) * DAY), today);
      if (x.method === 'CHEQUE') {
        const number = String(chequeNo++);
        const payment = await post('/payments', { leaseId: lease.id, amount: c.amount, date: iso(date), method: 'CHEQUE', chequeNo: number, bankName: bank, chequeDate: iso(date) });
        // the bank cleared it a few days later (unless that is still in the future)
        const cheque = (await get(`/cheques?leaseId=${lease.id}`)).find((q) => q.number === number);
        const cleared = new Date(date.getTime() + 3 * DAY);
        if (cheque && cleared <= today) await post(`/cheques/${cheque.id}/clear`, { date: iso(cleared) });
        void payment;
      } else {
        await post('/payments', { leaseId: lease.id, amount: c.amount, date: iso(date), method: x.method, ...(x.method === 'BANK_TRANSFER' ? { reference: `TRF-${iso(date).replace(/-/g, '')}-${i + 1}`, bankName: bank } : {}) });
      }
    }
    // post-dated cheques for the coming months (one due within a week → deposit reminder)
    if (x.pay === 'postDated' || x.pay === 'cheques') {
      const nextDue = detail.schedule.filter((s) => new Date(s.dueDate) > today).slice(0, 2);
      for (const [k, s] of nextDue.entries()) {
        const dueDate = k === 0 && x.pay === 'postDated' ? plusDays(4) : new Date(s.dueDate);
        await post('/cheques', { leaseId: lease.id, number: String(chequeNo++), bankName: bank, drawer: x.t.name, amount: s.amount, dueDate: iso(dueDate) });
      }
    }
    console.log(`  + ${x.t.name} → ${b.name} ${x.unit} (${x.rent} OMR, ${{ onTime: 'pays on time', lastMonthLate: 'owes this month', stopped: '90+ days in arrears', postDated: 'post-dated cheques', cheques: 'pays by cheque', twoLate: 'owes 2 months, lease ending soon' }[x.pay]})`);
  }

  // expenses: utilities and cleaning every month (last 3 months), insurance once — charged to the owner
  for (const [n, b] of properties.entries()) {
    for (let back = 2; back >= 0; back--) {
      const d = minDate(new Date(monthStart(back).getTime() + 9 * DAY), today);
      await post('/expenses', { propertyId: b.property.id, categoryId: cat('electricity'), amount: omr(45 + n * 12 + back * 3), date: iso(d), paidFrom: 'BANK', bearer: 'OWNER', description: 'كهرباء ومياه المناطق المشتركة', invoiceNo: `NAMA-${n + 1}${back}` });
      await post('/expenses', { propertyId: b.property.id, categoryId: cat('cleaning'), amount: omr(60), date: iso(minDate(new Date(d.getTime() + 5 * DAY), today)), paidFrom: 'CASH', bearer: 'OWNER', description: 'نظافة المبنى الشهرية' });
    }
    await post('/expenses', { propertyId: b.property.id, categoryId: cat('insurance'), amount: omr(120 + n * 30), date: iso(new Date(monthStart(1).getTime() + 2 * DAY)), paidFrom: 'BANK', bearer: 'OWNER', description: 'تأمين المبنى السنوي' });

    // maintenance: one job done last month (its cost becomes the expense), one open now
    const firstUnit = Object.values(b.units)[0];
    const done = await post('/work-orders', { propertyId: b.property.id, unitId: firstUnit.id, title: n === 0 ? 'صيانة مكيف الشقة' : 'تسريب مياه في المطبخ', description: n === 0 ? 'المكيف لا يبرد — تنظيف وتعبئة غاز' : 'تغيير محبس وإصلاح التسريب', priority: 'HIGH', vendorId: vendor.id, bearer: 'OWNER', estimatedCost: omr(n === 0 ? 85 : 60), reportedBy: 'المستأجر' });
    const doneDate = new Date(monthStart(1).getTime() + (12 + n * 3) * DAY);
    await post(`/work-orders/${done.id}/start`);
    await post(`/work-orders/${done.id}/complete`, { amount: omr(n === 0 ? 92.5 : 58), date: iso(doneDate), paidFrom: 'CASH', invoiceNo: `ITQ-${100 + n}` });
    await prisma.workOrder.update({ where: { id: done.id }, data: { createdAt: new Date(doneDate.getTime() - 3 * DAY), startedAt: new Date(doneDate.getTime() - 2 * DAY) } });
    const open = await post('/work-orders', { propertyId: b.property.id, title: n === 0 ? 'إصلاح إنارة الدرج' : 'صيانة مضخة المياه', description: 'بلاغ من الحارس', priority: 'NORMAL', vendorId: vendor.id, bearer: 'OWNER', estimatedCost: omr(n === 0 ? 35 : 120), scheduledDate: iso(plusDays(3)) });
    await prisma.workOrder.update({ where: { id: open.id }, data: { createdAt: plusDays(-2) } });
  }

  // the first owner received last month's money
  const b0 = properties[0];
  await post('/owner-payouts', { ownerId: b0.owner.id, propertyId: b0.property.id, amount: omr(450), date: iso(new Date(monthStart(0).getTime() + 4 * DAY) > today ? today : new Date(monthStart(0).getTime() + 4 * DAY)), paidFrom: 'BANK', reference: 'TRF-OWNER-001', notes: 'تحويل مستحقات الشهر السابق' });
  console.log('  + expenses (utilities, cleaning, insurance), 4 work orders, 1 owner transfer');
}

// ------------------------------------------------------------------ main
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('demo:reset is not allowed in production.');
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, include: { company: true } });
  if (!user) throw new Error(`No user ${EMAIL}. Run "SEED_DEMO=1 npm run db:seed" first, or set DEMO_EMAIL.`);
  const company = user.company;
  const counts = await Promise.all([prisma.property.count({ where: { companyId: company.id } }), prisma.tenant.count({ where: { companyId: company.id } }), prisma.payment.count({ where: { companyId: company.id } })]);

  console.log(`\nCompany: ${company.name} (${EMAIL})`);
  console.log(`It has ${counts[0]} properties, ${counts[1]} tenants, ${counts[2]} payments.`);
  console.log('ALL of this company\'s data will be DELETED and replaced by a fresh example (users and settings stay).');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = process.argv.includes('--yes') ? 'yes' : await rl.question('Type "yes" to continue: ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Nothing changed.');
    return;
  }

  // make sure the API is up before deleting anything
  try {
    await fetch(`${API}/plans`);
  } catch {
    throw new Error(`The backend is not reachable at ${API}. Start it first (npm run start:dev).`);
  }
  const login = await post('/auth/login', { email: EMAIL, password: PASSWORD }).catch((e) => {
    throw new Error(`Sign-in as ${EMAIL} failed (${e.message}). Set DEMO_PASSWORD if you changed the password.`);
  });
  token = login.token;

  console.log('\nDeleting…');
  await wipe(company.id);
  console.log('\nCreating the example…');
  await build(company.id);
  console.log(`\nDone. Sign in as ${EMAIL} and open the dashboard.`);
}

main()
  .catch((e) => {
    console.error(`\n✖ ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
