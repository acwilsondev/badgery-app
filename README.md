# Badgery

A multi-tenant achievement-badge platform: organizations define badges with
prerequisites and progress metrics, and award them to their members.

> **Status:** under active modernization — see
> `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` for the
> roadmap (security hardening, tests/CI, restructure, Docker/CD are tracked
> there as Phases 1–5).

## Stack

- **Server:** Express 4 + TypeScript, session auth (Postgres-backed), Drizzle ORM
- **Client:** React 18, Vite, wouter, TanStack Query, shadcn/ui, Tailwind
- **Database:** PostgreSQL (schema in `shared/schema.ts`, single source of truth for types)

## Getting started

Prereqs: Node 20+, Docker (or any PostgreSQL 15+).

    docker compose up -d      # starts local Postgres (see docker-compose.yml)
    cp .env.example .env      # then set SESSION_SECRET (openssl rand -hex 32)
    npm install
    npm run db:push           # sync schema to the database
    npm run db:seed           # optional: seed sample data (all users: password123)
    npm run dev               # serves API + client on http://localhost:5000

`.env` is loaded automatically (dotenv) by the server, the seed script, and
drizzle-kit. `SESSION_SECRET` must be ≥ 32 chars and is required in
production — the process exits without it. In development a missing secret
falls back to an ephemeral one (sessions reset on restart).

**Resetting the database** (no migrations exist yet; pre-Phase-1 databases
hold plaintext passwords and must be reset):

    docker exec badgery-postgres psql -U badgery -d badgery \
      -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    npm run db:push && npm run db:seed

Login/register are rate-limited (10/15min and 5/hour per IP); restart the
dev server to reset the counters.

## Running tests

Integration tests run against a dedicated `badgery_test` database on the
same Postgres instance as dev — they never touch your `badgery` dev data.

    npm test          # resets + migrates badgery_test, then runs the suite once
    npm run test:watch # same, but re-runs on file changes

The database reset (`DROP SCHEMA public CASCADE` + `db:push`) happens once
per run automatically; individual tests create their own organizations/users
with randomized names rather than sharing seed data.

## Scripts

| Script                 | What it does                             |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Dev server (API + Vite client, one port) |
| `npm run check`        | TypeScript typecheck                     |
| `npm run lint`         | ESLint                                   |
| `npm run format:check` | Prettier check                           |
| `npm run build`        | Production build to `dist/`              |
| `npm start`            | Run the production build                 |
| `npm run db:push`      | Push schema to DB (drizzle-kit)          |
| `npm run db:seed`      | Seed sample data                         |

## Layout

    client/   React app
    server/   Express API (routes.ts, storage.ts, middleware.ts)
    shared/   Drizzle schema + zod insert schemas (shared types)
    db/       DB client, migrations, seed
    openapi/  API contract (being brought up to date)
