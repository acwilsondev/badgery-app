# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Badgery: a multi-tenant achievement-badge platform. Organizations define
badges with prerequisites and progress metrics, and award them to their
members. It's a Replit-generated prototype (last human commit May 2025) that
is currently under active modernization — see
`docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` for the
full roadmap (Phases 0–5: hygiene, security, tests/CI, restructure,
Docker/CD, agentic layer) and `docs/superpowers/plans/` for the
already-executed phase plans. Phases 0–3d are done (server restructure into feature modules, client type
cleanup, OpenAPI rewrite). Phase 4 (Docker + k8s GitOps deploy) is done —
see "Deployment" below; Phase 5 (agentic layer) is not done yet.

## Stack

- **Server:** Express 4 + TypeScript (ESM, `tsx` for dev), session auth
  (argon2id password hashing, Postgres-backed sessions via
  `connect-pg-simple`), Drizzle ORM
- **Client:** React 18, Vite, wouter (routing), TanStack Query, shadcn/ui
  (Radix primitives), Tailwind
- **Database:** PostgreSQL 15+ (17 in Docker/CI). `shared/schema.ts` is the
  single source of truth for both the Drizzle schema and zod
  insert/validation schemas (via `drizzle-zod`) — client and server both
  import types from here rather than redeclaring them.
- **Validation:** zod on every request body, using schemas derived from
  `shared/schema.ts`.

## Getting started / running

This repo pins its Node version via `flake.nix` + `.envrc` (Nix flakes +
direnv) — matches whatever `.github/workflows/ci.yml`'s `actions/setup-node`
uses (currently Node 22), so `npm ci`/`npm install` resolve the same way
locally as in CI. If you have direnv and Nix (with flakes enabled) set up,
`cd` into the repo and run `direnv allow` once; it activates automatically
after that. Without direnv, you'll need a Node version matching CI yourself
(`nix develop`, `nvm`, etc.) — a Node-version mismatch has broken CI's
`package-lock.json` resolution before (see the gotcha below).

```
docker compose up -d      # starts local Postgres (see docker-compose.yml)
cp .env.example .env      # then set SESSION_SECRET (openssl rand -hex 32)
npm install
npm run db:push           # sync schema to the database (no migrations yet)
npm run db:seed           # optional: seed sample data (all users: password123)
npm run dev               # serves API + client on one port, http://localhost:5000
```

`.env` is auto-loaded (dotenv) by the server, `db/seed.ts`, and
`drizzle.config.ts`. `SESSION_SECRET` must be ≥32 chars and is required in
production (`server/config.ts` exits the process if missing); in
development a missing secret falls back to an ephemeral one, so sessions
reset on every restart.

**Resetting the dev DB** (no migrations exist yet beyond the baseline; do
this instead of writing a migration for schema changes during prototyping):

```
docker compose exec postgres psql -U badgery -d badgery \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npm run db:push && npm run db:seed
```

Login/register are rate-limited (10/15min, 5/hour, per IP, in-memory —
resets on dev-server restart).

## Commands

| Command                | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `npm run dev`           | Dev server (API + Vite client, one port, via `tsx`)       |
| `npm run check`         | TypeScript typecheck (`tsc`, no emit)                      |
| `npm run lint`          | ESLint                                                     |
| `npm run lint:fix`      | ESLint with autofix                                        |
| `npm run format`        | Prettier write                                             |
| `npm run format:check`  | Prettier check                                             |
| `npm test`              | Reset + migrate `badgery_test`, then run the vitest suite once |
| `npm run test:watch`    | Same, but watch mode                                       |
| `npm run build`         | Production build to `dist/` (Vite client + esbuild server) |
| `npm start`             | Run the production build (`NODE_ENV=production node dist/index.js`) |
| `npm run db:push`       | Push `shared/schema.ts` to the DB (drizzle-kit, `--force`) |
| `npm run db:seed`       | Seed sample data (`db/seed.ts`)                            |

There's no single "verify everything" script yet; CI runs
`npm run check && npm run lint && npm test && npm run build` (see below).

### Tests

Integration-only (no unit tests, no separate unit-test runner): vitest +
supertest hitting real HTTP endpoints against a real Postgres. Tests run
against a dedicated `badgery_test` database on the same Postgres instance
as dev (`DATABASE_URL` is overridden inline in the `test`/`test:watch`
npm scripts) — they never touch `badgery` dev data.

- `tests/globalSetup.ts` does `DROP SCHEMA public CASCADE` + `db:push`
  once per `npm test` run. It refuses to run unless `DATABASE_URL`
  contains `badgery_test`, as a guard against wiping the wrong database.
- Individual tests create their own organizations/users with randomized
  names (`tests/support/fixtures.ts`, `uniqueSuffix()`) rather than
  sharing seed data, and are never cleaned up — uniqueness plus the
  once-per-run schema reset is what keeps tests isolated.
- `vitest.config.ts` sets `fileParallelism: false` deliberately: all test
  files share one Postgres instance and per-test (not per-file) fixture
  isolation, so running files concurrently would create connection-pool
  pressure and confusing interleaved failures.
- To run a single test file: `npm test -- tests/badges.test.ts` (or use
  `test:watch` and vitest's filtering).
- Test files: `tests/{auth,badges,health,organizations,progress,stats,users}.test.ts`.

### CI

`.github/workflows/ci.yml` runs on every PR into `main` and on push to
`main`: `npm ci`, `npm run check`, `npm run lint`, `npm test`, `npm run
build`, against a `postgres:17` service container. Intended as a required
status check on `main`.

## Deployment

`Dockerfile` builds a production image (`node:22-alpine`, multi-stage:
`npm run build` in a builder stage, `npm ci --omit=dev` + the built
`dist/` in the runtime stage). `.github/workflows/build.yml` builds and
pushes `ghcr.io/acwilsondev/badgery-app:latest` and
`ghcr.io/acwilsondev/badgery-app:<commit sha>` on every push to `main`.

The image is deployed to Aaron's personal k3s homelab cluster via Argo CD
GitOps — the actual deploy config (Helm values, Postgres, Traefik
ingress, secrets setup) lives in a separate repo,
`~/Projects/homelab-docker` (`k8s/apps/badgery/` and
`k8s/apps/badgery-postgres/`), not in this one. Promoting a new image
build is a manual step there (bump the pinned image tag in
`k8s/apps/badgery/values.yaml`, push) — see that repo's
`k8s/apps/badgery/SETUP.md`.

`GET /healthz` checks real DB connectivity (`SELECT 1`) and is what the
k8s liveness/readiness probes hit — not just a process-alive check.

## Architecture

One Express process serves both the API and the built client on a single
port (`config.port`, default 5000); in dev, Vite middleware handles the
client, in production `serveStatic` serves the built `dist/public`
(`server/static.ts`). API routes live under `/api/v1`.

```
server/
  index.ts          # bootstrap only: creates the app, starts listening
  app.ts             # express assembly: session middleware, feature route
                      # registration, request logging, error handler
  config.ts          # zod-validated env (DATABASE_URL, SESSION_SECRET, PORT)
  middleware/
    auth.ts           # isAuthenticated / hasOrganizationAccess / isAdminOrManager
                       # guards + requireSessionUserId() helper
    asyncHandler.ts    # wraps async route handlers so rejected promises
                       # reach errorHandler instead of hanging
    errors.ts          # ApiError and subclasses (NotFoundError,
                       # ForbiddenError, UnauthorizedError, ValidationError)
                       # + errorHandler middleware mapping them to
                       # { message, code } JSON responses
  features/
    auth/              # login, register, session (routes.ts + service.ts)
    users/
    organizations/      # orgs, membership, scopes
    badges/              # badges, prerequisites, metrics
    progress/            # achievements, user progress
```

Each feature module pairs `routes.ts` (HTTP layer: route definitions, zod
`.parse()` on request bodies, calls into the service) with `service.ts`
(business logic + Drizzle queries). There is no `server/routes.ts` or
`server/storage.ts` monolith anymore — those were deleted at the end of
the Phase 3a restructure; if you see references to them (e.g. in older
docs) they're stale.

Services throw typed errors (`NotFoundError`, `ForbiddenError`,
`UnauthorizedError`, `ValidationError`, all subclasses of `ApiError` in
`server/middleware/errors.ts`); the single `errorHandler` middleware maps
these — and raw `z.ZodError`s from `.parse()` — to a standard
`{ message, code }` JSON shape. Routes don't use per-handler try/catch;
`asyncHandler` plus this central handler cover it.

Auth: session-based (not JWT), Postgres-backed via `connect-pg-simple`
(table `session`, auto-created), `req.session.userId` /
`req.session.organizationId`. Passwords hashed with argon2id. Route
protection is middleware-based (`middleware/auth.ts`): `isAuthenticated`,
`hasOrganizationAccess` (multi-tenant org isolation — checks the acting
user belongs to the target org, admins bypass), `isAdminOrManager`.

Client (`client/src/`):
- `pages/` — route-level components (dashboard, badges, users, progress,
  register, user-profile, branding, not-found), wired up via wouter in
  `App.tsx`.
- `components/` — feature components (dialogs for awarding/editing badges
  and progress, sidebar, page-header); `components/ui/` is the shadcn/ui
  primitive set.
- `lib/` — `queryClient.ts` (TanStack Query setup), `badge-icons.tsx`,
  `utils.ts`.
- `types/` — client-only types with no `shared/schema.ts` equivalent
  (e.g. `AuthUser` for the session/auth-response shape, `OrgUser` for the
  users-by-organization endpoint response). Everything else should import
  directly from `@shared/schema` rather than hand-duplicating a type —
  this was a deliberate Phase 3b cleanup; don't reintroduce duplicates.

Path aliases (see `tsconfig.json` / `vitest.config.ts`): `@/*` →
`client/src/*`, `@shared/*` → `shared/*`, `@db` / `@db/*` → `db/index.ts`
/ `db/*`.

`db/` — Drizzle client (`index.ts`), migration runner (`migrate.ts`), seed
script (`seed.ts`), and `migrations/` (drizzle-kit output; currently just
the baseline plus one manual `add_criteria_type.sql`). There's no
established migration workflow yet — day-to-day schema changes go through
`npm run db:push` against a resettable dev DB rather than generated
migrations.

`openapi/openapi.yaml` — the API contract. Per the modernization spec this
is being brought back up to date with the real routes; don't assume it's
authoritative until that work is confirmed done, and prefer reading the
actual `features/*/routes.ts` files as ground truth.

## Known issues / gotchas worth knowing before touching related code

- **Badge progress persistence is broken.** The `POST
  /badges/:badgeId/progress/:userId` route and the client
  (`badge-progress-dialog.tsx`) both send a flat `{ progress: 0-100 }`
  percentage, but service-layer persistence is built around a per-metric
  `badgeMetrics`/`metrics`/`progress` model with no backing storage for a
  flat percentage. For badges without pre-configured `badgeMetrics` rows
  (the normal case for badges created through the UI), the POST silently
  no-ops and the 100%-auto-award check never fires. This needs a real
  design decision (persist the flat percentage directly, or move the
  route/client onto the metrics model) — see the Phase 3 section of
  `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` for
  full detail. `tests/progress.test.ts` documents current (broken)
  behavior.
- **Don't run a bare `npm install`** — it can silently re-mutate
  `package-lock.json` to the local npm's resolution style, which then
  breaks CI (pinned to a specific Node version, currently 22, and its
  bundled npm, via `.github/workflows/ci.yml`). If a step accidentally
  produces a lockfile diff, `git checkout -- package-lock.json` and
  investigate rather than committing it. `flake.nix`/`.envrc` (direnv) pin
  the same Node version locally so this is less likely to bite day-to-day,
  but if you're on a machine without direnv/Nix, verify your local Node
  major version matches CI's before touching the lockfile — if it doesn't
  and Docker isn't available either, `podman run --rm -v "$(pwd)":/app:Z -w
  /app --network host node:<CI version> sh -c "npm ci && ..."` reproduces
  CI's exact environment (see PR #35 for the pattern; used once already to
  work around this repo not having a matching local Node before the
  flake/direnv setup existed).
- `db/migrations/` is excluded from ESLint (generated output).
- `@typescript-eslint/no-explicit-any` is deliberately off repo-wide — the
  codebase has a lot of `any` left over from its prototype days; cleaning
  it up is tracked as later Phase-3 work, not an ESLint gate. Don't treat
  new `any` usage as automatically fine, but don't be surprised lint
  doesn't flag it either.
- `docs/tech/data_model.md` is a short, informal entity/relationship
  sketch (User, Organization, Badge, Metric, Achievement, Progress, join
  tables) — useful as a quick mental model, but `shared/schema.ts` is the
  actual source of truth for fields/types.
