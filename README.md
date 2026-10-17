# AqarTech

Property-management SaaS for Oman — phone, tablet and web from one Expo codebase, with a NestJS + Prisma + PostgreSQL API.
What we are building and every decision so far: [`docs/PROJECT.md`](docs/PROJECT.md).

```
App.js, screens/, components/, services/, i18n/, theme.js   ← the app (Expo SDK 57)
backend/                                                      ← the API (NestJS + Prisma)
backend/prisma/schema.prisma                                  ← the ONLY database schema
```

## Run it locally

### 1) API (backend)

```bash
cd backend
cp .env.example .env          # Windows: copy .env.example .env
```

Fill in `backend/.env`:
- `DATABASE_URL` — your PostgreSQL (e.g. a new database called `aqartech`)
- `JWT_SECRET` — a long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — your platform-team login (password ≥ 10 characters)

```bash
npm install
npx prisma migrate dev --name foundation   # creates the tables
npm run db:seed                            # platform admin + starter plans (+ demo company)
npm run start:dev                          # http://localhost:3000
```

> Using the old database from the first version? Its tables don't match the new schema.
> Run `npx prisma migrate reset` first (it **deletes** the old test data), or point `DATABASE_URL` to a new database.

### 2) App

```bash
# in the project root
cp .env.example .env          # nothing to fill during development (see the comments in the file)
npx expo install expo-secure-store react-native-safe-area-context expo-constants
npm install
npx expo start                # press w for web, or scan the QR code with your phone
```

During development the app finds the API on your computer automatically (the same address Expo puts in the QR code), so switching Wi-Fi networks needs no changes. The address in use is shown under the sign-in form. Phone and computer must be on the same network, and Windows Firewall must allow port 3000.

### Test accounts (after `db:seed` with `SEED_DEMO=1`)

| Who | Email | Password |
|---|---|---|
| Demo company (active Pro plan) | `demo@aqartech.test` | `Demo@12345` |
| Platform team | `ADMIN_EMAIL` from `backend/.env` | `ADMIN_PASSWORD` |

New sign-ups start as **awaiting activation**; activate them from the platform-team account → *Subscribers*.

## Passwords

- **Forgot password** (sign-in screen): a 6-digit code is emailed. With `SMTP_HOST` empty (development) the email is
  **printed in the API terminal** instead — copy the code from there. A Gmail account with an App password works as SMTP before you own a domain (see `backend/.env.example`).
- **Team members:** the company's main account sets/generates a new password from *Users & roles → edit*.
- **Platform admin:** `cd backend && npm run admin:reset-password -- admin@aqartech.om "New-Strong-Password"`
- Any password change signs the account out on its other devices.

## Checks

```bash
cd backend && npm test && npm run lint && npm run build
```
