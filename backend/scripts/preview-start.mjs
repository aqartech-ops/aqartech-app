// Starts the preview link (render.yaml) — a temporary demo for reviewers, never production.
//
// 1) brings the database up to the schema (prisma db push)
// 2) creates the platform admin, the plans and the demo company (prisma/seed.mjs, safe to repeat)
// 3) starts the server (API under /api + the website)
// 4) the first time only (demo company has no properties): fills the demo data through the real API
//    (scripts/demo-reset.mjs --yes), so every amount is posted to the books exactly as the app does.
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
};

run('npx', ['prisma', 'db', 'push', '--skip-generate']);
run('node', ['prisma/seed.mjs']);

const server = spawn('node', ['dist/main'], { stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 1));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.kill(sig));

const port = process.env.PORT || 3000;
const prefix = (process.env.API_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
const api = `http://localhost:${port}${prefix ? `/${prefix}` : ''}`;

async function waitForApi() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${api}/plans`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function fillDemoOnce() {
  if (!(await waitForApi())) return console.log('preview: API did not start in time — demo data skipped');
  const prisma = new PrismaClient();
  try {
    const email = (process.env.DEMO_EMAIL || 'demo@aqartech.test').toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.companyId) return console.log('preview: no demo company (SEED_DEMO=1?) — demo data skipped');
    if (await prisma.property.count({ where: { companyId: user.companyId } })) return console.log('preview: demo data already there');
  } finally {
    await prisma.$disconnect();
  }
  console.log('preview: filling demo data…');
  spawnSync('node', ['scripts/demo-reset.mjs', '--yes'], { stdio: 'inherit', env: { ...process.env, API_URL: api } });
}

fillDemoOnce().catch((e) => console.log('preview: demo data skipped —', e.message));
