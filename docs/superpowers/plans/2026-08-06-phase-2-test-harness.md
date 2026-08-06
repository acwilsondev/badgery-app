# Phase 2 — Test Harness + CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Badgery an integration-first automated test suite (Vitest + supertest, against a real Postgres) covering every endpoint's happy path plus the multi-tenant authorization rules, and wire it into a required GitHub Actions PR gate (typecheck, lint, test, build).

**Architecture:** Tests are HTTP-level integration tests — supertest drives a real Express app instance (no mocking of Express, Drizzle, or Postgres) against a dedicated `badgery_test` database reset once per run. `server/index.ts` currently builds the whole app, wires sessions, calls `registerRoutes`, sets up Vite, and calls `.listen()` all in one top-level IIFE — nothing importable without side effects. This phase extracts a `createApp()` factory into a new `server/app.ts` (everything except Vite wiring and `.listen()`), so tests can `import { createApp } from "../server/app"` and get a clean Express app to hand to supertest. This is a pure code-motion refactor of Phase 1's `server/index.ts` (no route/logic changes) — Phase 3's planned `server/app.ts` absorbs this file as-is, so this phase does not duplicate Phase 3 work, it starts it.

**Tech Stack:** Vitest, supertest, `pg` (already a dependency) for direct test-database setup, Docker Compose for local Postgres, GitHub Actions with a `postgres:17` service container for CI.

## Global Constraints

- **Shell gotcha:** every `npm`/`npx`/`node`/`tsx` invocation MUST be prefixed with `unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH` (nvm lazy-loading breaks non-interactive shells; shell state does not persist between commands).
- Branch: `phase-2-test-harness` off up-to-date `main`. One commit per task.
- This phase writes tests for **existing, already-correct behavior** — it is not TDD-for-new-features. If a test reveals an actual bug, stop and flag it in the task's review rather than silently fixing production code (Phase 2 is tests + CI only; behavior changes are Phase 3's job unless the bug is a security hole, in which case flag it immediately for a judgment call).
- Test database: `postgres://badgery:badgery@localhost:5432/badgery_test` — a distinct database name from the dev `badgery` database, same Postgres server/credentials. **Never** point test tooling at plain `badgery` — the global setup does a destructive `DROP SCHEMA public CASCADE` and has a hard-coded guard that refuses to run unless `DATABASE_URL` contains the substring `badgery_test`.
- Fixtures: every test creates its own organizations/users/badges via helpers in `tests/support/fixtures.ts` with randomized unique names (via `crypto.randomUUID()`), never relying on `db/seed.ts`'s shared seed data. Tests do not truncate/clean up after themselves — uniqueness is what prevents collisions; the database is reset once per `npm test` run by global setup, not between tests.
- Every test file that talks to a session-bearing app creates its **own** `createApp()` instance in its own `beforeAll` (never share one `app` across files, and prefer one per top-level `describe` block within a file when a test intentionally exhausts shared per-app state like the rate limiter — see Task 2). `registerRoutes` builds fresh rate-limiter instances on every call, so a fresh app means a fresh limiter.
- Vitest runs test files sequentially (`fileParallelism: false` in `vitest.config.ts`) — all files share one Postgres instance and this repo's Postgres container is small; sequential execution avoids connection-pool exhaustion and keeps output easy to read. With ~7 files this costs seconds, not minutes.
- No placeholders: every test in this plan asserts real status codes and real response-body fields already produced by the existing route handlers (verified by reading `server/routes.ts` in full before writing this plan).
- Spec: `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` (Phase 2 section).

---

### Task 1: Test infrastructure — Docker Compose, `app.ts` extraction, Vitest, fixture builder, smoke test

**Files:**

- Create: `docker-compose.yml`
- Create: `server/logger.ts`
- Modify: `server/vite.ts` (remove local `log`, import + re-export from `./logger`)
- Create: `server/app.ts`
- Modify: `server/index.ts` (full rewrite, now bootstrap-only)
- Create: `vitest.config.ts`
- Create: `tests/globalSetup.ts`
- Create: `tests/support/fixtures.ts`
- Create: `tests/health.test.ts`
- Modify: `package.json` / `package-lock.json` (via `npm install -D vitest supertest @types/supertest`, add `test`/`test:watch` scripts)
- Modify: `README.md` (Docker Compose instead of manual `docker run`; new "Running tests" section)

**Interfaces:**

- Produces: `createApp(): Promise<{ app: Express; httpServer: Server }>` exported from `server/app.ts` — the interface every later task's tests import. `tests/support/fixtures.ts` exports `uniqueSuffix()`, `TEST_PASSWORD` (`"test-password-123"`), `createTestOrganization(overrides?)`, `createTestUser(options?)`, `createTestBadge(organizationId, overrides?)`, `createTestCategory(organizationId, overrides?)`, `loginAs(app, username, password)` (returns a `supertest.Agent` with the session cookie already set) — Tasks 2–7 consume these exact names.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b phase-2-test-harness
```

- [ ] **Step 2: Replace the manual dev Postgres container with Docker Compose**

Stop and remove the container Phase 1 started manually (Compose will manage its replacement):

```bash
docker stop badgery-postgres 2>/dev/null; docker rm badgery-postgres 2>/dev/null
```

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: badgery
      POSTGRES_PASSWORD: badgery
      POSTGRES_DB: badgery
    ports:
      - "5432:5432"
    volumes:
      - badgery-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U badgery"]
      interval: 2s
      timeout: 3s
      retries: 10

volumes:
  badgery-postgres-data:
```

Start it and confirm health:

```bash
docker compose up -d
docker compose ps
```

Expected: `postgres` service `Status` shows `(healthy)` (retry `docker compose ps` after a few seconds if still `starting`).

- [ ] **Step 3: Extract `log()` into `server/logger.ts`**

Create `server/logger.ts`:

```ts
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}
```

In `server/vite.ts`, delete the local `log` function (lines 11-20) and replace it with a re-export so nothing else importing `log` from `./vite` breaks:

```ts
export { log } from "./logger";
```

Add that re-export line near the top of `server/vite.ts`, right after the existing imports.

- [ ] **Step 4: Extract `server/app.ts` from `server/index.ts`**

Create `server/app.ts` — everything from the current `server/index.ts` except the Vite setup and `.listen()` call, wrapped in an exported async factory instead of a top-level IIFE:

```ts
import { config } from "./config";
import express, { type Request, Response, NextFunction } from "express";
import "./types"; // Import session type extensions
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { pool } from "@db";
import { log } from "./logger";

export async function createApp() {
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

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  const httpServer = await registerRoutes(app);

  // NOTE (pre-existing, not touched by Phase 2): this rethrows `err` after
  // already sending a response, which is dead code today only because every
  // route handler has its own try/catch — it only fires for errors Express
  // itself raises (e.g. malformed JSON bodies). Revisit in Phase 3; do not
  // write a test that intentionally hits this path, it can crash the process.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  return { app, httpServer };
}
```

- [ ] **Step 5: Rewrite `server/index.ts` as a bootstrap-only file**

Replace the entire file with:

```ts
import { createApp } from "./app";
import { setupVite, serveStatic } from "./vite";
import { log } from "./logger";

(async () => {
  const { app, httpServer } = await createApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
```

- [ ] **Step 6: Verify the extraction didn't change runtime behavior**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
```

Expected: both exit 0.

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run db:push && npm run db:seed
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run dev &
sleep 5
curl -si -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"password123"}' | grep -i set-cookie
```

Expected: `200`-equivalent `Set-Cookie: connect.sid=...; HttpOnly; SameSite=Lax` header, identical to Phase 1's behavior — proves `app.ts`/`index.ts` split didn't change session config. Kill the dev server (`kill %1`).

- [ ] **Step 7: Install test dependencies**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm install -D vitest supertest @types/supertest
```

- [ ] **Step 8: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@db": path.resolve(import.meta.dirname, "db"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/globalSetup.ts"],
    // All test files share one Postgres instance and unique-per-test
    // fixture data (not per-file isolation) — run files one at a time to
    // avoid connection-pool pressure and keep failures easy to read.
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 20000,
  },
});
```

- [ ] **Step 9: Create `tests/globalSetup.ts`**

Runs once before the whole suite: creates the `badgery_test` database if missing, wipes its schema, and pushes the current Drizzle schema onto it.

```ts
import pg from "pg";
import { execSync } from "node:child_process";

const TEST_DATABASE_URL = process.env.DATABASE_URL;

// Safety guard: this does a destructive DROP SCHEMA CASCADE below. Refuse to
// run against anything that doesn't look like the dedicated test database,
// so a misconfigured DATABASE_URL can never wipe dev or production data.
if (!TEST_DATABASE_URL || !TEST_DATABASE_URL.includes("badgery_test")) {
  throw new Error(
    `Refusing to run test globalSetup: DATABASE_URL does not look like a ` +
      `test database (got "${TEST_DATABASE_URL}"). Expected it to contain ` +
      `"badgery_test". Check the "test" script in package.json.`,
  );
}

export default async function setup() {
  const targetUrl = new URL(TEST_DATABASE_URL!);
  const dbName = targetUrl.pathname.slice(1);

  const maintenanceUrl = new URL(TEST_DATABASE_URL!);
  maintenanceUrl.pathname = "/postgres";

  const maintenanceClient = new pg.Client({
    connectionString: maintenanceUrl.toString(),
  });
  await maintenanceClient.connect();
  const existing = await maintenanceClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );
  if (existing.rowCount === 0) {
    await maintenanceClient.query(`CREATE DATABASE "${dbName}"`);
  }
  await maintenanceClient.end();

  const testDbClient = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await testDbClient.connect();
  await testDbClient.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await testDbClient.end();

  execSync("npm run db:push", { stdio: "inherit" });
}
```

- [ ] **Step 10: Create `tests/support/fixtures.ts`**

```ts
import crypto from "node:crypto";
import argon2 from "argon2";
import request from "supertest";
import type { Express } from "express";
import * as storage from "../../server/storage";

export function uniqueSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

export const TEST_PASSWORD = "test-password-123";

export async function createTestOrganization(
  overrides: { name?: string; description?: string } = {},
) {
  return storage.createOrganization({
    name: overrides.name ?? `Test Org ${uniqueSuffix()}`,
    description:
      overrides.description ?? "Fixture organization for integration tests",
  });
}

export async function createTestUser(
  options: {
    organizationIds?: number[];
    role?: "user" | "manager" | "admin";
    username?: string;
    name?: string;
    email?: string;
  } = {},
) {
  const suffix = uniqueSuffix();
  const passwordHash = await argon2.hash(TEST_PASSWORD);
  const user = await storage.createUser(
    {
      username: options.username ?? `user_${suffix}`,
      password: passwordHash,
      name: options.name ?? "Test User",
      email: options.email ?? `user_${suffix}@test.dev`,
      role: options.role ?? "user",
    },
    options.organizationIds ?? [],
  );
  return { ...user, password: TEST_PASSWORD };
}

export async function createTestCategory(
  organizationId: number,
  overrides: { name?: string } = {},
) {
  return storage.createBadgeCategory({
    name: overrides.name ?? `Category ${uniqueSuffix()}`,
    organizationId,
  });
}

export async function createTestBadge(
  organizationId: number,
  overrides: {
    name?: string;
    description?: string;
    categoryId?: number;
    requiresProgress?: boolean;
  } = {},
) {
  return storage.createBadge({
    name: overrides.name ?? `Badge ${uniqueSuffix()}`,
    description: overrides.description ?? "Fixture badge for integration tests",
    organizationId,
    categoryId: overrides.categoryId,
    requiresProgress: overrides.requiresProgress ?? false,
  });
}

export async function loginAs(
  app: Express,
  username: string,
  password: string,
) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/v1/auth/login")
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error(
      `loginAs(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return agent;
}
```

- [ ] **Step 11: Add npm scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "DATABASE_URL=postgres://badgery:badgery@localhost:5432/badgery_test SESSION_SECRET=test-secret-at-least-32-characters-long NODE_ENV=test vitest run",
"test:watch": "DATABASE_URL=postgres://badgery:badgery@localhost:5432/badgery_test SESSION_SECRET=test-secret-at-least-32-characters-long NODE_ENV=test vitest"
```

- [ ] **Step 12: Write the smoke test**

Create `tests/health.test.ts` — proves the whole harness (app factory, test DB, fixtures, session cookies) works end-to-end before any later task builds on it:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";
import { createTestOrganization, createTestUser } from "./support/fixtures";

describe("test harness smoke test", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("registers, logs in, and reads the current user through a real session", async () => {
    const org = await createTestOrganization();
    const user = await createTestUser({ organizationIds: [org.id] });

    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: user.password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.username).toBe(user.username);

    const meRes = await agent.get("/api/v1/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(user.id);
  });

  it("rejects requests with no session", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 13: Run it**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: global setup logs the `db:push` output, then `2 passed` (or equivalent Vitest summary) for `tests/health.test.ts`, exit 0.

- [ ] **Step 14: Update README**

Replace the `docker run` line in the "Getting started" section (added in Phase 1) with:

```markdown
    docker compose up -d      # starts local Postgres (see docker-compose.yml)
```

Add a new section after "Resetting the database":

```markdown
## Running tests

Integration tests run against a dedicated `badgery_test` database on the
same Postgres instance as dev — they never touch your `badgery` dev data.

    npm test          # resets + migrates badgery_test, then runs the suite once
    npm run test:watch # same, but re-runs on file changes

The database reset (`DROP SCHEMA public CASCADE` + `db:push`) happens once
per run automatically; individual tests create their own organizations/users
with randomized names rather than sharing seed data.
```

- [ ] **Step 15: Typecheck, lint, format, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint && npm run format:check
git add docker-compose.yml server/logger.ts server/vite.ts server/app.ts server/index.ts \
  vitest.config.ts tests/globalSetup.ts tests/support/fixtures.ts tests/health.test.ts \
  package.json package-lock.json README.md
git commit -m "test: add Vitest+supertest harness — app.ts extraction, Docker Compose, fixture builder"
```

(If `format:check` fails on the new files, run `npm run format` first — it only rewrites whitespace/quote style, safe to trust — then re-stage and re-run `format:check`.)

---

### Task 2: Auth integration tests

**Files:**

- Create: `tests/auth.test.ts`

**Interfaces:**

- Consumes: `createApp` (`server/app.ts`), `createTestUser`/`uniqueSuffix` (`tests/support/fixtures.ts`).

**Endpoints covered:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`, plus the login/register rate limiters.

- [ ] **Step 1: Write `tests/auth.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";
import { createTestUser, uniqueSuffix } from "./support/fixtures";

describe("POST /api/v1/auth/register", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("creates a user with only self-service fields", async () => {
    const suffix = uniqueSuffix();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        username: `newuser_${suffix}`,
        password: "hunter22",
        name: "New User",
        email: `newuser_${suffix}@test.dev`,
      });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe(`newuser_${suffix}`);
    expect(res.body.role).toBe("user");
    expect(res.body).not.toHaveProperty("password");
  });

  it("ignores a client-supplied role/organizationId (privilege escalation)", async () => {
    const suffix = uniqueSuffix();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        username: `escalator_${suffix}`,
        password: "hunter22",
        name: "Escalator",
        email: `escalator_${suffix}@test.dev`,
        role: "admin",
        organizationId: 999999,
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("user");
    expect(res.body.organizationId).toBeNull();
  });

  it("rejects a duplicate username with 400", async () => {
    const suffix = uniqueSuffix();
    const body = {
      username: `dup_${suffix}`,
      password: "hunter22",
      name: "Dup",
      email: `dup_${suffix}@test.dev`,
    };
    const first = await request(app).post("/api/v1/auth/register").send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...body, email: `dup2_${suffix}@test.dev` });
    expect(second.status).toBe(400);
  });

  it("rejects a body missing required fields with 400 and a zod errors array", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "ab" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

describe("POST /api/v1/auth/login", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("logs in with correct credentials and sets a session cookie", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(user.username);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/connect\.sid=/);
  });

  it("rejects a wrong password with 401", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects a nonexistent username with 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: `nobody_${uniqueSuffix()}`, password: "whatever123" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing password with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "someone" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

describe("GET /api/v1/auth/me and POST /api/v1/auth/logout", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a session, and 401 after logout", async () => {
    const user = await createTestUser();
    const agent = request.agent(app);
    await agent
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: user.password });

    const meRes = await agent.get("/api/v1/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(user.id);

    const logoutRes = await agent.post("/api/v1/auth/logout");
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await agent.get("/api/v1/auth/me");
    expect(meAfterLogout.status).toBe(401);
  });
});

// Isolated in its own app/describe block: it deliberately exhausts the
// in-memory rate limiter, which would otherwise break every other login
// test sharing the same app instance.
describe("login rate limiting", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("returns 429 after 10 login attempts in the window", async () => {
    const user = await createTestUser();
    const results: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ username: user.username, password: "wrong-password" });
      results.push(res.status);
    }
    expect(results.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(results[10]).toBe(429);
  });
});

// Also isolated: exhausts the register limiter (5/hour).
describe("register rate limiting", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("returns 429 after 5 register attempts in the window", async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const suffix = uniqueSuffix();
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          username: `ratelimit_${suffix}`,
          password: "hunter22",
          name: "Rate Limit",
          email: `ratelimit_${suffix}@test.dev`,
        });
      results.push(res.status);
    }
    expect(results.slice(0, 5)).toEqual(Array(5).fill(201));
    expect(results[5]).toBe(429);
  });
});
```

- [ ] **Step 2: Run it**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: all `tests/auth.test.ts` cases pass alongside `tests/health.test.ts`, exit 0.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
git add tests/auth.test.ts
git commit -m "test: cover auth endpoints — register, login, me, logout, rate limits"
```

---

### Task 3: Organizations integration tests

**Files:**

- Create: `tests/organizations.test.ts`

**Interfaces:**

- Consumes: `createApp`, `createTestOrganization`, `createTestUser`, `loginAs`, `uniqueSuffix` (`tests/support/fixtures.ts`).

**Endpoints covered:** `GET /api/v1/organizations`, `GET /api/v1/organizations/:id`, `POST /api/v1/organizations`, `PUT /api/v1/organizations/:id`.

- [ ] **Step 1: Write `tests/organizations.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { Express } from "express";
import { createApp } from "../server/app";
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  uniqueSuffix,
} from "./support/fixtures";

describe("organizations", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("GET /organizations returns only the caller's orgs for a regular user", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const user = await createTestUser({ organizationIds: [orgA.id] });
    const agent = await loginAs(app, user.username, user.password);

    const res = await agent.get("/api/v1/organizations");
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: number }) => o.id);
    expect(ids).toContain(orgA.id);
    expect(ids).not.toContain(orgB.id);
  });

  it("GET /organizations returns every org for an admin", async () => {
    const orgA = await createTestOrganization();
    const admin = await createTestUser({ role: "admin" });
    const agent = await loginAs(app, admin.username, admin.password);

    const res = await agent.get("/api/v1/organizations");
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: number }) => o.id);
    expect(ids).toContain(orgA.id);
  });

  it("GET /organizations/:id 403s for a user outside the org", async () => {
    const org = await createTestOrganization();
    const outsider = await createTestUser();
    const agent = await loginAs(app, outsider.username, outsider.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}`);
    expect(res.status).toBe(403);
  });

  it("GET /organizations/:id 200s for a member", async () => {
    const org = await createTestOrganization();
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, member.username, member.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(org.id);
  });

  it("POST /organizations 403s for a plain user", async () => {
    const user = await createTestUser();
    const agent = await loginAs(app, user.username, user.password);

    const res = await agent
      .post("/api/v1/organizations")
      .send({ name: `New Org ${uniqueSuffix()}`, description: "A fresh org" });
    expect(res.status).toBe(403);
  });

  it("POST /organizations 201s for a manager (global role, not org-scoped)", async () => {
    // Current design: role is a single global column, not per-organization —
    // any manager/admin can create a brand new org, not just admins. This
    // test locks in that existing behavior rather than changing it.
    const manager = await createTestUser({ role: "manager" });
    const agent = await loginAs(app, manager.username, manager.password);

    const res = await agent.post("/api/v1/organizations").send({
      name: `Manager Org ${uniqueSuffix()}`,
      description: "A fresh org",
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toMatch(/^Manager Org/);
  });

  it("POST /organizations 400s on a too-short name", async () => {
    const manager = await createTestUser({ role: "manager" });
    const agent = await loginAs(app, manager.username, manager.password);

    const res = await agent
      .post("/api/v1/organizations")
      .send({ name: "ab", description: "Too short a name" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("PUT /organizations/:id 403s for a manager outside the org", async () => {
    const org = await createTestOrganization();
    const outsiderManager = await createTestUser({ role: "manager" });
    const agent = await loginAs(
      app,
      outsiderManager.username,
      outsiderManager.password,
    );

    const res = await agent
      .put(`/api/v1/organizations/${org.id}`)
      .send({ description: "Updated by an outsider" });
    expect(res.status).toBe(403);
  });

  it("PUT /organizations/:id 403s for a plain member (not admin/manager)", async () => {
    const org = await createTestOrganization();
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, member.username, member.password);

    const res = await agent
      .put(`/api/v1/organizations/${org.id}`)
      .send({ description: "Updated by a plain member" });
    expect(res.status).toBe(403);
  });

  it("PUT /organizations/:id updates for a manager member, ignoring createdBy", async () => {
    const org = await createTestOrganization();
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const agent = await loginAs(app, manager.username, manager.password);

    const res = await agent
      .put(`/api/v1/organizations/${org.id}`)
      .send({ description: "Updated description", createdBy: 999999 });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Updated description");
    expect(res.body.createdBy).not.toBe(999999);
  });
});
```

- [ ] **Step 2: Run, typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test && npm run check && npm run lint
git add tests/organizations.test.ts
git commit -m "test: cover organizations endpoints — CRUD, org isolation, mass-assignment"
```

---

### Task 4: Badge categories + badges integration tests

**Files:**

- Create: `tests/badges.test.ts`

**Interfaces:**

- Consumes: `createApp`, `createTestOrganization`, `createTestUser`, `createTestCategory`, `createTestBadge`, `loginAs` (`tests/support/fixtures.ts`).

**Endpoints covered:** `GET /api/v1/organizations/:orgId/categories`, `POST /api/v1/organizations/:orgId/categories`, `GET /api/v1/organizations/:orgId/badges`, `GET /api/v1/badges/:id`, `POST /api/v1/organizations/:orgId/badges`, `PUT /api/v1/badges/:id`, `DELETE /api/v1/badges/:id`.

- [ ] **Step 1: Write `tests/badges.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { Express } from "express";
import { createApp } from "../server/app";
import {
  createTestOrganization,
  createTestUser,
  createTestCategory,
  createTestBadge,
  loginAs,
} from "./support/fixtures";

describe("badge categories", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("GET categories 403s for a user outside the org", async () => {
    const org = await createTestOrganization();
    await createTestCategory(org.id);
    const outsider = await createTestUser();
    const agent = await loginAs(app, outsider.username, outsider.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}/categories`);
    expect(res.status).toBe(403);
  });

  it("POST categories 403s for a plain member", async () => {
    const org = await createTestOrganization();
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, member.username, member.password);

    const res = await agent
      .post(`/api/v1/organizations/${org.id}/categories`)
      .send({ name: "Technical" });
    expect(res.status).toBe(403);
  });

  it("POST then GET categories works for a manager member", async () => {
    const org = await createTestOrganization();
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const agent = await loginAs(app, manager.username, manager.password);

    const createRes = await agent
      .post(`/api/v1/organizations/${org.id}/categories`)
      .send({ name: "Technical" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.organizationId).toBe(org.id);

    const listRes = await agent.get(
      `/api/v1/organizations/${org.id}/categories`,
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.map((c: { id: number }) => c.id)).toContain(
      createRes.body.id,
    );
  });
});

describe("badges", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("GET org badges 403s for a user outside the org", async () => {
    const org = await createTestOrganization();
    await createTestBadge(org.id);
    const outsider = await createTestUser();
    const agent = await loginAs(app, outsider.username, outsider.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}/badges`);
    expect(res.status).toBe(403);
  });

  it("GET /badges/:id 403s for a user outside the badge's org", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const outsider = await createTestUser();
    const agent = await loginAs(app, outsider.username, outsider.password);

    const res = await agent.get(`/api/v1/badges/${badge.id}`);
    expect(res.status).toBe(403);
  });

  it("POST org badges 403s for a plain member", async () => {
    const org = await createTestOrganization();
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, member.username, member.password);

    const res = await agent
      .post(`/api/v1/organizations/${org.id}/badges`)
      .send({ name: "New Badge", description: "A brand new badge" });
    expect(res.status).toBe(403);
  });

  it("manager can create, fetch, update, and delete a badge in their org", async () => {
    const org = await createTestOrganization();
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const agent = await loginAs(app, manager.username, manager.password);

    const createRes = await agent
      .post(`/api/v1/organizations/${org.id}/badges`)
      .send({ name: "New Badge", description: "A brand new badge" });
    expect(createRes.status).toBe(201);
    const badgeId = createRes.body.id;

    const getRes = await agent.get(`/api/v1/badges/${badgeId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe("New Badge");

    const updateRes = await agent
      .put(`/api/v1/badges/${badgeId}`)
      .send({ description: "An updated description" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.description).toBe("An updated description");

    const deleteRes = await agent.delete(`/api/v1/badges/${badgeId}`);
    expect(deleteRes.status).toBe(200);

    const getAfterDelete = await agent.get(`/api/v1/badges/${badgeId}`);
    expect(getAfterDelete.status).toBe(404);
  });

  it("PUT /badges/:id cannot reassign organizationId (tenant-boundary mass assignment)", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const badge = await createTestBadge(orgA.id);
    const managerA = await createTestUser({
      role: "manager",
      organizationIds: [orgA.id],
    });
    const agent = await loginAs(app, managerA.username, managerA.password);

    const res = await agent
      .put(`/api/v1/badges/${badge.id}`)
      .send({ organizationId: orgB.id, description: "Attempted org move" });

    expect(res.status).toBe(200);
    expect(res.body.organizationId).toBe(orgA.id);
  });

  it("PUT /badges/:id 403s for a manager outside the badge's org", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const outsiderManager = await createTestUser({ role: "manager" });
    const agent = await loginAs(
      app,
      outsiderManager.username,
      outsiderManager.password,
    );

    const res = await agent
      .put(`/api/v1/badges/${badge.id}`)
      .send({ description: "Attempted cross-org edit" });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run, typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test && npm run check && npm run lint
git add tests/badges.test.ts
git commit -m "test: cover badge categories and badges — CRUD, org isolation, mass-assignment"
```

---

### Task 5: Users integration tests

**Files:**

- Create: `tests/users.test.ts`

**Interfaces:**

- Consumes: `createApp`, `createTestOrganization`, `createTestUser`, `loginAs` (`tests/support/fixtures.ts`).

**Endpoints covered:** `GET /api/v1/organizations/:orgId/users`, `GET /api/v1/users/:id`.

- [ ] **Step 1: Write `tests/users.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { Express } from "express";
import { createApp } from "../server/app";
import {
  createTestOrganization,
  createTestUser,
  loginAs,
} from "./support/fixtures";

describe("users", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("GET org users 403s for a user outside the org", async () => {
    const org = await createTestOrganization();
    await createTestUser({ organizationIds: [org.id] });
    const outsider = await createTestUser();
    const agent = await loginAs(app, outsider.username, outsider.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}/users`);
    expect(res.status).toBe(403);
  });

  it("GET org users 200s and lists members for a member", async () => {
    const org = await createTestOrganization();
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, member.username, member.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}/users`);
    expect(res.status).toBe(200);
    expect(res.body.map((u: { id: number }) => u.id)).toContain(member.id);
  });

  it("GET /users/:id 200s for the caller's own profile", async () => {
    const user = await createTestUser();
    const agent = await loginAs(app, user.username, user.password);

    const res = await agent.get(`/api/v1/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body).not.toHaveProperty("password");
  });

  it("GET /users/:id 403s across users with no shared organization", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const userA = await createTestUser({ organizationIds: [orgA.id] });
    const userB = await createTestUser({ organizationIds: [orgB.id] });
    const agent = await loginAs(app, userA.username, userA.password);

    const res = await agent.get(`/api/v1/users/${userB.id}`);
    expect(res.status).toBe(403);
  });

  it("GET /users/:id 200s across users who share an organization", async () => {
    const org = await createTestOrganization();
    const userA = await createTestUser({ organizationIds: [org.id] });
    const userB = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, userA.username, userA.password);

    const res = await agent.get(`/api/v1/users/${userB.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userB.id);
  });

  it("GET /users/:id 200s for an admin viewing any user", async () => {
    const other = await createTestUser();
    const admin = await createTestUser({ role: "admin" });
    const agent = await loginAs(app, admin.username, admin.password);

    const res = await agent.get(`/api/v1/users/${other.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(other.id);
  });
});
```

- [ ] **Step 2: Run, typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test && npm run check && npm run lint
git add tests/users.test.ts
git commit -m "test: cover user endpoints — org membership and cross-user visibility rules"
```

---

### Task 6: Badge awarding + progress integration tests

**Files:**

- Create: `tests/progress.test.ts`

**Interfaces:**

- Consumes: `createApp`, `createTestOrganization`, `createTestUser`, `createTestBadge`, `loginAs` (`tests/support/fixtures.ts`).

**Endpoints covered:** `POST /api/v1/badges/:badgeId/award`, `GET /api/v1/organizations/:orgId/awarded-badges`, `GET /api/v1/users/:userId/awarded-badges`, `GET /api/v1/badges/:badgeId/progress/:userId`, `GET /api/v1/users/:userId/progress`, `GET /api/v1/organizations/:orgId/progress`, `POST /api/v1/badges/:badgeId/progress/:userId`.

- [ ] **Step 1: Write `tests/progress.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { Express } from "express";
import { createApp } from "../server/app";
import {
  createTestOrganization,
  createTestUser,
  createTestBadge,
  loginAs,
} from "./support/fixtures";

describe("badge awarding", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("manager can award a badge to a member of the same org", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const recipient = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, manager.username, manager.password);

    const res = await agent
      .post(`/api/v1/badges/${badge.id}/award`)
      .send({ userId: recipient.id });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(recipient.id);
    expect(res.body.badgeId).toBe(badge.id);
  });

  it("403s when the awarding manager is outside the badge's org", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const recipient = await createTestUser({ organizationIds: [org.id] });
    const outsiderManager = await createTestUser({ role: "manager" });
    const agent = await loginAs(
      app,
      outsiderManager.username,
      outsiderManager.password,
    );

    const res = await agent
      .post(`/api/v1/badges/${badge.id}/award`)
      .send({ userId: recipient.id });
    expect(res.status).toBe(403);
  });

  it("403s when the target user is outside the badge's org", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const outsiderRecipient = await createTestUser();
    const agent = await loginAs(app, manager.username, manager.password);

    const res = await agent
      .post(`/api/v1/badges/${badge.id}/award`)
      .send({ userId: outsiderRecipient.id });
    expect(res.status).toBe(403);
  });

  it("400s on a non-numeric userId", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const agent = await loginAs(app, manager.username, manager.password);

    const res = await agent
      .post(`/api/v1/badges/${badge.id}/award`)
      .send({ userId: "not-a-number" });
    expect(res.status).toBe(400);
  });

  it("GET org awarded-badges 403s for an outsider and 200s for a member", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const recipient = await createTestUser({ organizationIds: [org.id] });
    const managerAgent = await loginAs(app, manager.username, manager.password);
    await managerAgent
      .post(`/api/v1/badges/${badge.id}/award`)
      .send({ userId: recipient.id });

    const outsider = await createTestUser();
    const outsiderAgent = await loginAs(
      app,
      outsider.username,
      outsider.password,
    );
    const forbidden = await outsiderAgent.get(
      `/api/v1/organizations/${org.id}/awarded-badges`,
    );
    expect(forbidden.status).toBe(403);

    const allowed = await managerAgent.get(
      `/api/v1/organizations/${org.id}/awarded-badges`,
    );
    expect(allowed.status).toBe(200);
    expect(
      allowed.body.some((a: { badgeId: number }) => a.badgeId === badge.id),
    ).toBe(true);
  });

  it("GET a user's own awarded-badges works, and 403s for a user with no shared org", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const recipient = await createTestUser({ organizationIds: [org.id] });
    const managerAgent = await loginAs(app, manager.username, manager.password);
    await managerAgent
      .post(`/api/v1/badges/${badge.id}/award`)
      .send({ userId: recipient.id });

    const recipientAgent = await loginAs(
      app,
      recipient.username,
      recipient.password,
    );
    const ownRes = await recipientAgent.get(
      `/api/v1/users/${recipient.id}/awarded-badges`,
    );
    expect(ownRes.status).toBe(200);
    expect(
      ownRes.body.some((a: { badgeId: number }) => a.badgeId === badge.id),
    ).toBe(true);

    const stranger = await createTestUser();
    const strangerAgent = await loginAs(
      app,
      stranger.username,
      stranger.password,
    );
    const strangerRes = await strangerAgent.get(
      `/api/v1/users/${recipient.id}/awarded-badges`,
    );
    expect(strangerRes.status).toBe(403);
  });
});

describe("badge progress", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("manager can create and update progress for a member; auto-awards at 100%", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id, { requiresProgress: true });
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, manager.username, manager.password);

    const partial = await agent
      .post(`/api/v1/badges/${badge.id}/progress/${member.id}`)
      .send({ progress: 50 });
    expect(partial.status).toBe(200);
    expect(Number(partial.body.progress)).toBe(50);

    const complete = await agent
      .post(`/api/v1/badges/${badge.id}/progress/${member.id}`)
      .send({ progress: 100 });
    expect(complete.status).toBe(200);
    expect(Number(complete.body.progress)).toBe(100);

    const awarded = await agent.get(
      `/api/v1/organizations/${org.id}/awarded-badges`,
    );
    expect(awarded.status).toBe(200);
    expect(
      awarded.body.some(
        (a: { badgeId: number; userId: number }) =>
          a.badgeId === badge.id && a.userId === member.id,
      ),
    ).toBe(true);
  });

  it("403s creating progress when the requester is outside the badge's org", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id, { requiresProgress: true });
    const member = await createTestUser({ organizationIds: [org.id] });
    const outsiderManager = await createTestUser({ role: "manager" });
    const agent = await loginAs(
      app,
      outsiderManager.username,
      outsiderManager.password,
    );

    const res = await agent
      .post(`/api/v1/badges/${badge.id}/progress/${member.id}`)
      .send({ progress: 10 });
    expect(res.status).toBe(403);
  });

  it("400s on an out-of-range progress value", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id, { requiresProgress: true });
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, manager.username, manager.password);

    const res = await agent
      .post(`/api/v1/badges/${badge.id}/progress/${member.id}`)
      .send({ progress: 150 });
    expect(res.status).toBe(400);
  });

  it("a user reads their own progress; 403s reading a stranger's progress", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id, { requiresProgress: true });
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const member = await createTestUser({ organizationIds: [org.id] });
    const managerAgent = await loginAs(app, manager.username, manager.password);
    await managerAgent
      .post(`/api/v1/badges/${badge.id}/progress/${member.id}`)
      .send({ progress: 25 });

    const memberAgent = await loginAs(app, member.username, member.password);
    const ownRes = await memberAgent.get(
      `/api/v1/badges/${badge.id}/progress/${member.id}`,
    );
    expect(ownRes.status).toBe(200);

    const stranger = await createTestUser();
    const strangerAgent = await loginAs(
      app,
      stranger.username,
      stranger.password,
    );
    const strangerRes = await strangerAgent.get(
      `/api/v1/badges/${badge.id}/progress/${member.id}`,
    );
    expect(strangerRes.status).toBe(403);
  });

  it("GET a user's all-badges progress and an org's progress both respect org membership", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id, { requiresProgress: true });
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const member = await createTestUser({ organizationIds: [org.id] });
    const managerAgent = await loginAs(app, manager.username, manager.password);
    await managerAgent
      .post(`/api/v1/badges/${badge.id}/progress/${member.id}`)
      .send({ progress: 40 });

    const ownProgress = await managerAgent.get(
      `/api/v1/users/${member.id}/progress`,
    );
    expect(ownProgress.status).toBe(200);

    const outsider = await createTestUser();
    const outsiderAgent = await loginAs(
      app,
      outsider.username,
      outsider.password,
    );
    const forbiddenUserProgress = await outsiderAgent.get(
      `/api/v1/users/${member.id}/progress`,
    );
    expect(forbiddenUserProgress.status).toBe(403);

    const orgProgress = await managerAgent.get(
      `/api/v1/organizations/${org.id}/progress`,
    );
    expect(orgProgress.status).toBe(200);

    const forbiddenOrgProgress = await outsiderAgent.get(
      `/api/v1/organizations/${org.id}/progress`,
    );
    expect(forbiddenOrgProgress.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run, typecheck, lint, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test && npm run check && npm run lint
git add tests/progress.test.ts
git commit -m "test: cover badge awarding and progress — org isolation, auto-award, validation"
```

---

### Task 7: Stats test, GitHub Actions CI gate

**Files:**

- Create: `tests/stats.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `createApp`, `createTestOrganization`, `createTestUser`, `createTestBadge`, `loginAs` (`tests/support/fixtures.ts`).
- Produces: a `ci` GitHub Actions job running on every PR into `main` and every push to `main`: `npm run check`, `npm run lint`, `npm test`, `npm run build`, in that order, against a `postgres:17` service container.

**Endpoint covered:** `GET /api/v1/organizations/:orgId/stats`.

- [ ] **Step 1: Write `tests/stats.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { Express } from "express";
import { createApp } from "../server/app";
import {
  createTestOrganization,
  createTestUser,
  createTestBadge,
  loginAs,
} from "./support/fixtures";

describe("organization stats", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("403s for a user outside the org", async () => {
    const org = await createTestOrganization();
    const outsider = await createTestUser();
    const agent = await loginAs(app, outsider.username, outsider.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}/stats`);
    expect(res.status).toBe(403);
  });

  it("counts badges and awards for a member", async () => {
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id);
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const recipient = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, manager.username, manager.password);

    await agent
      .post(`/api/v1/badges/${badge.id}/award`)
      .send({ userId: recipient.id });

    const res = await agent.get(`/api/v1/organizations/${org.id}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.totalBadges).toBeGreaterThanOrEqual(1);
    expect(res.body.totalUsers).toBeGreaterThanOrEqual(2);
    expect(res.body.totalAwarded).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: full suite (all 7 test files) passes, exit 0. This is the last new test file — confirm every endpoint listed in this plan's task headers has at least one passing assertion by skimming `npm test`'s output for 7 suite names.

- [ ] **Step 3: Add the GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: badgery
          POSTGRES_PASSWORD: badgery
          POSTGRES_DB: badgery
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U badgery"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run check

      - run: npm run lint

      - run: npm test

      - run: npm run build
```

- [ ] **Step 4: Typecheck, lint, format, commit**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint && npm run format:check
git add tests/stats.test.ts .github/workflows/ci.yml
git commit -m "test: cover org stats; add GitHub Actions CI gate (check, lint, test, build)"
```

- [ ] **Step 5: Push and confirm the workflow runs green on GitHub**

```bash
git push -u origin phase-2-test-harness
gh run watch $(gh run list --branch phase-2-test-harness --limit 1 --json databaseId --jq '.[0].databaseId') 2>&1 | tail -40
```

Expected: the `ci` job completes successfully against GitHub's own Postgres service container (proves the CI Postgres wiring works independent of local Docker Compose).

- [ ] **Step 6 (manual — do not run unattended): make the CI check required on `main`**

This changes repository-wide branch protection, not code — run it yourself (or ask Aaron to) rather than having an agent execute it as part of task automation:

```bash
gh api repos/acwilsondev/badgery-app/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field 'required_status_checks[contexts][]=ci' \
  --field enforce_admins=true \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

If branch protection is already configured with other settings, inspect the current config first (`gh api repos/acwilsondev/badgery-app/branches/main/protection`) and merge the `ci` context into it rather than overwriting.

---

## Completion

After Task 7: final whole-branch review (superpowers:requesting-code-review), then superpowers:finishing-a-development-branch → PR `phase-2-test-harness` → `main` referencing the spec's Phase 2 section.

**Deliberate spec deviations to call out in the PR description:**

1. `server/app.ts` extraction is Phase 3 restructure work pulled forward — required so tests can import a side-effect-free Express app; the file is a verbatim code-motion of Phase 1's `server/index.ts`, no logic changed.
2. Docker Compose replaces Phase 1's manual `docker run` for local Postgres (spec explicitly calls for compose in Phase 2).
3. Tests use a separate `badgery_test` database rather than the dev `badgery` database, reset once per `npm test` run — not explicitly specified, but necessary so running tests locally never touches dev data.
4. Branch protection (`ci` required check) is documented but not applied automatically by the plan — it's a GitHub repo setting change, left for manual/explicit execution.
