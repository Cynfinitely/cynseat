# CynSeat

Free ticketing for NGOs and event organizers. Organizations register, create events at new or existing venues, and sell tickets; buyers get QR-coded tickets by email.

> **Status: rebuild in progress.** The single-event storefront that used to live here is being replaced by a multi-organization platform. Working today: accounts; organizations with roles (admin, member, door staff), invitations and platform approval; the shared venue directory; multilingual events with ticket types and posters; the public storefront; general-admission and reserved-seat ticket sales (a seat-map editor for organizers, a seat picker for buyers, reservations, checkout, QR-coded tickets on the page, by email and as PDF); each organization's own Stripe account; refunds, including automatic refunds when an event is cancelled; door check-in; attendee exports; and a buyer account that picks up guest orders. The Stripe integration is written and unit-tested but has not yet been run against Stripe itself; by default payments use a built-in test gateway.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router), React 19, TypeScript
- Tailwind CSS 4
- PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- [Better Auth](https://www.better-auth.com/) for accounts, organizations and invitations
- [next-intl](https://next-intl.dev/) with English, Finnish and Turkish under `/en`, `/fi`, `/tr`
- Vitest, Testcontainers and Playwright for tests

## Getting started

Requirements: Node.js 22.12 or newer, [pnpm](https://pnpm.io/), and Docker (Docker Desktop, Colima or similar).

```bash
pnpm install
cp .env.example .env.local
pnpm db:up        # Postgres in Docker on port 5433
pnpm db:migrate
pnpm db:seed      # optional: demo accounts, an approved organization and a published event
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Set `BETTER_AUTH_SECRET` and `SIGNING_SECRET` in `.env.local` first (`openssl rand -base64 32` for each).

With `MAIL_DRIVER=console` (the default) emails are printed to the server log, so the confirmation link for a new account appears in the terminal running `pnpm dev`.

`pnpm db:seed` prints two demo sign-ins: a platform admin and the admin of a demo organization. It refuses to run in production.

New organizations wait for approval by a platform admin. To make yourself one, sign up and then run:

```bash
pnpm admin:grant you@example.com
```

The approval queue is at `/en/admin/organizations`.

### Environment variables

| Variable                                             | Used for                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                | Public base URL of the app                                                                                                  |
| `DATABASE_URL`                                       | Postgres connection string                                                                                                  |
| `DATABASE_URL_UNPOOLED`                              | Optional direct connection used for migrations                                                                              |
| `BETTER_AUTH_SECRET`                                 | Signs sessions and tokens (32+ characters)                                                                                  |
| `SIGNING_SECRET`                                     | Signs order links and ticket QR codes (32+ characters). Changing it invalidates those already issued                        |
| `PAYMENTS_DRIVER`                                    | `fake` (built-in test payment page; refused in production) or `stripe`                                                      |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`         | Needed when `PAYMENTS_DRIVER=stripe`. Point a Stripe webhook that listens to connected accounts at `/api/webhooks/payments` |
| `PLATFORM_FEE_BPS`, `PLATFORM_FEE_FIXED_MINOR`       | CynSeat's fee on paid orders; both default to 0                                                                             |
| `MAIL_DRIVER`                                        | `console` (print emails) or `resend` (send them)                                                                            |
| `RESEND_API_KEY`, `EMAIL_FROM`                       | Needed when `MAIL_DRIVER=resend`                                                                                            |
| `STORAGE_DRIVER`                                     | `local` (posters on this machine's disk, development only) or `vercel-blob`                                                 |
| `BLOB_READ_WRITE_TOKEN`                              | Needed when `STORAGE_DRIVER=vercel-blob`                                                                                    |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional shared counters for rate limiting; without them each server instance counts on its own                             |
| `CRON_SECRET`                                        | Protects `/api/cron/*`; Vercel Cron sends it automatically                                                                  |

Variables are validated at startup in `src/lib/env.ts`; the build fails if one is missing or malformed.

## Project structure

```
src/app/            routes; pages live under [locale]/, API routes under api/
src/components/     shared UI
src/features/       forms and server actions, one folder per feature
src/domain/         pure business rules, no I/O
src/server/         database, use-cases (modules/*/service.ts) and integrations; no Next.js imports
src/i18n/           locale routing and message loading
src/lib/            environment validation and small helpers
messages/           UI strings, one JSON file per feature and locale
tests/              end-to-end tests and the integration-test database harness
scripts/            local database, migrations, message checks
```

Who may do what inside an organization is defined in one table, `src/server/authz/permissions.ts`. Every use-case checks it, and the UI reads the same table to decide what to show.

ESLint enforces the layering: `src/domain` imports nothing from the rest of the app, `src/server` does not import Next.js, and pages do not import the database directly.

## Scripts

| Command                                        | Description                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                     | Start the development server                                            |
| `pnpm build` / `pnpm start`                    | Production build and server                                             |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | Static checks                                                           |
| `pnpm check:messages`                          | Verify all locales have the same message keys                           |
| `pnpm test`                                    | Unit tests                                                              |
| `pnpm test:integration`                        | Integration tests against a real Postgres started by Testcontainers     |
| `pnpm test:e2e`                                | Playwright tests against a production build (needs `pnpm db:up`)        |
| `pnpm db:up` / `db:down` / `db:reset`          | Start, stop or recreate the local Postgres container                    |
| `pnpm db:generate`                             | Generate a migration from schema changes                                |
| `pnpm db:migrate`                              | Apply migrations                                                        |
| `pnpm db:seed`                                 | Create demo accounts, an organization and an event (not for production) |

## License

[MIT](LICENSE)
