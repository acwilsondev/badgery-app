# Badgery Modernization to 2026 Agentic Engineering Standards — Design

**Date:** 2026-07-13
**Status:** Approved
**Author:** Aaron Wilson + Claude

## Goal

Revive Badgery (a multi-tenant achievement-badge platform, currently a dormant
Replit-generated prototype) as a real product. Bring the repo up to 2026 agentic
engineering standards: a codebase an AI agent (or a human) can pick up cold,
verify with one command, change safely, and deploy.

## Decisions

- **Purpose:** real product development resumes after modernization.
- **Stack:** keep Express + Drizzle + Postgres + React/Vite/shadcn; aggressively
  restructure the code, no framework migration.
- **Deployment:** self-hosted VPS via Docker Compose; CD through GitHub Actions.
- **Auth:** hashed local auth (argon2id) with Postgres-backed sessions; OIDC can
  layer on later.
- **Strategy:** stabilize → instrument → restructure (Option 1). API-level
  integration tests are written _before_ the restructure so they act as the
  regression net during it.

## Assumptions

- This is a prototype with **no production data**. The database may be reset;
  no password-migration or data-migration code is needed.
- The repo stays a single package (no monorepo split); `client/`, `server/`,
  `shared/` remain top-level.

## Current state (summary)

- Last human commit May 2025; only Dependabot since. 12 open Dependabot PRs.
- `tsc --noEmit` fails with 38 errors (23 in `server/routes.ts`, 7 in the dead
  `server/routes.updated.ts`).
- Plaintext password comparison at login; hardcoded fallback session secret;
  `secure: false` cookies.
- No tests, no CI, no README, no lint config.
- Dead files: `server/routes.ts.bak`, `server/routes.updated.ts`, root-level
  `badge-dialog-backup.tsx` / `badge-dialog-new.tsx`, one-off scripts in `db/`,
  Replit screenshots in `attached_assets/`.
- Monoliths: `server/routes.ts` (1,083 lines), `server/storage.ts` (1,075 lines).
- Client duplicates types from `shared/schema.ts` by hand (source of several
  type errors).

## Phase plan

Each phase leaves the repo working and shippable.

### Phase 0 — Baseline hygiene

- Delete dead files: `server/routes.updated.ts`, `server/routes.ts.bak`,
  `badge-dialog-backup.tsx`, `badge-dialog-new.tsx`, one-off db scripts
  (`align-schema-with-doc.sql`, `run-align-schema.ts`, `run-migration.ts`),
  `attached_assets/`.
- Fix all remaining type errors; `npm run check` exits 0.
- Add README (what it is, how to run it), `.env.example`, LICENSE (MIT, matching
  package.json), ESLint + Prettier config with scripts.
- Dependency triage: merge patch/minor security Dependabot PRs (express-session/
  on-headers, lodash, path-to-regexp, brace-expansion, minimatch, picomatch,
  glob, yaml, rollup). **Defer majors** (vite 5→8, drizzle-orm 0.38→0.45) to
  Phase 3 when tests exist.

### Phase 1 — Security

- argon2id password hashing on register/login.
- `config.ts` style env validation begins here for secrets: `SESSION_SECRET`
  required (process exits if missing in production); remove the
  `"meritmark-secret"` fallback.
- Session cookies: `secure: true` behind `app.set("trust proxy", 1)` in
  production, `httpOnly`, `sameSite: "lax"`.
- Rate limiting on `/api/login` and `/api/register`.
- zod validation on all request bodies using the existing drizzle-zod schemas.
- Reset the database (no data to preserve) rather than migrate passwords.

### Phase 2 — Test harness + CI

- Vitest + supertest, integration-first: tests hit real HTTP endpoints against
  a real Postgres (docker-compose service locally, service container in CI).
- Coverage bar: every endpoint's happy path **plus** the multi-tenant authz
  rules (org isolation, permission scopes) — the area the last human commits
  were hardening.
- Fixtures via a test seed builder (per-test data), not shared mutable seed.
- GitHub Actions PR gate: typecheck, lint, test, build. Required on `main`.

### Phase 3 — Aggressive restructure

Done under the Phase-2 safety net; the integration tests must pass unchanged.

Target layout:

```
server/
  index.ts            # bootstrap only (~30 lines)
  app.ts              # express assembly: middleware, features, error handler
  config.ts           # zod-validated env (DATABASE_URL, SESSION_SECRET, PORT…)
  middleware/         # auth guards, error handling, request logging
  features/
    auth/             # routes + service: login, register, session
    organizations/    # routes + service: orgs, membership, scopes
    users/
    badges/           # badges, prerequisites, metrics
    progress/         # achievements, user progress
```

- Each feature: `routes.ts` (HTTP + zod validation) and `service.ts` (logic +
  Drizzle queries). `server/routes.ts` and `server/storage.ts` are deleted at
  the end of this phase.
- `shared/schema.ts` is the single source of truth for types; delete the
  client's hand-written duplicates (`Badge` etc.) and import from `shared/`.
  Fix the broken `useIsMobile`/`useMobile` import. Client structure otherwise
  unchanged.
- Error handling: services throw typed errors (`NotFoundError`,
  `ForbiddenError`, `ValidationError`); one error middleware maps them to
  status codes with a standard JSON shape `{ message, code }`. Per-route
  try/catch blocks are removed.
- API contract: update `openapi/openapi.yaml` to match reality; add a CI test
  that enumerates registered Express routes and fails if routes and spec
  disagree.
- Take the deferred major dependency bumps (vite, drizzle-orm) here, tests
  green after each.
- **Badge progress persistence is broken and needs a real design decision.**
  `storage.createOrUpdateBadgeProgress` only persists progress against a
  per-metric `badgeMetrics`/`metrics`/`progress` model, but the route
  (`POST /badges/:badgeId/progress/:userId`) and the real client
  (`client/src/components/badge-progress-dialog.tsx`) both send a flat
  `{ progress: 0-100 }` percentage that has no backing storage anywhere.
  For any badge without pre-configured `badgeMetrics` rows (the normal
  case for badges made through the UI), the POST silently no-ops
  (200 + `null` body) and the 100%-auto-award check never fires. Fix
  requires deciding whether storage should persist the flat percentage
  directly, or the route/client should move onto the metrics model.
  Separately, `autoAwardBadgeIfComplete` (`server/storage.ts`) writes
  `status: "completed"` directly via Drizzle, bypassing
  `achievementsInsertSchema`'s `["in_progress", "achieved"]` enum
  entirely — inconsistent with the manual award path's `"achieved"`.
  Reconcile both status values when this is fixed. Regression tests
  documenting the current (broken) behavior: `tests/progress.test.ts`.

### Phase 4 — Docker + CD

- Multi-stage Dockerfile (build → slim runtime image).
- docker-compose for the VPS: app + Postgres + volume; `.env`-driven config.
- `/healthz` endpoint (checks DB connectivity) used by compose healthcheck and
  the deploy workflow.
- GitHub Actions CD: on merge to `main`, build image, deploy to VPS over SSH,
  verify health.

### Phase 5 — Agentic layer

Written last so it documents the final structure.

- **CLAUDE.md:** stack, commands (`dev`, `check`, `lint`, `test`, `db:*`,
  `verify`), architecture map of the feature-module layout, conventions
  (error types, where tests live, shared types), gotchas (Docker Postgres
  needed for tests).
- **Project skills** (`.claude/skills/`): `run` (start dev env including
  database), `verify` (typecheck + lint + test + build in one command),
  `deploy` (trigger and monitor the CD workflow).
- **Hooks + permissions** (`.claude/settings.json`): allowlist common
  read-only and verify commands; stop-hook running typecheck + lint so an
  agent can't end a turn with a broken build.
- **Automation & routines:** Dependabot config (weekly, grouped updates); a
  scheduled agent routine that triages Dependabot PRs (merge patch/minor when
  CI is green; open a summarizing issue for majors); `/code-review` on PRs.

## Testing strategy

Integration-first. Unit tests only where logic is genuinely isolated (e.g.,
badge-prerequisite resolution). The integration suite doubles as the
restructure safety net and the ongoing agent verification loop.

## Success criteria

1. `verify` (single command) runs typecheck + lint + tests + build and passes.
2. A fresh agent session goes clone → running app → passing tests using only
   README/CLAUDE.md.
3. Every API endpoint has happy-path + authz test coverage.
4. Passwords hashed; no secrets in the repo; secure session config.
5. Merge to `main` deploys to the VPS automatically with a health check.
6. Dependabot PRs are triaged automatically.
