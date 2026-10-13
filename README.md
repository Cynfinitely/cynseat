# CynSeat

Free ticketing for NGOs and event organizers. Organizations register, create events at new or existing venues, and sell tickets; buyers get QR-coded tickets by email.

> **Status: rebuild in progress.** The single-event storefront that used to live here is being replaced by a multi-organization platform. Finished so far: the application foundation (this page describes it). Organizations, events, payments, seat maps and check-in follow in later phases.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router), React 19, TypeScript
- Tailwind CSS 4
- PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- [next-intl](https://next-intl.dev/) with English, Finnish and Turkish under `/en`, `/fi`, `/tr`
- Vitest, Testcontainers and Playwright for tests

## Getting started

Requirements: Node.js 22.12 or newer, [pnpm](https://pnpm.io/), and Docker (Docker Desktop, Colima or similar).

```bash
pnpm install
cp .env.example .env.local
pnpm db:up        # Postgres in Docker on port 5433
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable                | Used for                                       |
| ----------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`   | Public base URL of the app                     |
| `DATABASE_URL`          | Postgres connection string                     |
| `DATABASE_URL_UNPOOLED` | Optional direct connection used for migrations |

Variables are validated at startup in `src/lib/env.ts`; the build fails if one is missing or malformed.

## Project structure

```
src/app/            routes; pages live under [locale]/, API routes under api/
src/components/     shared UI
src/domain/         pure business rules, no I/O
src/server/         database, use-cases (modules/*/service.ts) and integrations; no Next.js imports
src/i18n/           locale routing and message loading
src/lib/            environment validation and small helpers
messages/           UI strings, one JSON file per feature and locale
tests/              end-to-end tests and the integration-test database harness
scripts/            local database, migrations, message checks
```

ESLint enforces the layering: `src/domain` imports nothing from the rest of the app, `src/server` does not import Next.js, and pages do not import the database directly.

## Scripts

| Command                                        | Description                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                                     | Start the development server                                        |
| `pnpm build` / `pnpm start`                    | Production build and server                                         |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | Static checks                                                       |
| `pnpm check:messages`                          | Verify all locales have the same message keys                       |
| `pnpm test`                                    | Unit tests                                                          |
| `pnpm test:integration`                        | Integration tests against a real Postgres started by Testcontainers |
| `pnpm test:e2e`                                | Playwright tests against a production build (needs `pnpm db:up`)    |
| `pnpm db:up` / `db:down` / `db:reset`          | Start, stop or recreate the local Postgres container                |
| `pnpm db:generate`                             | Generate a migration from schema changes                            |
| `pnpm db:migrate`                              | Apply migrations                                                    |

## License

[MIT](LICENSE)
