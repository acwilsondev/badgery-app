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

Prereqs: Node 20+, a running PostgreSQL.

    cp .env.example .env      # then edit DATABASE_URL
    npm install
    npm run db:push           # sync schema to the database
    npm run db:seed           # optional: seed sample data
    npm run dev               # serves API + client on http://localhost:5000

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
