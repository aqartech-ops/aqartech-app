#!/usr/bin/env bash
# First start of the Codespace: settings, packages, database tables, platform admin + demo company.
set -e
cd "$(dirname "$0")/.."

cd backend
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=\"$(openssl rand -hex 48)\"|" .env
  sed -i "s|^ADMIN_2FA_KEY=.*|ADMIN_2FA_KEY=\"$(openssl rand -hex 48)\"|" .env
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=\"Admin-$(openssl rand -hex 6)\"|" .env
  sed -i "s|^SEED_DEMO=.*|SEED_DEMO=1|" .env
fi
npm install
# the database container may still be starting
for i in $(seq 1 20); do npx prisma db push --accept-data-loss && break; echo "waiting for the database…"; sleep 3; done
npx prisma generate
npm run db:seed

cd ..
npm install
echo "✔ AqarTech is installed"
