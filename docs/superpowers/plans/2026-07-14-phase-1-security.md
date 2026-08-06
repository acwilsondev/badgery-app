# Phase 1 — Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Badgery's auth: argon2id password hashing, enforced `SESSION_SECRET`, secure session cookies, rate-limited auth endpoints, zod validation on every request body, and automatic `.env` loading — with the dev database reset to hashed credentials.

**Architecture:** All changes are surgical edits to the existing monolith files (`server/index.ts`, `server/routes.ts`, `db/index.ts`, `db/seed.ts`, `shared/schema.ts`) — the restructure is Phase 3. One new file, `server/config.ts`, introduces zod-validated env for secrets. The DB driver swaps from the Replit-era Neon serverless WebSocket driver to plain `pg`, which is required for the app to run against a standard local/self-hosted Postgres (spec deployment target is a self-hosted VPS; Phase 2's test harness also requires it).

**Tech Stack:** Express 4, express-session + connect-pg-simple, Drizzle ORM (`node-postgres` driver), drizzle-zod, zod 3, argon2 (argon2id), express-rate-limit, dotenv.

## Global Constraints

- **Shell gotcha:** every `npm`/`npx`/`node`/`tsx` invocation MUST be prefixed with `unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH` (nvm lazy-loading breaks non-interactive shells; shell state does not persist between commands).
- Branch: `phase-1-security` off up-to-date `main`. One commit per task. Never commit `.env`.
- No test framework exists yet (Phase 2). The verify cycle for every task is: `npm run check` (exit 0), `npm run lint` (exit 0), plus the task's curl smoke tests against the dev server (`npm run dev`, port 5000) backed by the local `badgery-postgres` Docker container from Task 1.
- Zod validation failures return **400** with body `{ errors: error.errors }` — the shape the existing register / create-organization handlers already use. Do not invent a new error shape.
- Do **not** restructure handlers, extract services, or fix unrelated logic (that is Phase 3). Make only the changes each task lists. `createOrUpdateBadgeProgress`'s odd body handling stays as-is.
- No database DDL changes: `shared/schema.ts` may gain zod schemas/types only — no `pgTable` edits.
- Spec: `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` (Phase 1 section). Spec assumption "no production data" is why the DB is reset, not migrated.
- When a task says "restart the dev server", kill the running one first: `kill %1` or `pkill -f "tsx server/index.ts"`.

---

### Task 1: Branch, local Postgres, `pg` driver, automatic `.env` loading

**Files:**

- Modify: `db/index.ts` (full rewrite, 16 lines)
- Modify: `drizzle.config.ts:1` (add one import)
- Modify: `package.json` / `package-lock.json` (via `npm install dotenv` and `npm install -D @types/pg`)
- Create: `.env` (gitignored — never committed)

**Interfaces:**

- Produces: `db/index.ts` still exports `pool` (now `pg.Pool`) and `db` (drizzle over node-postgres) — same names, all existing imports (`server/index.ts`, `server/storage.ts`, `db/seed.ts`) keep working. `.env` is auto-loaded by any entrypoint that imports `db/index.ts` or `drizzle.config.ts`.

**Why the driver swap (spec deviation, deliberate):** `@neondatabase/serverless` speaks Neon's WebSocket proxy protocol and cannot connect to a plain Postgres. The spec targets a self-hosted VPS Postgres and Phase 2 needs "tests against a real Postgres (docker-compose service locally)" — so the swap is a Phase-1 prerequisite, and without it nothing in this phase can be runtime-verified. `pg` is already a dependency. `pg.Pool` is API-compatible where used (`pool.query` in storage.ts, connect-pg-simple expects a pg Pool).

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b phase-1-security
```

Expected: `Switched to a new branch 'phase-1-security'`, clean status.

- [ ] **Step 2: Start the dev Postgres container**

```bash
docker run --name badgery-postgres -e POSTGRES_USER=badgery -e POSTGRES_PASSWORD=badgery -e POSTGRES_DB=badgery -p 5432:5432 -d postgres:17
```

If a container named `badgery-postgres` already exists: `docker start badgery-postgres`. Verify: `docker exec badgery-postgres pg_isready -U badgery` prints `accepting connections` (retry after ~3s if it says "starting up").

- [ ] **Step 3: Install dependencies**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm install dotenv && npm install -D @types/pg
```

- [ ] **Step 4: Create `.env`**

```bash
cat > .env <<EOF
DATABASE_URL=postgres://badgery:badgery@localhost:5432/badgery
SESSION_SECRET=$(openssl rand -hex 32)
EOF
```

Confirm `.env` is gitignored: `git check-ignore .env` prints `.env`.

- [ ] **Step 5: Rewrite `db/index.ts`**

Replace the entire file with:

```ts
import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
export const db = drizzle({ client: pool, schema });
```

(Default-import `pg` — it's a CJS package; `import { Pool } from "pg"` is unreliable under ESM.)

- [ ] **Step 6: Add dotenv to `drizzle.config.ts`**

Add as the first line of `drizzle.config.ts`:

```ts
import "dotenv/config";
```

- [ ] **Step 7: Verify — typecheck, schema push, seed, live login**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
```

Expected: both exit 0.

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run db:push && npm run db:seed
```

Expected: tables created, seed logs users/badges created — **without** any `set -a; source .env` (this proves auto-loading). Then:

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run dev &
sleep 5
curl -s -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"password123"}'
```

Expected: `200` JSON with `"username":"admin"` (passwords are still plaintext until Task 4). Kill the dev server.

- [ ] **Step 8: Commit**

```bash
git add db/index.ts drizzle.config.ts package.json package-lock.json
git commit -m "feat: swap Neon serverless driver for pg and auto-load .env via dotenv"
```

---

### Task 2: `server/config.ts` — validated env, `SESSION_SECRET` enforcement

**Files:**

- Create: `server/config.ts`

**Interfaces:**

- Produces: `config` object — `{ nodeEnv: "development" | "test" | "production"; isProduction: boolean; databaseUrl: string; sessionSecret: string }`. Task 3 consumes `config.isProduction` and `config.sessionSecret`. Importing the module validates env as a side effect and calls `process.exit(1)` on failure.

- [ ] **Step 1: Create `server/config.ts`**

```ts
import "dotenv/config";
import crypto from "node:crypto";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
const env = parsed.data;

if (env.NODE_ENV === "production" && !env.SESSION_SECRET) {
  console.error(
    "SESSION_SECRET is required in production. Generate one with: openssl rand -hex 32",
  );
  process.exit(1);
}

function ephemeralSecret(): string {
  console.warn(
    "SESSION_SECRET not set — using an ephemeral secret; sessions will not survive restarts.",
  );
  return crypto.randomBytes(32).toString("hex");
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET ?? ephemeralSecret(),
};
```

- [ ] **Step 2: Verify the enforcement matrix**

`.env` would satisfy the checks, so move it aside for this test and restore it after:

```bash
mv .env .env.stash

# (a) production without SESSION_SECRET → exit 1
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; \
NODE_ENV=production DATABASE_URL=postgres://x npx tsx -e "await import('./server/config.ts')"; echo "exit=$?"
# Expected: "SESSION_SECRET is required in production..." and exit=1

# (b) production with SESSION_SECRET → exit 0
NODE_ENV=production DATABASE_URL=postgres://x SESSION_SECRET=$(openssl rand -hex 32) npx tsx -e "await import('./server/config.ts')"; echo "exit=$?"
# Expected: no output, exit=0

# (c) development without SESSION_SECRET → warns, exit 0
DATABASE_URL=postgres://x npx tsx -e "await import('./server/config.ts')"; echo "exit=$?"
# Expected: ephemeral-secret warning, exit=0

# (d) SESSION_SECRET too short → exit 1
DATABASE_URL=postgres://x SESSION_SECRET=short npx tsx -e "await import('./server/config.ts')"; echo "exit=$?"
# Expected: "SESSION_SECRET must be at least 32 characters", exit=1

mv .env.stash .env
```

(Run all four with the nvm prefix; shown once above for brevity — each separate Bash invocation needs it.)

- [ ] **Step 3: Typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
git add server/config.ts
git commit -m "feat: add server/config.ts with zod-validated env and SESSION_SECRET enforcement"
```

---

### Task 3: Session hardening in `server/index.ts`

**Files:**

- Modify: `server/index.ts:1-31`

**Interfaces:**

- Consumes: `config` from Task 2.
- Produces: session cookies are `httpOnly`, `sameSite: "lax"`, and `secure` in production behind `trust proxy`; the `"meritmark-secret"` fallback is gone.

- [ ] **Step 1: Edit `server/index.ts`**

Make `config` the **first** import (so env validation runs before `@db` initializes the pool), and replace the session block. The top of the file becomes:

```ts
import { config } from "./config";
import express, { type Request, Response, NextFunction } from "express";
import "./types"; // Import session type extensions
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "@db";

const app = express();

// Behind the reverse proxy in production so secure cookies and client IPs work
if (config.isProduction) {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add session middleware
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: config.isProduction,
      httpOnly: true,
      sameSite: "lax",
    },
  }),
);
```

Everything from the request-logging middleware down is unchanged.

- [ ] **Step 2: Verify dev cookie flags**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run dev &
sleep 5
curl -si -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"password123"}' | grep -i set-cookie
```

Expected: `Set-Cookie: connect.sid=...; Path=/; Expires=...; HttpOnly; SameSite=Lax` — **no** `Secure` in dev. Kill the dev server.

- [ ] **Step 3: Verify production cookie flags (build + start)**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run build
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; NODE_ENV=production node dist/index.js &
sleep 3
curl -si -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -H 'X-Forwarded-Proto: https' -d '{"username":"admin","password":"password123"}' | grep -i set-cookie
```

(`NODE_ENV=production` must be set explicitly — `npm start` does it, plain `node dist/index.js` does not. `.env` supplies `DATABASE_URL`/`SESSION_SECRET`.)

Expected: `Set-Cookie: ...; HttpOnly; Secure; SameSite=Lax`. Also confirm a login **without** the `X-Forwarded-Proto: https` header gets a 200 but **no** Set-Cookie header (secure cookie refused over plain http — this proves `secure: true` is active). Kill the server.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
git add server/index.ts
git commit -m "feat: harden sessions — config-driven secret, secure/lax cookies, trust proxy in production"
```

---

### Task 4: argon2id password hashing (register, login, seed) + DB reset

**Files:**

- Modify: `server/routes.ts:33-93` (login + register handlers)
- Modify: `db/seed.ts:155-190` (seed users)
- Modify: `package.json` / `package-lock.json` (via `npm install argon2`)

**Interfaces:**

- Consumes: `storage.getUserByUsername(username)` returns the user row including `password` (the stored hash); `storage.createUser(userData: InsertUser)`.
- Produces: `users.password` column now stores argon2id hashes (format `$argon2id$...`). Login verifies via `argon2.verify`; any non-argon2 stored value (legacy plaintext) fails closed with 401.

- [ ] **Step 1: Install argon2**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm install argon2
```

(`argon2` is a native module; the install compiles or downloads a prebuild. Verify it loads: `npx tsx -e "const a=await import('argon2'); console.log((await a.default.hash('x')).slice(0,10))"` → prints `$argon2id$`.)

- [ ] **Step 2: Update the login handler (`server/routes.ts:33-65`)**

Add `import argon2 from "argon2";` with the other imports at the top of `server/routes.ts`. Replace the handler body:

```ts
app.post(`${apiPrefix}/auth/login`, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    const user = await storage.getUserByUsername(username);
    // argon2.verify throws on malformed stored hashes (e.g. legacy
    // plaintext rows) — treat that as a failed login, not a 500.
    const passwordValid = user
      ? await argon2.verify(user.password, password).catch(() => false)
      : false;
    if (!user || !passwordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Prevent session fixation: issue a fresh session id on login
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );

    req.session.userId = user.id;
    if (user.organizationId) {
      req.session.organizationId = user.organizationId;
    }

    return res.status(200).json({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId || null,
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
```

(The manual `!username || !password` check is replaced by zod in Task 6; keep it for now so this task stays hashing-only. The session-regenerate line is a deliberate Phase-1 hardening addition: session fixation prevention.)

- [ ] **Step 3: Update the register handler (`server/routes.ts:67-93`)**

Hash before storing — only the `createUser` call changes:

```ts
const newUser = await storage.createUser({
  ...userData,
  password: await argon2.hash(userData.password),
});
```

(`argon2.hash` defaults to argon2id.)

- [ ] **Step 4: Update `db/seed.ts`**

Add `import argon2 from "argon2";` at the top. Immediately before the `const users = [` array (around line 156), add:

```ts
const seedPasswordHash = await argon2.hash("password123");
```

In each of the four user objects replace `password: "password123",` with `password: seedPasswordHash,` and delete the `// In a real app...` comment. Also change the admin user's `role: "administrator"` to `role: "admin"` — the middleware checks `role === "admin"`, so the current seed admin fails every admin check (pre-existing seed bug, in scope because we must reseed anyway).

- [ ] **Step 5: Reset the database and reseed**

No production data exists (spec assumption) — reset instead of migrating:

```bash
docker exec badgery-postgres psql -U badgery -d badgery -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run db:push && npm run db:seed
```

- [ ] **Step 6: Verify hashes and live auth flow**

```bash
docker exec badgery-postgres psql -U badgery -d badgery -tc "SELECT password FROM users WHERE username='admin'"
```

Expected: starts with `$argon2id$`.

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run dev &
sleep 5
# correct password → 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"password123"}'
# wrong password → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"nope"}'
# register a new user → 201, then login as them → 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"username":"smoketest","password":"hunter22","name":"Smoke Test","email":"smoke@test.dev"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"smoketest","password":"hunter22"}'
```

Expected: `200`, `401`, `201`, `200`. Kill the dev server.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
git add server/routes.ts db/seed.ts package.json package-lock.json
git commit -m "feat: argon2id password hashing on register/login, hashed seed users, session regeneration on login"
```

---

### Task 5: Rate limiting on login and register

**Files:**

- Modify: `server/routes.ts` (imports + two route registrations)
- Modify: `package.json` / `package-lock.json` (via `npm install express-rate-limit`)

**Interfaces:**

- Produces: `POST /api/v1/auth/login` limited to 10 requests / 15 min / IP; `POST /api/v1/auth/register` limited to 5 requests / hour / IP. Exceeding returns **429** `{ message: ... }` with `RateLimit-*` standard headers.

- [ ] **Step 1: Install**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm install express-rate-limit
```

- [ ] **Step 2: Define limiters and apply them**

In `server/routes.ts`, add to the imports:

```ts
import rateLimit from "express-rate-limit";
```

Inside `registerRoutes`, immediately after `const apiPrefix = "/api/v1";`:

```ts
// In-memory rate limiting: per-process, resets on restart. Fine for a
// single-instance deployment; revisit if the app ever scales out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later" },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many accounts created, please try again later" },
});
```

Apply them as route middleware:

```ts
app.post(`${apiPrefix}/auth/login`, loginLimiter, async (req, res) => {
```

```ts
app.post(`${apiPrefix}/auth/register`, registerLimiter, async (req, res) => {
```

- [ ] **Step 3: Verify 429 behavior**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run dev &
sleep 5
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "attempt $i: %{http_code}\n" -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}'
done
```

Expected: attempts 1–10 → `401`, attempt 11 → `429`. Restart the dev server afterwards (in-memory store resets, so later tasks aren't rate-limited during their smoke tests). Register limiter: same pattern, 6 attempts with an invalid body → 5×`400` then `429` (restart the server again after).

- [ ] **Step 4: Typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
git add server/routes.ts package.json package-lock.json
git commit -m "feat: rate-limit login and register endpoints"
```

---

### Task 6: zod validation on all remaining unvalidated request bodies

**Files:**

- Modify: `shared/schema.ts` (add `loginSchema`, `registerUserSchema` next to `insertUserSchema`, ~line 70)
- Modify: `server/routes.ts` — five handlers: login (~33), register (~67), `PUT /organizations/:id` (~195), `PUT /badges/:id` (~431), `POST /badges/:badgeId/award` (~622), `POST /badges/:badgeId/progress/:userId` (~958)

**Interfaces:**

- Consumes: existing drizzle-zod schemas `organizationsInsertSchema`, `badgesInsertSchema`, `insertUserSchema` from `@shared/schema` (already imported in routes.ts — add the two new ones to that import).
- Produces: `loginSchema` (`{ username: string; password: string }`) and `registerUserSchema` (`insertUserSchema.pick({ username, password, name, email })`) exported from `@shared/schema`. Every body-consuming route parses its body with zod before use; invalid bodies → 400 `{ errors }`.

**Current gap inventory (why each change):** login uses a hand-rolled truthiness check; register uses full `insertUserSchema`, which lets a client self-assign `role: "admin"` or an `organizationId` (privilege escalation); the two PUTs spread raw `req.body` into DB updates (mass assignment); award trusts `req.body.userId` untyped; progress spreads four untyped body fields.

- [ ] **Step 1: Add schemas to `shared/schema.ts`**

Directly after the `export type User = ...` line (~73):

```ts
// Auth request bodies. Register deliberately picks only self-service
// fields: role and organizationId must never be client-assignable.
export const registerUserSchema = insertUserSchema.pick({
  username: true,
  password: true,
  name: true,
  email: true,
});
export type RegisterUser = z.infer<typeof registerUserSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 2: Login handler — replace the manual check**

In `server/routes.ts` login handler, replace

```ts
const { username, password } = req.body;
if (!username || !password) {
  return res
    .status(400)
    .json({ message: "Username and password are required" });
}
```

with

```ts
const { username, password } = loginSchema.parse(req.body);
```

and add a ZodError branch at the top of its `catch`:

```ts
if (error instanceof z.ZodError) {
  return res.status(400).json({ errors: error.errors });
}
```

Add `loginSchema` and `registerUserSchema` to the existing `@shared/schema` import.

- [ ] **Step 3: Register handler — restrict fields**

Replace `insertUserSchema.parse(req.body)` with `registerUserSchema.parse(req.body)`. Nothing else changes (`storage.createUser` already defaults `role || "user"` and `organizationId || null`; the client register page sends exactly these four fields). **Behavior change, intended:** register can no longer set `role`/`organizationId`.

- [ ] **Step 4: `PUT /organizations/:id` — validate the update body**

Replace

```ts
const updateData = {
  ...req.body,
  updatedBy: req.session.userId || null,
};
```

with

```ts
const updateData = {
  ...organizationsInsertSchema.partial().parse(req.body),
  updatedBy: req.session.userId || null,
};
```

and add the same ZodError → 400 `{ errors }` branch at the top of the handler's `catch` (this handler doesn't have one yet).

- [ ] **Step 5: `PUT /badges/:id` — validate the update body**

Same pattern with `badgesInsertSchema.partial()`:

```ts
const updateData = {
  ...badgesInsertSchema.partial().parse(req.body),
  updatedBy: req.session.userId || null,
};
```

plus the ZodError → 400 branch in its `catch`.

- [ ] **Step 6: `POST /badges/:badgeId/award` — validate `userId`**

Replace `const { userId } = req.body;` with:

```ts
const { userId } = z
  .object({ userId: z.coerce.number().int().positive() })
  .parse(req.body);
```

(Its `catch` already has a ZodError branch.)

- [ ] **Step 7: `POST /badges/:badgeId/progress/:userId` — validate the body**

Replace

```ts
const progressData = {
  badgeId,
  userId: targetUserId,
  updatedBy: req.session.userId,
  progress: req.body.progress,
  progressData: req.body.progressData,
  notes: req.body.notes,
  status: req.body.status || "in_progress",
};
```

with

```ts
const body = z
  .object({
    progress: z.coerce.number().min(0).max(100).optional(),
    progressData: z.unknown().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
  })
  .parse(req.body);

const progressData = {
  badgeId,
  userId: targetUserId,
  updatedBy: req.session.userId,
  progress: body.progress,
  progressData: body.progressData,
  notes: body.notes,
  status: body.status || "in_progress",
};
```

and add the ZodError → 400 branch to its `catch` (it doesn't have one). Do **not** change what `createOrUpdateBadgeProgress` receives beyond this — its internal `metrics` handling is Phase 3's problem.

- [ ] **Step 8: Verify with curl (auth'd where needed)**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run dev &
sleep 5
# login with missing password → 400 with errors array
curl -s -w '\n%{http_code}\n' -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin"}'
# register attempting privilege escalation → 201 but role is "user"
curl -s -X POST localhost:5000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"username":"escalator","password":"hunter22","name":"Priv Esc","email":"esc@test.dev","role":"admin"}'
# Expected JSON: "role":"user"
# admin session for the protected routes
curl -s -c /tmp/badgery-cookies.txt -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"password123"}'
# PUT organization with invalid body (name too short) → 400
curl -s -w '\n%{http_code}\n' -b /tmp/badgery-cookies.txt -X PUT localhost:5000/api/v1/organizations/1 -H 'Content-Type: application/json' -d '{"name":"ab"}'
# award with non-numeric userId → 400
curl -s -w '\n%{http_code}\n' -b /tmp/badgery-cookies.txt -X POST localhost:5000/api/v1/badges/1/award -H 'Content-Type: application/json' -d '{"userId":"abc"}'
# PUT organization with a valid body → 200 (positive case still works)
curl -s -w '\n%{http_code}\n' -b /tmp/badgery-cookies.txt -X PUT localhost:5000/api/v1/organizations/1 -H 'Content-Type: application/json' -d '{"description":"Updated by phase-1 smoke test"}'
```

Expected codes in order: `400`, `201` (with `"role":"user"`), `200`, `400`, `400`, `200`. Kill the dev server.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
git add shared/schema.ts server/routes.ts
git commit -m "feat: zod-validate all request bodies; lock register to self-service fields"
```

---

### Task 7: Documentation — README and `.env.example`

**Files:**

- Modify: `README.md` (Getting started section, lines 17-28)
- Modify: `.env.example` (both comments)

**Interfaces:**

- Consumes: everything above — this documents the post-Phase-1 reality.

- [ ] **Step 1: Rewrite the README "Getting started" section**

Replace lines 17-28 of `README.md` with:

```markdown
## Getting started

Prereqs: Node 20+, Docker (or any PostgreSQL 15+).

    docker run --name badgery-postgres -e POSTGRES_USER=badgery \
      -e POSTGRES_PASSWORD=badgery -e POSTGRES_DB=badgery \
      -p 5432:5432 -d postgres:17
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
```

- [ ] **Step 2: Update `.env.example`**

Replace the full file with:

```bash
# PostgreSQL connection string. Auto-loaded from .env (dotenv) by
# db/index.ts, server/config.ts, and drizzle.config.ts.
DATABASE_URL=postgres://badgery:badgery@localhost:5432/badgery

# Session-cookie signing secret, min 32 chars. REQUIRED in production
# (the server exits without it). Generate with: openssl rand -hex 32
SESSION_SECRET=change-me-generate-with-openssl-rand-hex-32
```

- [ ] **Step 3: Verify docs commands actually work**

Run the README's reset block verbatim (with the nvm prefix) — expect it to complete and `npm run dev` + admin login (`password123`) → 200 afterwards.

- [ ] **Step 4: Format check, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run format:check && npm run lint && npm run check
git add README.md .env.example
git commit -m "docs: Phase 1 getting-started — Docker Postgres, auto-loaded .env, SESSION_SECRET, DB reset"
```

---

## Completion

After Task 7: final whole-branch review (superpowers:requesting-code-review), then superpowers:finishing-a-development-branch → PR `phase-1-security` → `main` referencing the spec's Phase 1 section.

**Deliberate spec deviations to call out in the PR description:**

1. Neon serverless driver → `pg` (required to run against standard Postgres; Phase 2 prerequisite).
2. Session regeneration on login (session-fixation hardening, not in spec).
3. Register restricted to self-service fields (privilege-escalation fix surfaced by the body-validation work).
4. Seed admin role fixed `"administrator"` → `"admin"` (seed matched no middleware check).
