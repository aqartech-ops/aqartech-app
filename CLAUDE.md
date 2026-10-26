@AGENTS.md

# AqarTech — instructions for Claude

Read `docs/PROJECT.md` first: it is the source of truth for what we are building and every decision made so far.
New decisions go into `docs/PROJECT.md` before they go into code.

## Stack (do not change tools)
- App: Expo SDK 57 + React Native + react-native-web — one codebase for phone, tablet and web.
  Files keep the existing layout: `App.js`, `screens/`, `services/`, `theme.js`. Read the Expo v57 docs before writing app code.
- Backend: NestJS + Prisma + PostgreSQL in `backend/`. The ONLY Prisma schema is `backend/prisma/schema.prisma`.

## Non-negotiable rules
- **Money is stored as integer baisa** (1 OMR = 1000 baisa). Never use Float/Decimal-as-float for money. Format only at display time.
  Use `Int` for everyday amounts (rents, payments) and `BigInt` for amounts that can exceed 2.1M OMR (property values, investment cost, large totals). BigInt is sent to the app as a JSON number (see backend/src/main.ts).
- **Dashboard:** open to every user; each widget is returned by the server only if the user may see that section (`GET /dashboard`).
- **Property scope:** roles may be limited to some properties (`Role.propertyIds`, empty = all); every property/unit query goes through `propertyScope(auth)`.
- **Financial records are never hard-deleted or silently changed.** Edit/delete of a posted financial entry creates a reversing entry and an activity-log row.
- **Reports are computed from transactions**, never typed in by hand.
- **No hard-coded UI text.** Every string goes through i18n (`en` default, `ar` full, RTL supported). Add keys to both languages.
- **No hard-coded plan limits or prices.** Limits/features come from the `Plan` records managed by platform admins.
- **Multi-tenant:** every company-owned row carries `companyId`; every query is scoped to the caller's company.
- **Permissions:** per section and per property — `EDIT` / `VIEW` / `HIDDEN`. Owners (property owners linked to a company) are read-only.
- **Secrets** live in `.env` (never committed). Keep `.env.example` up to date.
- Prefer soft delete (trash, restorable) for normal records.
- **Keyboard must never cover a field:** build screens and forms with `Screen`, `Sheet`, `Field`, `MoneyField`; any other scrolling form uses `KeyboardScrollView` from `components/keyboard.js`, and any raw `TextInput` uses `useRevealOnFocus`.

## Workflow
- Work on a branch, open a PR per step, describe the change in Arabic for the owner.
- Run backend tests/lint and an app type/web build check before opening a PR when the environment allows it.
