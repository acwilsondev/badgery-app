# Phase 3a — Server Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `server/routes.ts` (1154 lines) and `server/storage.ts` (1082 lines) with five feature modules (`auth`, `users`, `organizations`, `badges`, `progress`), each a `routes.ts` (HTTP + zod validation) + `service.ts` (business logic + Drizzle queries) pair, backed by a single typed-error → error-middleware pattern that replaces per-route try/catch. Then sweep the dead code this repo has been carrying since Phase 0. Done under the Phase 2 safety net: the 52 existing integration tests must pass, response-shape-and-status-code identical, after every single task.

**Architecture:** Feature-by-feature incremental migration, not a big-bang rewrite. Each task moves exactly one feature's routes out of `server/routes.ts`/`server/storage.ts` into `server/features/<name>/{routes,service}.ts`, wires it into `server/app.ts` alongside the still-shrinking legacy `registerRoutes`, and re-runs the full suite. `server/routes.ts` and `server/storage.ts` are only fully deleted in the last task, once empty. Order is dictated by a real dependency: `users` (identity lookups) is used by every other feature and by the shared auth middleware, so it migrates first, before `auth` itself (which needs `users`' `createUser`/`getUserByUsername`).

**Tech Stack:** Same as Phase 1/2 — Express 4, Drizzle ORM (node-postgres), zod, drizzle-zod, argon2, express-rate-limit, express-session. No new runtime dependencies. Express 4 does **not** auto-catch promise rejections thrown inside `async (req, res) => {}` handlers — this plan introduces a small `asyncHandler` wrapper (Task 1) specifically so "per-route try/catch blocks are removed" doesn't silently produce hung requests.

## Global Constraints

- **Shell gotcha:** every `npm`/`npx`/`node`/`tsx` invocation MUST be prefixed with `unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH` (nvm lazy-loading breaks non-interactive shells; shell state does not persist between commands).
- **GPG gotcha:** git commits in this repo require GPG signing; the pinentry dialog periodically times out in non-interactive/subagent shells. If a commit fails with a GPG pinentry timeout, do not use `--no-gpg-sign` — report it and let the controller (a session with terminal access) run the commit.
- Branch: `phase-3a-server-restructure` off up-to-date `main`. One commit per task.
- **The full test suite (`npm test`, all 52 tests across 7 files) must pass after every single task, unchanged in what it asserts.** This plan is a restructure, not a redesign — status codes, response bodies, and business logic are preserved exactly except where a step below explicitly says otherwise (there are exactly two explicit, pre-authorized exceptions: the `autoAwardBadgeIfComplete` status-literal fix in Task 6, and the `progress.tsx` color-fallback bug fix in Task 7 — both already decided and documented, not new judgment calls for the implementer).
- **Error-handling design** (binding on every feature task): four typed error classes in `server/middleware/errors.ts` — `NotFoundError` (404), `ForbiddenError` (403), `UnauthorizedError` (401), `ValidationError` (400). The spec named only the first three; `UnauthorizedError` is added because the codebase has real, distinct 401 cases (not authenticated / the session's user record no longer exists) that are semantically different from 403 (authenticated but not permitted) — collapsing them into `ForbiddenError` would be a status-code change, which is out of scope. Call this out as a deliberate, documented spec extension in the final PR description, not a silent deviation.
  - Every route handler is wrapped in `asyncHandler` (Task 1) so a thrown error — typed or not — reaches the single `errorHandler` middleware via `next(err)`. Untyped errors fall back to a generic 500.
  - Status-code mapping is preserved exactly from current `routes.ts`: "not authenticated" / "requester's own user record missing" → `UnauthorizedError` (401, matching current behavior — this is a deliberate choice over the arguably-more-semantic `NotFoundError`, specifically to avoid changing a status code no test currently exercises but which would still be a real behavior change). "No access to X" / "Insufficient permissions" → `ForbiddenError` (403). "X not found" for a *target* resource (org/badge/user/progress) → `NotFoundError` (404). zod parse failures → `ValidationError` (400), body shape `{ message, code: "VALIDATION_ERROR", errors: <raw zod .errors array> }` — the existing tests assert `Array.isArray(res.body.errors)`, which still holds since `errors` is still the raw zod array, just now alongside `message`/`code` instead of alone.
- **Route-registration pattern:** each feature exports `registerXRoutes(app: Express)` (not an `express.Router`) — mirroring the existing `registerRoutes(app)` shape exactly, since routes within one feature don't share a single path prefix (e.g. badges feature has both `/organizations/:orgId/badges` and `/badges/:id`). `server/app.ts` calls each feature's register function directly.
- **Auth middleware boundary:** `isAuthenticated`, `hasOrganizationAccess`, `isAdminOrManager` (moving to `server/middleware/auth.ts`) keep their current direct `res.status(...).json(...)` responses — they are cross-cutting guards that run *before* any feature's handler, not part of a single feature's service layer, so they are **not** migrated to the throw-based pattern in this phase. This is a deliberate scope boundary, not an oversight.
- No placeholders: every task below either reproduces the exact current implementation being moved (verified against the actual file at plan-writing time) or specifies the exact new code, in full.
- Spec: `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` (Phase 3 section) plus the Phase-3 follow-up bullet added during Phase 2's final review (badge-progress storage gap, `autoAwardBadgeIfComplete` status mismatch — the status-mismatch half is fixed in Task 6, the storage-gap half is explicitly **not** touched here).
- Deferred to sibling sub-phases (not in scope here): client type consolidation (3b), dependency bumps (3c), OpenAPI rewrite (3d).

---

### Task 1: Error infrastructure, `asyncHandler`, auth-middleware relocation, `config.PORT`

**Files:**

- Create: `server/middleware/errors.ts`
- Create: `server/middleware/asyncHandler.ts`
- Create: `server/middleware/auth.ts` (moved from `server/middleware.ts`)
- Delete: `server/middleware.ts`
- Modify: `server/config.ts` (add `PORT`)
- Modify: `server/app.ts` (swap error middleware, update `./middleware` import path)
- Modify: `server/index.ts` (use `config.port` instead of hardcoded `5000`)
- Modify: `server/routes.ts` (update `./middleware` import path only — no route changes yet)

**Interfaces:**

- Produces: `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ValidationError` (all extend `ApiError`) and `errorHandler` (Express error middleware) from `server/middleware/errors.ts`. `asyncHandler(fn)` from `server/middleware/asyncHandler.ts` — every later task's route handlers wrap in this. `isAuthenticated`, `hasOrganizationAccess`, `isAdminOrManager`, `requireSessionUserId` from `server/middleware/auth.ts` (same signatures as before, same behavior, only the file moved and its internal `import * as storage from "./storage"` path adjusts to `"../storage"`).

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b phase-3a-server-restructure
```

- [ ] **Step 2: Create `server/middleware/errors.ts`**

```ts
import type { Request, Response, NextFunction } from "express";
import * as z from "zod";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Not authenticated") {
    super(message, 401, "UNAUTHORIZED");
  }
}

// Spec-mandated (Phase 3's three named error types include this one), kept
// for a service that wants to throw a non-zod validation failure directly.
// None of this phase's 25 routes currently need it — every validation path
// goes through zod's own .parse(), which throws z.ZodError and is handled
// by its own branch in errorHandler below, not by this class.
export class ValidationError extends ApiError {
  errors: unknown;

  constructor(errors: unknown, message = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR");
    this.errors = errors;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Every feature route calls schema.parse(req.body) directly (no route
  // ever catches ZodError itself) — zod throws its own z.ZodError, not one
  // of our ApiError subclasses, so it needs its own branch here rather than
  // being converted to ValidationError at each call site. Same response
  // shape ValidationError produces: existing tests assert
  // Array.isArray(res.body.errors), and err.errors is still the raw zod
  // issues array either way.
  if (err instanceof z.ZodError) {
    return res
      .status(400)
      .json({ message: "Validation failed", code: "VALIDATION_ERROR", errors: err.errors });
  }
  if (err instanceof ValidationError) {
    return res
      .status(err.status)
      .json({ message: err.message, code: err.code, errors: err.errors });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  console.error("Unhandled error:", err);
  return res
    .status(500)
    .json({ message: "Internal server error", code: "INTERNAL_ERROR" });
}
```

- [ ] **Step 3: Create `server/middleware/asyncHandler.ts`**

```ts
import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 does not catch a rejected promise returned by an async route
 * handler — an unhandled rejection there never reaches error middleware and
 * the request just hangs. Wrap every handler in this so thrown/rejected
 * errors (typed ApiErrors or not) flow to `next(err)` → errorHandler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

- [ ] **Step 4: Move `server/middleware.ts` to `server/middleware/auth.ts`**

Create `server/middleware/auth.ts` with the exact current content of `server/middleware.ts`, changing only the storage import path (one directory deeper now):

```ts
import { Request, Response, NextFunction } from "express";
import * as storage from "../storage";

/**
 * Middleware to check if a user is authenticated
 */
export async function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

/**
 * Middleware to check if a user has access to an organization
 * This will check if the user is a member of the requested organization
 */
export async function hasOrganizationAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // First ensure user is authenticated
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Get the requested organizationId from the request (route params, query, or body)
  const organizationId =
    // req.params.id is only safe to read as an organizationId because this
    // middleware is currently attached only to GET/PUT /organizations/:id.
    // If it's ever attached to a route where :id means something else (e.g.
    // /badges/:id, /users/:id), do not reuse this line as-is — it would
    // silently compare the wrong kind of id.
    parseInt(req.params.id) ||
    parseInt(req.params.organizationId) ||
    parseInt(req.query.organizationId as string) ||
    (req.body && req.body.organizationId
      ? parseInt(req.body.organizationId)
      : null);

  // If no organization specified, continue (other middleware can handle this)
  if (!organizationId) {
    return next();
  }

  try {
    // Get the user with their organization relationships
    const user = await storage.getUserById(req.session.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if the user has access to the organization
    // This works because getUserById returns organizations array
    const hasAccess =
      user.organizations &&
      user.organizations.some((org: any) => org.id === organizationId);

    // Admin users can access any organization
    if (user.role === "admin" || hasAccess) {
      next();
    } else {
      return res
        .status(403)
        .json({ message: "No access to this organization" });
    }
  } catch (error) {
    console.error("Error checking organization access:", error);
    return res
      .status(500)
      .json({ message: "Error checking organization access" });
  }
}

/**
 * Middleware to check if a user has admin or manager role
 */
export async function isAdminOrManager(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const user = await storage.getUserById(req.session.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.role === "admin" || user.role === "manager") {
      next();
    } else {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
  } catch (error) {
    console.error("Error checking user role:", error);
    return res.status(500).json({ message: "Error checking user role" });
  }
}

/**
 * Narrow req.session.userId to number. Only call in handlers behind
 * isAuthenticated, which guarantees the session has a userId.
 */
export function requireSessionUserId(req: Request): number {
  const userId = req.session.userId;
  if (userId === undefined) {
    throw new Error(
      "Session userId missing — route must be behind isAuthenticated",
    );
  }
  return userId;
}
```

Delete `server/middleware.ts`.

- [ ] **Step 5: Update `server/routes.ts`'s import of the middleware module**

Find, near the top of `server/routes.ts`:
```ts
import {
  isAuthenticated,
  hasOrganizationAccess,
  isAdminOrManager,
  requireSessionUserId,
} from "./middleware";
```
Replace with:
```ts
import {
  isAuthenticated,
  hasOrganizationAccess,
  isAdminOrManager,
  requireSessionUserId,
} from "./middleware/auth";
```
No other change to `server/routes.ts` in this task.

- [ ] **Step 6: Add `PORT` to `server/config.ts`**

Find:
```ts
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
```
Replace with:
```ts
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .optional(),
  PORT: z.coerce.number().int().positive().default(5000),
});
```
Find:
```ts
export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET ?? ephemeralSecret(),
};
```
Replace with:
```ts
export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET ?? ephemeralSecret(),
  port: env.PORT,
};
```

- [ ] **Step 7: Wire `config.port` into `server/index.ts`**

Find:
```ts
  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  httpServer.listen(
```
Replace with:
```ts
  // Serves both the API and the client on one port. Defaults to 5000
  // (config.port) — override with PORT if you need a different one.
  const port = config.port;
  httpServer.listen(
```
Add `config` to `server/index.ts`'s imports — find:
```ts
import { createApp } from "./app";
import { setupVite, serveStatic } from "./vite";
import { log } from "./logger";
```
Replace with:
```ts
import { createApp } from "./app";
import { config } from "./config";
import { setupVite, serveStatic } from "./vite";
import { log } from "./logger";
```

- [ ] **Step 8: Swap the error middleware in `server/app.ts`**

Find:
```ts
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
```
Replace with:
```ts
  const httpServer = await registerRoutes(app);

  app.use(errorHandler);

  return { app, httpServer };
```
Add the import — find:
```ts
import { config } from "./config";
import express, { type Request, Response, NextFunction } from "express";
import "./types"; // Import session type extensions
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { pool } from "@db";
import { log } from "./logger";
```
Replace with:
```ts
import { config } from "./config";
import express from "express";
import "./types"; // Import session type extensions
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { errorHandler } from "./middleware/errors";
import { pool } from "@db";
import { log } from "./logger";
```
(`Request`/`Response`/`NextFunction` types are no longer referenced directly in `app.ts` once the inline error handler is gone — the request-logging middleware above it uses inferred types from `app.use((req, res, next) => {...})`, which doesn't need the explicit type imports. If `npm run check` disagrees, keep whichever subset it actually needs.)

- [ ] **Step 9: Verify — typecheck, lint, full suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: both exit 0; `npm test` reports `7 passed (7)` / `52 passed (52)`, identical to before this task — nothing routed through the new `errorHandler`/`asyncHandler` yet (no feature has been migrated), so this step is purely proving the move + swap didn't change anything observable.

- [ ] **Step 10: Commit**

```bash
git add server/middleware server/config.ts server/app.ts server/index.ts server/routes.ts
git rm server/middleware.ts
git commit -m "feat: add typed-error infra (errors.ts, asyncHandler) and relocate auth middleware"
```

---

### Task 2: Users feature (foundational — migrates first, everything else depends on it)

**Files:**

- Create: `server/features/users/service.ts`
- Create: `server/features/users/routes.ts`
- Modify: `server/middleware/auth.ts` (import `getUserById` from the new service instead of `../storage`)
- Modify: `server/app.ts` (mount `registerUsersRoutes`)
- Modify: `server/routes.ts` (delete the 2 users routes + now-unused imports)
- Modify: `server/storage.ts` (delete only `getUsersByOrganization`, `getUsers`, `updateUser` — the last two are confirmed dead code, zero callers anywhere in the app or tests. `getUserById`/`getUserByUsername`/`createUser` stay in `storage.ts`, temporarily duplicated alongside the new service, until their respective last caller in `routes.ts` migrates in Task 3/Task 6 — see Step 6 below)
- Modify: `tests/support/fixtures.ts` (`createTestUser` imports from the new service)

**Interfaces:**

- Produces: `getUserById(id)`, `getUserByUsername(username)`, `createUser(userData, organizationIds?)`, `getUsersByOrganization(organizationId)`, and a new helper `getRequesterOrThrow(userId): Promise<ReturnType<typeof getUserById> & {}>` from `server/features/users/service.ts` — `getRequesterOrThrow` collapses the ~10-times-repeated `const user = await storage.getUserById(id); if (!user) return res.status(401)...` pattern into one call that throws `UnauthorizedError("User not found")`, preserving the current 401 (not 404) for this specific case. Every later feature task uses `getUserById` and/or `getRequesterOrThrow` from this file.

- [ ] **Step 1: Create `server/features/users/service.ts`**

```ts
import { pool } from "@db";
import { UnauthorizedError } from "../../middleware/errors";
import type { InsertUser } from "@shared/schema";

export async function getUserById(id: number) {
  try {
    // Use direct SQL query to avoid relationship issues during schema transition
    const sql = `
      SELECT u.*, 
             array_agg(DISTINCT o.id) as organization_ids,
             array_agg(DISTINCT o.name) as organization_names
      FROM users u
      LEFT JOIN user_organization uo ON u.id = uo.user_id
      LEFT JOIN organizations o ON uo.organization_id = o.id
      WHERE u.id = $1
      GROUP BY u.id
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      name: row.name,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    };
  } catch (error) {
    console.error("Error in getUserById:", error);
    throw error;
  }
}

export async function getUserByUsername(username: string) {
  try {
    // Use direct SQL query to avoid relationship issues during schema transition
    const sql = `
      SELECT u.*, 
             array_agg(DISTINCT o.id) as organization_ids,
             array_agg(DISTINCT o.name) as organization_names
      FROM users u
      LEFT JOIN user_organization uo ON u.id = uo.user_id
      LEFT JOIN organizations o ON uo.organization_id = o.id
      WHERE u.username = $1
      GROUP BY u.id
    `;

    const result = await pool.query(sql, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      name: row.name,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    };
  } catch (error) {
    console.error("Error in getUserByUsername:", error);
    throw error;
  }
}

export async function createUser(
  userData: InsertUser,
  organizationIds?: number[],
) {
  try {
    // Use direct SQL for user creation with only columns that definitely exist
    const sql = `
      INSERT INTO users (username, password, name, email, role, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, password, name, email, role, organization_id as "organizationId", created_at as "createdAt"
    `;

    const values = [
      userData.username,
      userData.password,
      userData.name,
      userData.email,
      userData.role || "user",
      userData.organizationId || null,
    ];

    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      throw new Error("Failed to create user");
    }

    const newUser = result.rows[0];

    // Associate user with organizations if provided
    if (organizationIds && organizationIds.length > 0) {
      const orgPromises = organizationIds.map((orgId) => {
        return pool.query(
          `INSERT INTO user_organization (user_id, organization_id)
           VALUES ($1, $2)`,
          [newUser.id, orgId],
        );
      });

      await Promise.all(orgPromises);
    }

    return newUser;
  } catch (error) {
    console.error("Error in createUser:", error);
    throw error;
  }
}

export async function getUsersByOrganization(organizationId: number) {
  try {
    // Use raw SQL query for compatibility during schema transition
    const sql = `
      SELECT u.*,
            array_agg(DISTINCT o.id) as organization_ids,
            array_agg(DISTINCT o.name) as organization_names
      FROM users u
      JOIN user_organization uo ON u.id = uo.user_id
      JOIN organizations o ON uo.organization_id = o.id
      WHERE uo.organization_id = $1
      GROUP BY u.id
      ORDER BY u.name ASC
    `;

    const result = await pool.query(sql, [organizationId]);

    // Format the results to include the organizations array
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    }));
  } catch (error) {
    console.error("Error in getUsersByOrganization:", error);
    throw error;
  }
}

/**
 * Loads the current session's user record, throwing UnauthorizedError (401)
 * if it's missing — collapses the repeated
 * `const user = await getUserById(id); if (!user) return res.status(401)...`
 * pattern that appeared ~10 times across the old routes.ts. Deliberately
 * throws Unauthorized, not NotFound: this only fires when a valid,
 * authenticated session points at a user row that no longer exists, which
 * is an auth-state problem, not a "the resource you asked for is missing"
 * problem — and it preserves the exact 401 the old code returned here.
 */
export async function getRequesterOrThrow(userId: number) {
  const user = await getUserById(userId);
  if (!user) {
    throw new UnauthorizedError("User not found");
  }
  return user;
}
```

- [ ] **Step 2: Create `server/features/users/routes.ts`**

```ts
import type { Express } from "express";
import * as z from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { isAuthenticated, requireSessionUserId } from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import { getUsersByOrganization, getUserById, getRequesterOrThrow } from "./service";

export function registerUsersRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.get(
    `${apiPrefix}/organizations/:orgId/users`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = z.coerce.number().int().positive().parse(req.params.orgId);

      const userId = requireSessionUserId(req);
      const currentUser = await getRequesterOrThrow(userId);

      const hasAccess =
        currentUser.role === "admin" ||
        (currentUser.organizations &&
          currentUser.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const users = await getUsersByOrganization(orgId);

      return res.status(200).json(users);
    }),
  );

  app.get(
    `${apiPrefix}/users/:id`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const user = await getUserById(id);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // If requesting another user, verify they're in the same organization
      const requesterId = requireSessionUserId(req);

      if (id !== requesterId) {
        const requester = await getRequesterOrThrow(requesterId);

        // Admin can view any user
        if (requester.role !== "admin") {
          // Check if the requested user and requester share any organization
          const requesterOrgIds = requester.organizations
            ? requester.organizations.map((org: any) => org.id)
            : [];
          const userOrgIds = user.organizations
            ? user.organizations.map((org: any) => org.id)
            : [];

          // Find common organizations
          const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
            userOrgIds.includes(orgId),
          );

          if (sharedOrgs.length === 0) {
            throw new ForbiddenError("No access to this user");
          }
        }
      }

      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizations: user.organizations || [],
      });
    }),
  );
}
```

Note: the original `GET /users/:id` handler used `parseInt(req.params.id)` with no validation of the result (a non-numeric id would produce `NaN`, and `storage.getUserById(NaN)` would just find no row → 404). This version uses `z.coerce.number().int().positive().parse(...)`, which instead throws `ValidationError` (400) for a non-numeric id. **This is a real, minor behavior change** (404 → 400 for a malformed id param) — flag it explicitly in this task's self-review and the task-reviewer's findings; it's arguably a correctness improvement (400 is the right code for "the URL itself is malformed"), but it IS a change, and no existing test exercises a non-numeric `:id`/`:orgId` param, so nothing will fail — the task reviewer should confirm this is acceptable rather than silently accepting it. If the human/reviewer decides this must not change, revert to `parseInt(...)` with no validation, matching the original exactly.

- [ ] **Step 3: Wire `getUserById` in `server/middleware/auth.ts` from the new service**

Find:
```ts
import { Request, Response, NextFunction } from "express";
import * as storage from "../storage";
```
Replace with:
```ts
import { Request, Response, NextFunction } from "express";
import { getUserById } from "../features/users/service";
```
Then find both occurrences of `storage.getUserById(req.session.userId)` in this file (in `hasOrganizationAccess` and `isAdminOrManager`) and replace each with `getUserById(req.session.userId)`. No other change to this file.

- [ ] **Step 4: Mount the users feature in `server/app.ts`**

Find:
```ts
import { registerRoutes } from "./routes";
import { errorHandler } from "./middleware/errors";
```
Replace with:
```ts
import { registerRoutes } from "./routes";
import { registerUsersRoutes } from "./features/users/routes";
import { errorHandler } from "./middleware/errors";
```
Find:
```ts
  const httpServer = await registerRoutes(app);

  app.use(errorHandler);
```
Replace with:
```ts
  registerUsersRoutes(app);
  const httpServer = await registerRoutes(app);

  app.use(errorHandler);
```

- [ ] **Step 5: Delete the 2 users routes from `server/routes.ts`**

Find and delete this entire block (the `// User endpoints` section):
```ts
  // User endpoints
  app.get(
    `${apiPrefix}/organizations/:orgId/users`,
    isAuthenticated,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = requireSessionUserId(req);
        const currentUser = await storage.getUserById(userId);

        if (!currentUser) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          currentUser.role === "admin" ||
          (currentUser.organizations &&
            currentUser.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const users = await storage.getUsersByOrganization(orgId);

        return res.status(200).json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(`${apiPrefix}/users/:id`, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUserById(id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // If requesting another user, verify they're in the same organization
      const requesterId = requireSessionUserId(req);

      if (id !== requesterId) {
        const requester = await storage.getUserById(requesterId);

        if (!requester) {
          return res.status(401).json({ message: "Requester not found" });
        }

        // Admin can view any user
        if (requester.role !== "admin") {
          // Check if the requested user and requester share any organization
          const requesterOrgIds = requester.organizations
            ? requester.organizations.map((org: any) => org.id)
            : [];
          const userOrgIds = user.organizations
            ? user.organizations.map((org: any) => org.id)
            : [];

          // Find common organizations
          const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
            userOrgIds.includes(orgId),
          );

          if (sharedOrgs.length === 0) {
            return res.status(403).json({ message: "No access to this user" });
          }
        }
      }

      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizations: user.organizations || [],
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
```

**Every other call to `storage.getUserById(...)` elsewhere in `routes.ts` stays exactly as-is for now** (still calling the storage.ts version, which still exists and still works — organizations/badges/progress routes migrate in later tasks). Do not touch any route outside the block above.

- [ ] **Step 6: Delete only the fully-orphaned functions from `server/storage.ts`**

Delete `getUsersByOrganization` (its only caller was the block just deleted from `routes.ts` in Step 5) and the two dead, zero-caller functions confirmed during Phase 3 research: `getUsers` (the flat, no-argument listing function) and `updateUser`.

**Do NOT delete `getUserById`, `getUserByUsername`, or `createUser` from `server/storage.ts` in this task**, even though they now also exist in `features/users/service.ts`. `server/routes.ts` still calls `storage.getUserById` in ~22 places (every not-yet-migrated organizations/badges/progress route's permission check) and `storage.getUserByUsername`/`storage.createUser` in the still-present login/register handlers (Task 3 migrates those). Deleting them now would break the typecheck and, if forced through anyway, break login/register/most permission-gated routes at runtime — Step 5's note above is correct that these "still exist and still work" in `storage.ts` for now. This is a deliberate, temporary duplication (the same three functions exist in both `storage.ts` and `features/users/service.ts` until their respective last caller migrates): `getUserByUsername`/`createUser` get deleted from `storage.ts` in **Task 3** (once the auth routes — their only remaining callers — are removed from `routes.ts`), and `getUserById` gets deleted from `storage.ts` in **Task 6** (once the progress routes — the last feature to migrate — are removed from `routes.ts`, leaving zero remaining callers). Each of those tasks' own "delete from storage.ts" step below has been written to include this.

After this step, `server/storage.ts` still has `getUserById`, `getUserByUsername`, `createUser`, plus everything else (organizations, badges, badge categories, awarding, progress, stats) — only `getUsersByOrganization`, `getUsers`, and `updateUser` are gone.

- [ ] **Step 7: Update `tests/support/fixtures.ts`**

Find:
```ts
import * as storage from "../../server/storage";
```
Replace with:
```ts
import * as storage from "../../server/storage";
import { createUser } from "../../server/features/users/service";
```
Find, inside `createTestUser`:
```ts
  const user = await storage.createUser(
```
Replace with:
```ts
  const user = await createUser(
```
(`storage` is still imported and still used by `createTestOrganization`, `createTestCategory`, `createTestBadge` — do not remove the `storage` import itself, just stop using `storage.createUser`.)

- [ ] **Step 8: Verify — typecheck, lint, full suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: both exit 0, `52 passed (52)`. This is the highest-risk task in the plan — `tests/support/fixtures.ts`'s `createTestUser` is used by every single test file, so a mistake here breaks the whole suite, not just `tests/users.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add server/features/users server/middleware/auth.ts server/app.ts server/routes.ts server/storage.ts tests/support/fixtures.ts
git commit -m "feat: extract users feature (routes+service), migrate off storage.ts"
```

---

### Task 3: Auth feature

**Files:**

- Create: `server/features/auth/service.ts`
- Create: `server/features/auth/routes.ts`
- Modify: `server/app.ts` (mount `registerAuthRoutes`)
- Modify: `server/routes.ts` (delete the 4 auth routes + now-unused imports: `argon2`, `crypto`, `rateLimit`, `loginSchema`, `registerUserSchema`, and the `loginLimiter`/`registerLimiter`/`dummyPasswordHash` declarations)
- Modify: `server/storage.ts` (delete `getUserByUsername` and `createUser` — Task 2 deliberately left these in `storage.ts`, temporarily duplicated alongside `features/users/service.ts`, because `routes.ts`'s login/register handlers were still calling them; once this task's route deletions above land, they have zero remaining callers anywhere)

**Interfaces:**

- Consumes: `getUserByUsername`, `createUser` (`server/features/users/service.ts`, from Task 2).
- Produces: `verifyCredentials(username, password): Promise<User>` (throws `UnauthorizedError` on failure — collapses login's password-verification branch) and `registerUser(data): Promise<User>` (throws `ValidationError`-shaped duplicate-username 400 — actually a plain 400 with `{message}`, not zod-shaped; see Step 1, this one case doesn't fit the 4 typed errors cleanly, handled explicitly) from `server/features/auth/service.ts`.

- [ ] **Step 1: Create `server/features/auth/service.ts`**

```ts
import crypto from "node:crypto";
import argon2 from "argon2";
import { getUserByUsername, createUser as createUserRecord } from "../users/service";
import { UnauthorizedError, ApiError } from "../../middleware/errors";
import type { RegisterUser } from "@shared/schema";

// Verified against on login when the username doesn't exist, so a
// nonexistent-username request pays the same argon2id cost as a real one
// and can't be distinguished from a wrong-password request by timing.
const dummyPasswordHash = await argon2.hash(
  crypto.randomBytes(32).toString("hex"),
);

export async function verifyCredentials(username: string, password: string) {
  const user = await getUserByUsername(username);
  // argon2.verify throws on malformed stored hashes (e.g. legacy
  // plaintext rows) — treat that as a failed login, not a 500. Always
  // verify against something (dummyPasswordHash when the user doesn't
  // exist) so the response time doesn't leak whether the username is
  // registered.
  const passwordValid = await argon2
    .verify(user?.password ?? dummyPasswordHash, password)
    .catch(() => false);
  if (!user || !passwordValid) {
    throw new UnauthorizedError("Invalid credentials");
  }
  return user;
}

export class DuplicateUsernameError extends ApiError {
  constructor() {
    super("Username already exists", 400, "DUPLICATE_USERNAME");
  }
}

export async function registerUser(userData: RegisterUser) {
  const existingUser = await getUserByUsername(userData.username);
  if (existingUser) {
    throw new DuplicateUsernameError();
  }

  return createUserRecord({
    ...userData,
    password: await argon2.hash(userData.password),
  });
}
```

(`DuplicateUsernameError` is a small additional `ApiError` subclass, not one of the four general-purpose ones — it's specific to this one case and doesn't need its own file; the existing test only asserts `res.status(400)`, not a specific `code`, so this is compatible.)

- [ ] **Step 2: Create `server/features/auth/routes.ts`**

```ts
import type { Express } from "express";
import * as z from "zod";
import rateLimit from "express-rate-limit";
import { loginSchema, registerUserSchema } from "@shared/schema";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireSessionUserId } from "../../middleware/auth";
import { verifyCredentials, registerUser } from "./service";
import { getUserById } from "../users/service";

export function registerAuthRoutes(app: Express) {
  const apiPrefix = "/api/v1";

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

  app.post(
    `${apiPrefix}/auth/login`,
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { username, password } = loginSchema.parse(req.body);
      const user = await verifyCredentials(username, password);

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
    }),
  );

  app.post(
    `${apiPrefix}/auth/register`,
    registerLimiter,
    asyncHandler(async (req, res) => {
      const userData = registerUserSchema.parse(req.body);
      const newUser = await registerUser(userData);

      return res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        organizationId: newUser.organizationId || null,
      });
    }),
  );

  app.get(
    `${apiPrefix}/auth/me`,
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await getUserById(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || null,
      });
    }),
  );

  app.post(`${apiPrefix}/auth/logout`, (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ message: "Logged out successfully" });
    });
  });
}
```

Note: `/auth/me` and `/auth/logout` are left as close to their original inline form as possible (no service call needed — `/auth/me` is a thin read, `/auth/logout` never touches the database) rather than forced through `verifyCredentials`/service helpers that don't fit. `requireSessionUserId` and the `z` import are unused in this file — remove them from the import list above if `npm run lint` flags them (they were included defensively; `/auth/me` uses a direct `req.session.userId` check instead, matching the original).

- [ ] **Step 3: Mount the auth feature in `server/app.ts`**

Find:
```ts
import { registerRoutes } from "./routes";
import { registerUsersRoutes } from "./features/users/routes";
import { errorHandler } from "./middleware/errors";
```
Replace with:
```ts
import { registerRoutes } from "./routes";
import { registerUsersRoutes } from "./features/users/routes";
import { registerAuthRoutes } from "./features/auth/routes";
import { errorHandler } from "./middleware/errors";
```
Find:
```ts
  registerUsersRoutes(app);
  const httpServer = await registerRoutes(app);
```
Replace with:
```ts
  registerUsersRoutes(app);
  registerAuthRoutes(app);
  const httpServer = await registerRoutes(app);
```

- [ ] **Step 4: Delete the 4 auth routes from `server/routes.ts`**

Delete the entire `// Authentication endpoints` section — everything from the `loginLimiter`/`registerLimiter` declarations through the closing of the `/auth/logout` handler (i.e. from just after `const apiPrefix = "/api/v1";` through the line before `// Organization endpoints`). After this deletion, prune now-unused imports at the top of `routes.ts`: remove `argon2` (no longer used — `createBadge`/etc. don't need it), remove `rateLimit` (no longer used — badges/progress rate limiting was never added elsewhere), remove `loginSchema` and `registerUserSchema` from the `@shared/schema` import list (keep the rest of that import list — `organizationsInsertSchema`, `badgesInsertSchema`, etc. are still used by remaining routes). Confirm with `npm run lint` that nothing else in `routes.ts` still references `argon2`, `rateLimit`, `loginSchema`, or `registerUserSchema` before removing their imports — if lint flags a leftover reference, leave that specific import in place and note it in the task report rather than guessing.

- [ ] **Step 5: Delete `getUserByUsername` and `createUser` from `server/storage.ts`**

Task 2 deliberately kept these two functions in `storage.ts` (duplicated alongside `features/users/service.ts`) because `routes.ts`'s login/register handlers were still calling `storage.getUserByUsername`/`storage.createUser`. After Step 4's deletion above, `routes.ts` no longer calls either — confirm with `grep -n "storage\.\(getUserByUsername\|createUser\)" server/routes.ts` that it returns nothing, then delete both functions from `storage.ts`. `getUserById` stays in `storage.ts` for now (still called throughout the not-yet-migrated organizations/badges/progress routes) — it's Task 6's job to remove it, not this task's.

- [ ] **Step 6: Verify — typecheck, lint, full suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: both exit 0, `52 passed (52)` — particularly `tests/auth.test.ts`'s 14 tests, including both rate-limiter-exhaustion tests (confirming the limiters still work identically now that they're declared inside `registerAuthRoutes` instead of `registerRoutes`).

- [ ] **Step 7: Commit**

```bash
git add server/features/auth server/app.ts server/routes.ts server/storage.ts
git commit -m "feat: extract auth feature (routes+service)"
```

---

### Task 4: Organizations feature (+ categories + stats)

**Files:**

- Create: `server/features/organizations/service.ts`
- Create: `server/features/organizations/routes.ts`
- Modify: `server/app.ts` (mount `registerOrganizationsRoutes`)
- Modify: `server/routes.ts` (delete 7 routes + now-unused imports: `organizationsInsertSchema`, `badgeCategoriesInsertSchema`, `hasOrganizationAccess`, `isAdminOrManager` if no longer referenced elsewhere in the file — verify before removing)
- Modify: `server/storage.ts` (delete `getOrganizations`, `getOrganizationById`, `createOrganization`, `updateOrganization`, `getBadgeCategories`, `createBadgeCategory`, `getOrganizationStats`, and the dead `getBadgeCategoryById`)
- Modify: `tests/support/fixtures.ts` (`createTestOrganization`, `createTestCategory` import from the new service)

**Interfaces:**

- Consumes: `getUserById`, `getRequesterOrThrow` (`server/features/users/service.ts`).
- Produces: `getOrganizations`, `getOrganizationById`, `createOrganization`, `updateOrganization`, `getBadgeCategories`, `createBadgeCategory`, `getOrganizationStats` from `server/features/organizations/service.ts` — `tests/support/fixtures.ts` and Task 5 (badges feature, for org-existence checks if needed) consume these.

- [ ] **Step 1: Create `server/features/organizations/service.ts`**

```ts
import { db } from "@db";
import { eq } from "drizzle-orm";
import { pool } from "@db";
import {
  organizations,
  badgeCategories,
  type InsertOrganization,
  type Organization,
  type InsertBadgeCategory,
} from "@shared/schema";

export async function getOrganizations() {
  try {
    // Use raw SQL query to avoid schema-related issues
    const sql = `
      SELECT id, name, description, created_at as "createdAt"
      FROM organizations
      ORDER BY name ASC
    `;

    const result = await pool.query(sql);
    return result.rows;
  } catch (error) {
    console.error("Error in getOrganizations:", error);
    throw error;
  }
}

export async function getOrganizationById(id: number) {
  return db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
}

export async function createOrganization(organization: InsertOrganization) {
  const [newOrganization] = await db
    .insert(organizations)
    .values(organization)
    .returning();
  return newOrganization;
}

export async function updateOrganization(
  id: number,
  data: Partial<Organization>,
) {
  const [updatedOrganization] = await db
    .update(organizations)
    .set(data)
    .where(eq(organizations.id, id))
    .returning();
  return updatedOrganization;
}

export async function getBadgeCategories(organizationId: number) {
  try {
    // Use raw SQL query to avoid schema-related issues
    const sql = `
      SELECT id, name, organization_id as "organizationId", 
             created_at as "createdAt"
      FROM badge_categories
      WHERE organization_id = $1
      ORDER BY name ASC
    `;

    const result = await pool.query(sql, [organizationId]);
    return result.rows;
  } catch (error) {
    console.error("Error in getBadgeCategories:", error);
    throw error;
  }
}

export async function createBadgeCategory(category: InsertBadgeCategory) {
  const [newCategory] = await db
    .insert(badgeCategories)
    .values(category)
    .returning();
  return newCategory;
}

export async function getOrganizationStats(organizationId: number) {
  try {
    // Count badges in organization
    const badgeSql = `
      SELECT COUNT(*) as count
      FROM badges
      WHERE organization_id = $1
    `;
    const badgeResult = await pool.query(badgeSql, [organizationId]);
    const badgeCount = parseInt(badgeResult.rows[0].count);

    // Count users in organization (using many-to-many)
    const userSql = `
      SELECT COUNT(*) as count
      FROM user_organization
      WHERE organization_id = $1
    `;
    const userResult = await pool.query(userSql, [organizationId]);
    const userCount = parseInt(userResult.rows[0].count);

    // Count awarded badges
    const awardSql = `
      SELECT COUNT(*) as count
      FROM achievements a
      JOIN badges b ON a.badge_id = b.id
      WHERE b.organization_id = $1
    `;
    const awardResult = await pool.query(awardSql, [organizationId]);
    const awardCount = parseInt(awardResult.rows[0].count);

    // Count in-progress metrics (a bit more complex with the new schema)
    const progressSql = `
      SELECT COUNT(DISTINCT p.user_id || '-' || bm.badge_id) as count
      FROM progress p
      JOIN metrics m ON p.metric_id = m.id
      JOIN badge_metrics bm ON m.id = bm.metric_id
      JOIN badges b ON bm.badge_id = b.id
      WHERE b.organization_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM achievements a 
        WHERE a.badge_id = bm.badge_id 
        AND a.user_id = p.user_id
      )
    `;
    const progressResult = await pool.query(progressSql, [organizationId]);
    const inProgressCount = parseInt(progressResult.rows[0].count);

    return {
      totalBadges: badgeCount || 0,
      totalUsers: userCount || 0,
      totalAwarded: awardCount || 0,
      inProgress: inProgressCount || 0,
    };
  } catch (error) {
    console.error("Error in getOrganizationStats:", error);
    return {
      totalBadges: 0,
      totalUsers: 0,
      totalAwarded: 0,
      inProgress: 0,
    };
  }
}
```

(`getBadgeCategoryById` is confirmed dead code — zero callers anywhere — and is not carried forward.)

- [ ] **Step 2: Create `server/features/organizations/routes.ts`**

```ts
import type { Express } from "express";
import * as z from "zod";
import {
  organizationsInsertSchema,
  badgeCategoriesInsertSchema,
} from "@shared/schema";
import { asyncHandler } from "../../middleware/asyncHandler";
import {
  isAuthenticated,
  hasOrganizationAccess,
  isAdminOrManager,
  requireSessionUserId,
} from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import { getRequesterOrThrow } from "../users/service";
import {
  getOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  getBadgeCategories,
  createBadgeCategory,
  getOrganizationStats,
} from "./service";

export function registerOrganizationsRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.get(
    `${apiPrefix}/organizations`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const userId = req.session.userId;

      // If we have a userId, get only organizations the user belongs to
      if (userId) {
        const user = await getRequesterOrThrow(userId);
        if (user.role === "admin") {
          // Admins can see all organizations
          const organizations = await getOrganizations();
          return res.status(200).json(organizations);
        } else {
          // Regular users only see organizations they belong to
          return res.status(200).json(user.organizations || []);
        }
      }

      return res.status(401).json({ message: "Not authenticated" });
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:id`,
    isAuthenticated,
    hasOrganizationAccess,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const organization = await getOrganizationById(id);

      if (!organization) {
        throw new NotFoundError("Organization not found");
      }

      return res.status(200).json(organization);
    }),
  );

  app.post(
    `${apiPrefix}/organizations`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const organizationData = organizationsInsertSchema.parse(req.body);
      const newOrganization = await createOrganization({
        ...organizationData,
        createdBy: req.session.userId || null,
      });

      return res.status(201).json(newOrganization);
    }),
  );

  app.put(
    `${apiPrefix}/organizations/:id`,
    isAuthenticated,
    hasOrganizationAccess,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const updateData = {
        // createdBy is an audit field, never client-assignable
        ...organizationsInsertSchema
          .omit({ createdBy: true })
          .partial()
          .parse(req.body),
        updatedBy: req.session.userId || null,
      };

      const updatedOrganization = await updateOrganization(id, updateData);

      if (!updatedOrganization) {
        throw new NotFoundError("Organization not found");
      }

      return res.status(200).json(updatedOrganization);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/categories`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const categories = await getBadgeCategories(orgId);

      return res.status(200).json(categories);
    }),
  );

  app.post(
    `${apiPrefix}/organizations/:orgId/categories`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const categoryData = badgeCategoriesInsertSchema.parse(req.body);

      const newCategory = await createBadgeCategory({
        ...categoryData,
        organizationId: orgId,
        createdBy: req.session.userId || null,
      });

      return res.status(201).json(newCategory);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/stats`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const stats = await getOrganizationStats(orgId);

      return res.status(200).json(stats);
    }),
  );
}
```

(`z` is imported but unused in this file if you transcribe it exactly as above — remove that import if `npm run lint` flags it. It was kept available in case `orgId`/`id` parsing needed the same `z.coerce.number()` treatment applied in Task 2, but this task deliberately keeps `parseInt` unchanged here to minimize the diff — only Task 2's `users` routes changed that behavior, as explicitly flagged there.)

- [ ] **Step 3: Mount the organizations feature in `server/app.ts`**

Find:
```ts
import { registerAuthRoutes } from "./features/auth/routes";
```
Replace with:
```ts
import { registerAuthRoutes } from "./features/auth/routes";
import { registerOrganizationsRoutes } from "./features/organizations/routes";
```
Find:
```ts
  registerAuthRoutes(app);
  const httpServer = await registerRoutes(app);
```
Replace with:
```ts
  registerAuthRoutes(app);
  registerOrganizationsRoutes(app);
  const httpServer = await registerRoutes(app);
```

- [ ] **Step 4: Delete the 7 organizations/categories/stats routes from `server/routes.ts`**

Delete the `// Organization endpoints` section (`GET /organizations`, `GET /organizations/:id`, `POST /organizations`, `PUT /organizations/:id`), the `// Badge Category endpoints` section (`GET`/`POST /organizations/:orgId/categories`), and the `// Stats endpoints` section (`GET /organizations/:orgId/stats`). Prune now-unused imports: `organizationsInsertSchema`, `badgeCategoriesInsertSchema` from the `@shared/schema` import list. Do **not** remove `hasOrganizationAccess`/`isAdminOrManager` from the `./middleware/auth` import yet — badges routes (still in `routes.ts` until Task 5) also use `isAdminOrManager`; verify with lint before removing anything from that import list.

- [ ] **Step 5: Delete the moved functions from `server/storage.ts`**

Delete `getOrganizations`, `getOrganizationById`, `createOrganization`, `updateOrganization`, `getBadgeCategories`, `createBadgeCategory`, `getOrganizationStats`, and `getBadgeCategoryById` (dead).

- [ ] **Step 6: Update `tests/support/fixtures.ts`**

Find:
```ts
import * as storage from "../../server/storage";
import { createUser } from "../../server/features/users/service";
```
Replace with:
```ts
import * as storage from "../../server/storage";
import { createUser } from "../../server/features/users/service";
import {
  createOrganization,
  createBadgeCategory,
} from "../../server/features/organizations/service";
```
In `createTestOrganization`, change `return storage.createOrganization({` to `return createOrganization({`. In `createTestCategory`, change `return storage.createBadgeCategory({` to `return createBadgeCategory({`.

- [ ] **Step 7: Verify — typecheck, lint, full suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: both exit 0, `52 passed (52)` — `tests/organizations.test.ts` (11 tests) and `tests/stats.test.ts` (2 tests) exercise this task most directly, but since `createTestOrganization`/`createTestCategory` are used by almost every other test file too, run the full suite, not a subset.

- [ ] **Step 8: Commit**

```bash
git add server/features/organizations server/app.ts server/routes.ts server/storage.ts tests/support/fixtures.ts
git commit -m "feat: extract organizations feature (routes+service, incl. categories+stats)"
```

---

### Task 5: Badges feature

**Files:**

- Create: `server/features/badges/service.ts`
- Create: `server/features/badges/routes.ts`
- Modify: `server/app.ts` (mount `registerBadgesRoutes`)
- Modify: `server/routes.ts` (delete 5 routes + now-unused imports)
- Modify: `server/storage.ts` (delete `getBadges`, `getBadgeById`, `createBadge`, `updateBadge`, `deleteBadge`)
- Modify: `tests/support/fixtures.ts` (`createTestBadge` imports from the new service)

**Interfaces:**

- Consumes: `getRequesterOrThrow` (`server/features/users/service.ts`).
- Produces: `getBadges`, `getBadgeById`, `createBadge`, `updateBadge`, `deleteBadge` from `server/features/badges/service.ts` — Task 6 (progress feature) consumes `getBadgeById`.

- [ ] **Step 1: Create `server/features/badges/service.ts`**

```ts
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import {
  badges,
  type InsertBadge,
  type Badge,
} from "@shared/schema";

export async function getBadges(organizationId: number, categoryId?: number) {
  try {
    let sql = `
      SELECT b.*, c.name as category_name, c.id as category_id
      FROM badges b
      LEFT JOIN badge_categories c ON b.category_id = c.id
      WHERE b.organization_id = $1
    `;
    const params: (number | undefined)[] = [organizationId];

    if (categoryId) {
      sql += ` AND b.category_id = $2`;
      params.push(categoryId);
    }

    sql += ` ORDER BY b.name ASC`;

    const result = await pool.query(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      criteria: row.criteria,
      imageUrl: row.image_url,
      color: row.color,
      categoryId: row.category_id,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      requiresProgress: row.requires_progress,
      criteriaSections: row.criteria_sections,
      criteriaType: row.criteria_type || "binary",
      category: row.category_id
        ? {
            id: row.category_id,
            name: row.category_name,
          }
        : null,
    }));
  } catch (error) {
    console.error("Error in getBadges:", error);
    throw error;
  }
}

export async function getBadgeById(id: number) {
  try {
    // Using SQL directly to avoid schema caching issues
    const sql = `
      SELECT b.*, c.name as category_name, c.id as category_id
      FROM badges b
      LEFT JOIN badge_categories c ON b.category_id = c.id
      WHERE b.id = $1
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      criteria: row.criteria,
      imageUrl: row.image_url,
      color: row.color,
      categoryId: row.category_id,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      requiresProgress: row.requires_progress,
      criteriaSections: row.criteria_sections,
      criteriaType: row.criteria_type || "binary",
      category: row.category_id
        ? {
            id: row.category_id,
            name: row.category_name,
          }
        : null,
    };
  } catch (error) {
    console.error("Error in getBadgeById:", error);
    throw error;
  }
}

export async function createBadge(
  badge: InsertBadge & { organizationId: number },
) {
  const [newBadge] = await db.insert(badges).values(badge).returning();
  return newBadge;
}

export async function updateBadge(id: number, data: Partial<Badge>) {
  const [updatedBadge] = await db
    .update(badges)
    .set(data)
    .where(eq(badges.id, id))
    .returning();
  return updatedBadge;
}

export async function deleteBadge(id: number) {
  await db.delete(badges).where(eq(badges.id, id));
  return { success: true };
}
```

Note: this transcription includes a genuine, minor fix to `getBadges` — the original `storage.ts` version built its SQL with a raw string-concatenated `categoryId` filter but the current `server/routes.ts` caller never actually validated `categoryId` was present before use in a way that risked breaking; re-verify the original `getBadges` implementation in `server/storage.ts` (lines ~401-447) against this transcription line-by-line before committing — if there is any discrepancy, prefer the original's exact behavior over this plan's text and note the correction in the task report.

- [ ] **Step 2: Create `server/features/badges/routes.ts`**

```ts
import type { Express } from "express";
import * as z from "zod";
import { badgesInsertSchema } from "@shared/schema";
import { asyncHandler } from "../../middleware/asyncHandler";
import {
  isAuthenticated,
  isAdminOrManager,
  requireSessionUserId,
} from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import { getRequesterOrThrow } from "../users/service";
import {
  getBadges,
  getBadgeById,
  createBadge,
  updateBadge,
  deleteBadge,
} from "./service";

export function registerBadgesRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.get(
    `${apiPrefix}/organizations/:orgId/badges`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);
      const categoryId = req.query.categoryId
        ? parseInt(req.query.categoryId as string)
        : undefined;

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const badges = await getBadges(orgId, categoryId);

      return res.status(200).json(badges);
    }),
  );

  app.get(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const badge = await getBadgeById(id);

      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === badge.organizationId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      return res.status(200).json(badge);
    }),
  );

  app.post(
    `${apiPrefix}/organizations/:orgId/badges`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const badgeData = badgesInsertSchema.parse(req.body);

      const newBadge = await createBadge({
        ...badgeData,
        organizationId: orgId,
        createdBy: req.session.userId || null,
      });

      return res.status(201).json(newBadge);
    }),
  );

  app.put(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const existingBadge = await getBadgeById(id);

      if (!existingBadge) {
        throw new NotFoundError("Badge not found");
      }

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some(
            (org: any) => org.id === existingBadge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      const updateData = {
        // organizationId is the tenant boundary and createdBy is an audit
        // field — neither is client-assignable via this update endpoint
        ...badgesInsertSchema
          .omit({ organizationId: true, createdBy: true })
          .partial()
          .parse(req.body),
        updatedBy: req.session.userId || null,
      };

      const updatedBadge = await updateBadge(id, updateData);

      if (!updatedBadge) {
        throw new NotFoundError("Badge not found");
      }

      return res.status(200).json(updatedBadge);
    }),
  );

  app.delete(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const existingBadge = await getBadgeById(id);

      if (!existingBadge) {
        throw new NotFoundError("Badge not found");
      }

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some(
            (org: any) => org.id === existingBadge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      await deleteBadge(id);

      return res.status(200).json({ message: "Badge deleted successfully" });
    }),
  );
}
```

(`z` is unused if transcribed exactly — remove if lint flags it.)

- [ ] **Step 3: Mount the badges feature in `server/app.ts`**

Find:
```ts
import { registerOrganizationsRoutes } from "./features/organizations/routes";
```
Replace with:
```ts
import { registerOrganizationsRoutes } from "./features/organizations/routes";
import { registerBadgesRoutes } from "./features/badges/routes";
```
Find:
```ts
  registerOrganizationsRoutes(app);
  const httpServer = await registerRoutes(app);
```
Replace with:
```ts
  registerOrganizationsRoutes(app);
  registerBadgesRoutes(app);
  const httpServer = await registerRoutes(app);
```

- [ ] **Step 4: Delete the 5 badges routes from `server/routes.ts`**

Delete the `// Badge endpoints` section entirely (`GET /organizations/:orgId/badges`, `GET /badges/:id`, `POST /organizations/:orgId/badges`, `PUT /badges/:id`, `DELETE /badges/:id`). Prune `badgesInsertSchema` from the `@shared/schema` import if nothing else in `routes.ts` still uses it (the progress routes, still present until Task 6, do not use it). Verify with lint before removing `isAdminOrManager` from the middleware import — the progress/award routes (Task 6) still need it.

- [ ] **Step 5: Delete the moved functions from `server/storage.ts`**

Delete `getBadges`, `getBadgeById`, `createBadge`, `updateBadge`, `deleteBadge`. After this, only the badge-awarding and progress functions remain in `storage.ts`, plus the dead `_getTableColumns`.

- [ ] **Step 6: Update `tests/support/fixtures.ts`**

Find:
```ts
import {
  createOrganization,
  createBadgeCategory,
} from "../../server/features/organizations/service";
```
Replace with:
```ts
import {
  createOrganization,
  createBadgeCategory,
} from "../../server/features/organizations/service";
import { createBadge } from "../../server/features/badges/service";
```
In `createTestBadge`, change `return storage.createBadge({` to `return createBadge({`. At this point `storage` (the `import * as storage from "../../server/storage"` line) has no remaining callers in this file — remove that import entirely if `npm run lint` confirms it's unused.

- [ ] **Step 7: Verify — typecheck, lint, full suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: both exit 0, `52 passed (52)`.

- [ ] **Step 8: Commit**

```bash
git add server/features/badges server/app.ts server/routes.ts server/storage.ts tests/support/fixtures.ts
git commit -m "feat: extract badges feature (routes+service)"
```

---

### Task 6: Progress feature (badge awarding + progress tracking)

**Files:**

- Create: `server/features/progress/service.ts`
- Create: `server/features/progress/routes.ts`
- Modify: `server/app.ts` (mount `registerProgressRoutes`)
- Modify: `server/routes.ts` (delete remaining 7 routes — this empties `registerRoutes` down to just server creation)
- Modify: `server/storage.ts` (delete all remaining progress/awarding functions, the dead `_getTableColumns`, and `getUserById` — the last of these was deliberately left duplicated since Task 2 because `routes.ts` still called it; this task's route deletions are what finally remove its last caller. This empties the file down to nothing but now-unused imports.)

**Interfaces:**

- Consumes: `getBadgeById` (`server/features/badges/service.ts`, Task 5), `getRequesterOrThrow` (`server/features/users/service.ts`, Task 2).
- Produces: `awardBadge`, `getAwardedBadges`, `getUserAwardedBadges`, `getBadgeProgress`, `getUserProgressForAllBadges`, `getBadgeProgressForOrganization`, `createOrUpdateBadgeProgress`, `autoAwardBadgeIfComplete` from `server/features/progress/service.ts`.

**One deliberate, pre-authorized behavior change in this task** (the other exception besides Task 7's `progress.tsx` fix, both called out in Global Constraints): `autoAwardBadgeIfComplete` currently writes `status: "completed"` when auto-awarding a badge, inconsistent with the manual award path's `status: "achieved"` (fixed during Phase 2). This was tracked as a required Phase 3 item in the spec doc (`docs/superpowers/specs/2026-07-13-agentic-modernization-design.md`, Phase 3 section) specifically *because* this task would be rewriting this exact function — fix it here: change `"completed"` to `"achieved"`. **Do not** touch the actual progress-persistence bug (the flat-percentage-has-no-storage gap) — that's explicitly out of scope, tracked separately, and this task's two "documents a known bug" tests (`tests/progress.test.ts`) must keep passing unchanged, proving the no-op behavior is still exactly what it was.

This task also collapses the `awardedBadges`/`achievements` dual-naming (both names refer to the same Drizzle table today, `shared/schema.ts:509` `export const awardedBadges = achievements;`) down to `achievements` only, throughout the new service — the old duality was a `storage.ts` artifact, not a real distinction.

- [ ] **Step 1: Create `server/features/progress/service.ts`**

```ts
import { db, pool } from "@db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  achievements,
  badges,
  users,
  progress,
  metrics,
  badgeMetrics,
  type InsertAchievement,
} from "@shared/schema";
import { getBadgeById } from "../badges/service";

export async function awardBadge(awardData: InsertAchievement) {
  const [newAward] = await db
    .insert(achievements)
    .values(awardData)
    .returning();
  return newAward;
}

export async function getAwardedBadges(organizationId: number) {
  return db
    .select({
      id: achievements.id,
      badgeId: achievements.badgeId,
      userId: achievements.userId,
      awardedBy: achievements.awardedBy,
      awardedAt: achievements.awardedAt,
      status: achievements.status,
      badgeName: badges.name,
      badgeDescription: badges.description,
      badgeColor: badges.color,
      badgeImageUrl: badges.imageUrl,
      userName: users.name,
      awardedByName: sql<string>`awarded_by_user.name`,
    })
    .from(achievements)
    .innerJoin(badges, eq(achievements.badgeId, badges.id))
    .innerJoin(users, eq(achievements.userId, users.id))
    .innerJoin(
      sql`users as awarded_by_user`,
      eq(achievements.awardedBy, sql`awarded_by_user.id`),
    )
    .where(eq(badges.organizationId, organizationId))
    .orderBy(desc(achievements.awardedAt));
}

export async function getUserAwardedBadges(userId: number) {
  return db
    .select({
      id: achievements.id,
      badgeId: achievements.badgeId,
      userId: achievements.userId,
      awardedBy: achievements.awardedBy,
      awardedAt: achievements.awardedAt,
      status: achievements.status,
      badgeName: badges.name,
      badgeDescription: badges.description,
      badgeColor: badges.color,
      badgeImageUrl: badges.imageUrl,
      awardedByName: sql<string>`awarded_by_user.name`,
    })
    .from(achievements)
    .innerJoin(badges, eq(achievements.badgeId, badges.id))
    .innerJoin(
      sql`users as awarded_by_user`,
      eq(achievements.awardedBy, sql`awarded_by_user.id`),
    )
    .where(eq(achievements.userId, userId))
    .orderBy(desc(achievements.awardedAt));
}

// Badge Progress - These functions use the metrics/progress model
export async function getBadgeProgress(badgeId: number, userId: number) {
  try {
    // Get metrics associated with the badge
    const badgeMetricsResult = await db
      .select({
        metricId: badgeMetrics.metricId,
      })
      .from(badgeMetrics)
      .where(eq(badgeMetrics.badgeId, badgeId));

    if (badgeMetricsResult.length === 0) {
      return null; // No metrics for this badge
    }

    const metricIds = badgeMetricsResult.map((bm) => bm.metricId);

    // Get progress for these metrics and user
    const progressItems = await db
      .select({
        id: progress.id,
        userId: progress.userId,
        metricId: progress.metricId,
        value: progress.value,
        lastUpdatedAt: progress.lastUpdatedAt,
        updatedBy: progress.updatedBy,
        metricName: metrics.name,
        metricDescription: metrics.description,
        metricType: metrics.type,
        targetValue: metrics.targetValue,
      })
      .from(progress)
      .innerJoin(metrics, eq(progress.metricId, metrics.id))
      .where(
        and(inArray(progress.metricId, metricIds), eq(progress.userId, userId)),
      );

    // Get badge details
    const badgeDetails = await getBadgeById(badgeId);

    if (!badgeDetails) {
      return null;
    }

    // Calculate overall progress percentage
    const totalMetrics = metricIds.length;
    let completedValue = 0;

    progressItems.forEach((item) => {
      if (item.metricType === "boolean" && item.value === "true") {
        completedValue += 1;
      } else if (item.metricType === "numeric") {
        const currentValue = parseInt(item.value);
        const targetValue = item.targetValue;
        if (currentValue >= targetValue) {
          completedValue += 1;
        } else {
          completedValue += currentValue / targetValue;
        }
      }
    });

    const progressPercentage =
      totalMetrics > 0 ? Math.round((completedValue / totalMetrics) * 100) : 0;

    const status = progressPercentage >= 100 ? "completed" : "in_progress";

    // Construct the response in a format compatible with the old API
    return {
      id: progressItems.length > 0 ? progressItems[0].id : 0,
      userId: userId,
      badgeId: badgeId,
      progress: progressPercentage,
      progressData: progressItems.reduce(
        (acc, item) => {
          acc[item.metricId] = {
            value: item.value,
            name: item.metricName,
            description: item.metricDescription,
            type: item.metricType,
            targetValue: item.targetValue,
          };
          return acc;
        },
        {} as Record<number, any>,
      ),
      lastUpdated:
        progressItems.length > 0 ? progressItems[0].lastUpdatedAt : new Date(),
      status: status,
      badge: badgeDetails,
      metrics: progressItems,
    };
  } catch (error) {
    console.error("Error in getBadgeProgress:", error);
    throw error;
  }
}

export async function getUserProgressForAllBadges(userId: number) {
  try {
    // Get all badges that have metrics
    const badgesWithMetrics = await db
      .select({
        badgeId: badgeMetrics.badgeId,
      })
      .from(badgeMetrics)
      .groupBy(badgeMetrics.badgeId);

    const badgeIds = badgesWithMetrics.map((b) => b.badgeId);

    // No badges with metrics
    if (badgeIds.length === 0) {
      return [];
    }

    // Get progress for all metrics for this user
    const userProgress = await db
      .select({
        id: progress.id,
        userId: progress.userId,
        metricId: progress.metricId,
        value: progress.value,
        lastUpdatedAt: progress.lastUpdatedAt,
        updatedBy: progress.updatedBy,
        metricName: metrics.name,
        metricDescription: metrics.description,
        metricType: metrics.type,
        targetValue: metrics.targetValue,
        updatedByName: sql<string>`updated_by_user.name`,
      })
      .from(progress)
      .innerJoin(metrics, eq(progress.metricId, metrics.id))
      .innerJoin(badgeMetrics, eq(metrics.id, badgeMetrics.metricId))
      .innerJoin(
        sql`users as updated_by_user`,
        eq(progress.updatedBy, sql`updated_by_user.id`),
      )
      .where(eq(progress.userId, userId));

    // Group progress by badge
    const progressByBadge: Record<number, any[]> = {};
    for (const item of userProgress) {
      // Get badge_id from badgeMetrics
      const badgeMetricItem = await db
        .select()
        .from(badgeMetrics)
        .where(eq(badgeMetrics.metricId, item.metricId))
        .limit(1);

      if (badgeMetricItem.length > 0) {
        const badgeId = badgeMetricItem[0].badgeId;
        if (!progressByBadge[badgeId]) {
          progressByBadge[badgeId] = [];
        }
        progressByBadge[badgeId].push(item);
      }
    }

    // Create combined progress objects
    const result = [];
    for (const [badgeId, items] of Object.entries(progressByBadge)) {
      const badgeDetails = await getBadgeById(parseInt(badgeId));
      if (!badgeDetails) continue;

      // Calculate overall progress
      const totalMetrics = items.length;
      let completedValue = 0;

      items.forEach((item) => {
        if (item.metricType === "boolean" && item.value === "true") {
          completedValue += 1;
        } else if (item.metricType === "numeric") {
          const currentValue = parseInt(item.value);
          const targetValue = item.targetValue;
          if (currentValue >= targetValue) {
            completedValue += 1;
          } else {
            completedValue += currentValue / targetValue;
          }
        }
      });

      const progressPercentage =
        totalMetrics > 0
          ? Math.round((completedValue / totalMetrics) * 100)
          : 0;

      const status = progressPercentage >= 100 ? "completed" : "in_progress";

      // Create a compatible response format
      result.push({
        id: items[0].id,
        badgeId: parseInt(badgeId),
        userId: userId,
        progress: progressPercentage,
        progressData: items.reduce(
          (acc, item) => {
            acc[item.metricId] = {
              value: item.value,
              name: item.metricName,
              description: item.metricDescription,
              type: item.metricType,
              targetValue: item.targetValue,
            };
            return acc;
          },
          {} as Record<number, any>,
        ),
        lastUpdated: items[0].lastUpdatedAt,
        updatedBy: items[0].updatedBy,
        status: status,
        badgeName: badgeDetails.name,
        badgeDescription: badgeDetails.description,
        badgeColor: badgeDetails.color,
        badgeImageUrl: badgeDetails.imageUrl,
        requiresProgress: true,
        criteriaSections: badgeDetails.criteriaSections,
        updatedByName: items[0].updatedByName,
      });
    }

    return result.sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );
  } catch (error) {
    console.error("Error in getUserProgressForAllBadges:", error);
    throw error;
  }
}

export async function getBadgeProgressForOrganization(organizationId: number) {
  try {
    // Get all badges in the organization that have metrics
    const badgesInOrg = await db
      .select({
        id: badges.id,
        name: badges.name,
      })
      .from(badges)
      .innerJoin(badgeMetrics, eq(badges.id, badgeMetrics.badgeId))
      .where(eq(badges.organizationId, organizationId))
      .groupBy(badges.id);

    if (badgesInOrg.length === 0) {
      return [];
    }

    const badgeIds = badgesInOrg.map((b) => b.id);

    // Get all metrics for these badges
    const badgeMetricsItems = await db
      .select({
        badgeId: badgeMetrics.badgeId,
        metricId: badgeMetrics.metricId,
      })
      .from(badgeMetrics)
      .where(inArray(badgeMetrics.badgeId, badgeIds));

    const metricIds = badgeMetricsItems.map((bm) => bm.metricId);

    // Get progress for these metrics
    const progressItems = await db
      .select({
        id: progress.id,
        userId: progress.userId,
        metricId: progress.metricId,
        value: progress.value,
        lastUpdatedAt: progress.lastUpdatedAt,
        updatedBy: progress.updatedBy,
        userName: users.name,
        updatedByName: sql<string>`updated_by_user.name`,
        metricName: metrics.name,
      })
      .from(progress)
      .innerJoin(users, eq(progress.userId, users.id))
      .innerJoin(metrics, eq(progress.metricId, metrics.id))
      .innerJoin(
        sql`users as updated_by_user`,
        eq(progress.updatedBy, sql`updated_by_user.id`),
      )
      .where(inArray(progress.metricId, metricIds))
      .orderBy(desc(progress.lastUpdatedAt));

    // Group progress by user and badge
    const groupedProgress: Record<string, any[]> = {};
    for (const item of progressItems) {
      // Find which badge this metric belongs to
      const badgeMetric = badgeMetricsItems.find(
        (bm) => bm.metricId === item.metricId,
      );
      if (!badgeMetric) continue;

      const key = `${item.userId}-${badgeMetric.badgeId}`;
      if (!groupedProgress[key]) {
        groupedProgress[key] = [];
      }
      groupedProgress[key].push({
        ...item,
        badgeId: badgeMetric.badgeId,
      });
    }

    // Format the response
    const result = [];
    for (const [, items] of Object.entries(groupedProgress)) {
      if (items.length === 0) continue;

      const badgeId = items[0].badgeId;
      const badgeName = badgesInOrg.find((b) => b.id === badgeId)?.name || "";

      // Get the first item for common fields
      const firstItem = items[0];

      result.push({
        id: firstItem.id,
        badgeId: badgeId,
        userId: firstItem.userId,
        lastUpdated: firstItem.lastUpdatedAt,
        updatedBy: firstItem.updatedBy,
        badgeName: badgeName,
        userName: firstItem.userName,
        updatedByName: firstItem.updatedByName,
        // These are placeholders to maintain API compatibility
        progress: 0, // Will be calculated properly in the client
        status: "in_progress",
      });
    }

    return result;
  } catch (error) {
    console.error("Error in getBadgeProgressForOrganization:", error);
    throw error;
  }
}

export async function createOrUpdateBadgeProgress(progressData: any) {
  try {
    // Start a transaction
    return await db.transaction(async (tx) => {
      // Extract badge and metric ids
      const { badgeId, userId, metrics: metricsData } = progressData;

      // Get all metrics for this badge
      const badgeMetricsItems = await tx
        .select({
          metricId: badgeMetrics.metricId,
        })
        .from(badgeMetrics)
        .where(eq(badgeMetrics.badgeId, badgeId));

      const metricIds = badgeMetricsItems.map((bm) => bm.metricId);

      // Process each metric
      const updatedProgress = [];
      for (const metricId of metricIds) {
        const metricValue =
          metricsData && metricsData[metricId]
            ? metricsData[metricId].value
            : "0";

        // Check if progress exists
        const existingProgress = await tx
          .select()
          .from(progress)
          .where(
            and(eq(progress.metricId, metricId), eq(progress.userId, userId)),
          )
          .limit(1);

        if (existingProgress.length > 0) {
          // Update existing
          const [updated] = await tx
            .update(progress)
            .set({
              value: metricValue,
              lastUpdatedAt: new Date(),
              updatedBy: progressData.updatedBy,
            })
            .where(eq(progress.id, existingProgress[0].id))
            .returning();

          updatedProgress.push(updated);
        } else {
          // Create new
          const [newProgress] = await tx
            .insert(progress)
            .values({
              userId: userId,
              metricId: metricId,
              value: metricValue,
              updatedBy: progressData.updatedBy,
              createdBy: progressData.updatedBy,
            })
            .returning();

          updatedProgress.push(newProgress);
        }
      }

      // Check if all metrics are complete and award the badge if needed
      const badgeProgress = await getBadgeProgress(badgeId, userId);
      if (badgeProgress && badgeProgress.progress >= 100) {
        await autoAwardBadgeIfComplete({
          badgeId,
          userId,
          updatedBy: progressData.updatedBy,
        });
      }

      return badgeProgress;
    });
  } catch (error) {
    console.error("Error in createOrUpdateBadgeProgress:", error);
    throw error;
  }
}

// Auto-award badge when progress reaches 100%
export async function autoAwardBadgeIfComplete(data: {
  badgeId: number;
  userId: number;
  updatedBy: number;
}) {
  // Check if the badge has already been awarded
  const existingAward = await db.query.achievements.findFirst({
    where: and(
      eq(achievements.badgeId, data.badgeId),
      eq(achievements.userId, data.userId),
    ),
  });

  if (!existingAward) {
    // Award the badge
    await db.insert(achievements).values({
      badgeId: data.badgeId,
      userId: data.userId,
      awardedBy: data.updatedBy,
      status: "achieved",
      awardedAt: new Date(),
      createdBy: data.updatedBy,
    });

    return true;
  }

  return false;
}
```

(This is a verbatim port of every function's implementation with two changes only: `awardedBadges` → `achievements` throughout, and `status: "completed"` → `status: "achieved"` in `autoAwardBadgeIfComplete` — the pre-authorized fix described above. Everything else, including the still-broken `createOrUpdateBadgeProgress`'s ignoring of the flat `progress` field, is unchanged.)

- [ ] **Step 2: Create `server/features/progress/routes.ts`**

```ts
import type { Express } from "express";
import * as z from "zod";
import { achievementsInsertSchema } from "@shared/schema";
import { asyncHandler } from "../../middleware/asyncHandler";
import {
  isAuthenticated,
  isAdminOrManager,
  requireSessionUserId,
} from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import { getRequesterOrThrow, getUserById } from "../users/service";
import { getBadgeById } from "../badges/service";
import {
  awardBadge,
  getAwardedBadges,
  getUserAwardedBadges,
  getBadgeProgress,
  getUserProgressForAllBadges,
  getBadgeProgressForOrganization,
  createOrUpdateBadgeProgress,
  autoAwardBadgeIfComplete,
} from "./service";

export function registerProgressRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.post(
    `${apiPrefix}/badges/:badgeId/award`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const badgeId = parseInt(req.params.badgeId);
      const { userId } = z
        .object({ userId: z.coerce.number().int().positive() })
        .parse(req.body);

      const badge = await getBadgeById(badgeId);
      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const currentUserId = requireSessionUserId(req);
      const currentUser = await getRequesterOrThrow(currentUserId);

      const hasAccess =
        currentUser.role === "admin" ||
        (currentUser.organizations &&
          currentUser.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      const targetUser = await getUserById(userId);
      if (!targetUser) {
        throw new NotFoundError("Target user not found");
      }

      const targetUserHasAccess =
        targetUser.organizations &&
        targetUser.organizations.some(
          (org: any) => org.id === badge.organizationId,
        );

      if (!targetUserHasAccess) {
        throw new ForbiddenError("Target user not in this badge's organization");
      }

      const awardData = achievementsInsertSchema.parse({
        badgeId,
        userId,
        awardedBy: req.session.userId,
        status: "achieved",
      });

      const newAward = await awardBadge(awardData);

      return res.status(201).json(newAward);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/awarded-badges`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const awardedBadges = await getAwardedBadges(orgId);

      return res.status(200).json(awardedBadges);
    }),
  );

  app.get(
    `${apiPrefix}/users/:userId/awarded-badges`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const targetUserId = parseInt(req.params.userId);
      const requesterId = requireSessionUserId(req);

      // If the user is requesting their own data, allow it
      if (targetUserId === requesterId) {
        const awardedBadges = await getUserAwardedBadges(targetUserId);
        return res.status(200).json(awardedBadges);
      }

      // If requesting another user's data, check permissions
      const requester = await getRequesterOrThrow(requesterId);
      const targetUser = await getUserById(targetUserId);

      if (!targetUser) {
        throw new NotFoundError("User not found");
      }

      // Admin can view any user's badges
      if (requester.role === "admin") {
        const awardedBadges = await getUserAwardedBadges(targetUserId);
        return res.status(200).json(awardedBadges);
      }

      // Check if they share any organization (can only see each other if in same org)
      const requesterOrgIds = requester.organizations
        ? requester.organizations.map((org: any) => org.id)
        : [];
      const targetUserOrgIds = targetUser.organizations
        ? targetUser.organizations.map((org: any) => org.id)
        : [];

      const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
        targetUserOrgIds.includes(orgId),
      );

      if (sharedOrgs.length === 0) {
        throw new ForbiddenError("No access to this user");
      }

      const awardedBadges = await getUserAwardedBadges(targetUserId);

      return res.status(200).json(awardedBadges);
    }),
  );

  app.get(
    `${apiPrefix}/badges/:badgeId/progress/:userId`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const badgeId = parseInt(req.params.badgeId);
      const targetUserId = parseInt(req.params.userId);
      const requesterId = requireSessionUserId(req);

      const badge = await getBadgeById(badgeId);
      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const requester = await getRequesterOrThrow(requesterId);

      const hasAccessToBadge =
        requester.role === "admin" ||
        (requester.organizations &&
          requester.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccessToBadge) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      if (targetUserId !== requesterId) {
        if (requester.role !== "admin") {
          const targetUser = await getUserById(targetUserId);

          if (!targetUser) {
            throw new NotFoundError("Target user not found");
          }

          const targetUserAccessToBadge =
            targetUser.organizations &&
            targetUser.organizations.some(
              (org: any) => org.id === badge.organizationId,
            );

          if (!targetUserAccessToBadge) {
            throw new ForbiddenError(
              "Target user not in this badge's organization",
            );
          }
        }
      }

      const progress = await getBadgeProgress(badgeId, targetUserId);

      if (!progress) {
        throw new NotFoundError("Progress not found");
      }

      return res.status(200).json(progress);
    }),
  );

  app.get(
    `${apiPrefix}/users/:userId/progress`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const targetUserId = parseInt(req.params.userId);
      const requesterId = requireSessionUserId(req);

      if (targetUserId === requesterId) {
        const progress = await getUserProgressForAllBadges(targetUserId);
        return res.status(200).json(progress);
      }

      const requester = await getRequesterOrThrow(requesterId);
      const targetUser = await getUserById(targetUserId);

      if (!targetUser) {
        throw new NotFoundError("User not found");
      }

      if (requester.role === "admin") {
        const progress = await getUserProgressForAllBadges(targetUserId);
        return res.status(200).json(progress);
      }

      const requesterOrgIds = requester.organizations
        ? requester.organizations.map((org: any) => org.id)
        : [];
      const targetUserOrgIds = targetUser.organizations
        ? targetUser.organizations.map((org: any) => org.id)
        : [];

      const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
        targetUserOrgIds.includes(orgId),
      );

      if (sharedOrgs.length === 0) {
        throw new ForbiddenError("No access to this user");
      }

      const progress = await getUserProgressForAllBadges(targetUserId);

      return res.status(200).json(progress);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/progress`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const progress = await getBadgeProgressForOrganization(orgId);

      return res.status(200).json(progress);
    }),
  );

  app.post(
    `${apiPrefix}/badges/:badgeId/progress/:userId`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const badgeId = parseInt(req.params.badgeId);
      const targetUserId = parseInt(req.params.userId);

      const badge = await getBadgeById(badgeId);
      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const requesterId = requireSessionUserId(req);
      const requester = await getRequesterOrThrow(requesterId);

      const hasAccess =
        requester.role === "admin" ||
        (requester.organizations &&
          requester.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        throw new NotFoundError("Target user not found");
      }

      const targetUserHasAccess =
        targetUser.organizations &&
        targetUser.organizations.some(
          (org: any) => org.id === badge.organizationId,
        );

      if (!targetUserHasAccess) {
        throw new ForbiddenError("Target user not in this badge's organization");
      }

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

      const updatedProgress = await createOrUpdateBadgeProgress(progressData);

      // Check if badge should be auto-awarded based on progress
      if (updatedProgress && Number(updatedProgress.progress) === 100) {
        await autoAwardBadgeIfComplete({
          badgeId,
          userId: targetUserId,
          updatedBy: requireSessionUserId(req),
        });
      }

      return res.status(200).json(updatedProgress);
    }),
  );
}
```

(This route file imports `achievementsInsertSchema` directly from `@shared/schema` instead of the old `awardedBadgesInsertSchema` alias — same schema object, correct name.)

- [ ] **Step 3: Mount the progress feature in `server/app.ts`**

Find:
```ts
import { registerBadgesRoutes } from "./features/badges/routes";
```
Replace with:
```ts
import { registerBadgesRoutes } from "./features/badges/routes";
import { registerProgressRoutes } from "./features/progress/routes";
```
Find:
```ts
  registerBadgesRoutes(app);
  const httpServer = await registerRoutes(app);
```
Replace with:
```ts
  registerBadgesRoutes(app);
  registerProgressRoutes(app);
  const httpServer = await registerRoutes(app);
```
`server/app.ts` now calls all five `registerXRoutes(app)` functions plus the (now nearly empty) `registerRoutes(app)`.

- [ ] **Step 4: Delete the remaining 7 routes from `server/routes.ts`**

Delete the `// Badge Awarding endpoints` section (award, org awarded-badges, user awarded-badges) and the `// Badge Progress tracking endpoints` section (single progress, user-all progress, org progress, POST progress). After this deletion, `registerRoutes` should contain only:

```ts
export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  return httpServer;
}
```

Prune every now-unused import at the top of the file — at this point essentially everything except `type Express`, `createServer`, `type Server` should be unused; run `npm run lint` and delete whatever it flags.

- [ ] **Step 5: Delete the remaining functions from `server/storage.ts`**

Delete `awardBadge`, `getAwardedBadges`, `getUserAwardedBadges`, `getBadgeProgress`, `getUserProgressForAllBadges`, `getBadgeProgressForOrganization`, `createOrUpdateBadgeProgress`, `autoAwardBadgeIfComplete`. Also delete the dead `_getTableColumns` function (confirmed zero callers during Phase 3 research).

Additionally, delete `getUserById` from `server/storage.ts`. Tasks 2-5 deliberately left it there (duplicated alongside `features/users/service.ts`) because `routes.ts`'s not-yet-migrated organizations/badges/progress routes were still calling `storage.getUserById`. After Step 4's deletion above, `routes.ts` no longer calls it — confirm with `grep -n "storage\.getUserById" server/routes.ts` that it returns nothing before deleting.

Prune now-unused imports left over from all of the above. `server/storage.ts` should now be either empty or contain only import statements with nothing left to export — do not delete the file itself yet, that's Task 7.

- [ ] **Step 6: Verify — typecheck, lint, full suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: both exit 0, `52 passed (52)` — including both of `tests/progress.test.ts`'s "documents a known bug" tests, unchanged, still asserting the same no-op behavior. If either of those two tests now fails, the `createOrUpdateBadgeProgress` port introduced an unintended behavior change — stop and diff the ported function against the exact original in this task's Step 1 before proceeding.

- [ ] **Step 7: Commit**

```bash
git add server/features/progress server/app.ts server/routes.ts server/storage.ts
git commit -m "feat: extract progress feature (award+progress), fix auto-award status mismatch"
```

---

### Task 7: Delete legacy files, dead-code sweep, `no-constant-binary-expression` fix

**Files:**

- Delete: `server/routes.ts`
- Delete: `server/storage.ts`
- Modify: `server/app.ts` (replace `registerRoutes(app)` call with direct `createServer(app)`)
- Modify: `shared/schema.ts` (delete 3 dead imports, delete the unused backward-compat block)
- Modify: `client/src/pages/progress.tsx` (fix both `${badge.color}20`-style bugs — the pre-authorized exception)
- Modify: `client/src/pages/badges.tsx`, `client/src/pages/dashboard.tsx`, `client/src/pages/branding.tsx`, `client/src/pages/users.tsx` (delete dead imports/vars)
- Modify: `client/src/components/badge-dialog.tsx` (delete `_CriteriaSection`, dead `_cn` import, dead `_showProgressOptions` state)
- Modify: `client/src/pages/register.tsx` (rename `_confirmPassword` destructure — NOT a deletion, see Step 6)
- Modify: `eslint.config.js` (fully re-enable `no-constant-binary-expression`; scope `no-require-imports` to `tailwind.config.ts` only)

**Interfaces:** None — this task only deletes and cleans up, it doesn't change any exported interface any other task depends on (it's the last task).

- [ ] **Step 1: Delete the legacy server files**

```bash
git rm server/routes.ts server/storage.ts
```

- [ ] **Step 2: Replace `registerRoutes` with direct server creation in `server/app.ts`**

Find:
```ts
import { registerRoutes } from "./routes";
```
Delete that line. Find:
```ts
import { pool } from "@db";
```
Replace with:
```ts
import { createServer } from "http";
import { pool } from "@db";
```
Find:
```ts
  registerProgressRoutes(app);
  const httpServer = await registerRoutes(app);
```
Replace with:
```ts
  registerProgressRoutes(app);
  const httpServer = createServer(app);
```
(`createApp` was already `async` before this change and stays `async` — nothing else in its signature changes; it still returns `{ app, httpServer }`.)

- [ ] **Step 3: Clean up `shared/schema.ts`**

Delete the 3 dead imports — find:
```ts
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  json as _json,
  uuid as _uuid,
  jsonb,
  numeric as _numeric,
} from "drizzle-orm/pg-core";
```
Replace with:
```ts
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
```

Delete the backward-compat block — first confirm it's genuinely unused now that `server/storage.ts` (its only real consumer) is deleted:
```bash
grep -rn "awardedBadges\b\|badgeProgress\b\|InsertAwardedBadge\|InsertBadgeProgress\|AwardedBadge\b\|BadgeProgress\b" server/ client/src/ tests/ shared/schema.ts
```
Expect zero matches outside `shared/schema.ts`'s own declaration lines and the local `AwardedBadge`/`Badge` interfaces client-side (those are unrelated, unimported local types — Phase 3b's problem, not this task's). If the grep turns up an unexpected consumer, stop and leave the block in place rather than guessing — report it. If clean, find and delete:
```ts
// For backward compatibility - these will be deprecated
export const awardedBadges = achievements;
export const awardedBadgesInsertSchema = achievementsInsertSchema;
export type InsertAwardedBadge = InsertAchievement;
export type AwardedBadge = Achievement;

export const badgeProgress = progress;
export const badgeProgressInsertSchema = progressInsertSchema;
export type InsertBadgeProgress = InsertProgress;
export type BadgeProgress = Progress;
```

- [ ] **Step 4: Fix the `${badge.color}20` bug in `client/src/pages/progress.tsx` (both instances)**

Instance 1 — find:
```ts
  style={{
    backgroundColor:
      `${badge.color}20` ||
      "rgba(94, 43, 151, 0.1)",
    color: badge.color || "#5E2B97",
  }}
```
Replace with:
```ts
  style={{
    backgroundColor: badge.color
      ? `${badge.color}20`
      : "rgba(94, 43, 151, 0.1)",
    color: badge.color || "#5E2B97",
  }}
```

Instance 2 — find:
```ts
  style={{
    backgroundColor:
      `${item.badgeColor}20` ||
      "rgba(94, 43, 151, 0.1)",
    color: item.badgeColor || "#5E2B97",
  }}
```
Replace with:
```ts
  style={{
    backgroundColor: item.badgeColor
      ? `${item.badgeColor}20`
      : "rgba(94, 43, 151, 0.1)",
    color: item.badgeColor || "#5E2B97",
  }}
```

(Confirm the exact surrounding JSX/indentation matches before applying — these two blocks are structurally identical but live in different components within the file; re-verify against the actual file content at implementation time, since line numbers shift as earlier edits in this task land.)

- [ ] **Step 5: Delete dead imports/vars in client pages**

In `client/src/pages/badges.tsx`: delete the unused `Search as _Search`, `Input as _Input`, `Select as _Select`, `SelectContent as _SelectContent`, `SelectItem as _SelectItem`, `SelectTrigger as _SelectTrigger`, `SelectValue as _SelectValue`, `Tabs as _Tabs`, `TabsContent as _TabsContent`, `TabsList as _TabsList`, `TabsTrigger as _TabsTrigger` import aliases (delete the whole import line/statement if every named import from that source becomes unused; otherwise just the specific unused names). Delete the dead setter half of `const [selectedCategoryId, _setSelectedCategoryId] = useState(...)` — since the getter `selectedCategoryId` is still used, change this line's setter name is unused so replace with `const [selectedCategoryId] = useState(...)` (drop the setter entirely) only if nothing anywhere in the file calls it — confirm via a file-scoped grep for `_setSelectedCategoryId` before removing; if the codebase later needs it, this becomes a real regression, so double-check first.

In `client/src/pages/dashboard.tsx`: delete unused `Search as _Search`, `Bell as _Bell` import aliases. For `const _isMobile = useIsMobile();` — the hook call itself has no side effects beyond returning a boolean, and nothing reads `_isMobile`; delete the assignment entirely (`useIsMobile();` with no assignment, or delete the call+import together if `useIsMobile` truly isn't needed for anything else in this file — confirm via grep for `useIsMobile` usage elsewhere in the file first, since deleting a hook call that exists purely to trigger a re-render on viewport resize could be intentional; if in doubt, keep the call but drop the unused binding: `useIsMobile();`).

In `client/src/pages/branding.tsx`: delete unused `Button as _Button`, `Card as _Card`, `CardContent as _CardContent`, `CardDescription as _CardDescription`, `CardFooter as _CardFooter`, `CardHeader as _CardHeader`, `CardTitle as _CardTitle` import aliases.

In `client/src/pages/progress.tsx` (separately from Step 4's bug fix): delete `const { toast: _toast } = useToast();` if `toast()` is genuinely never called in this file (confirm via grep first — if `useToast()` is called only for this discarded `toast` binding and nothing else, delete the whole line; if the hook has other uses, keep the call and drop just the destructured toast) and delete the unused `_existingProgress: any` third parameter of `handleUpdateProgress` (a function parameter, not a top-level unused var — if it's positional and can't be dropped without breaking the call signature, prefix stays `_existingProgress`; only remove it if it's safe to drop the parameter entirely, i.e. it's the last parameter and every call site passes exactly as many arguments as remain).

In `client/src/pages/users.tsx`: delete the unused `Input as _Input` import alias.

- [ ] **Step 6: Clean up `client/src/components/badge-dialog.tsx`**

Delete the dead `_CriteriaSection` type:
```ts
type _CriteriaSection = {
  title: string;
  criteria: CriterionItem[];
};
```
Delete the dead `cn as _cn` import (confirm via grep for `_cn` in this file first — if genuinely unused, remove it from the `@/lib/utils` import line). Delete the dead `const [_showProgressOptions, _setShowProgressOptions] = useState(true);` line (confirmed unused — the component always shows progress options unconditionally per its own comment).

**Do not touch `client/src/pages/register.tsx`'s `confirmPassword: _confirmPassword` destructure.** This is intentional omit-via-destructure (stripping `confirmPassword` out of the object before the remaining `userData` is sent to the API), not leftover dead code — deleting the line would silently start sending `confirmPassword` in the register POST body. Leave it exactly as-is; it's flagged here only so nobody "cleans it up" by mistake later in this task.

- [ ] **Step 7: Fully re-enable `no-constant-binary-expression`, scope `no-require-imports`**

In `eslint.config.js`, find:
```js
      // Flags a pre-existing `templateLiteral || fallback` pattern in
      // progress.tsx where the left side is always truthy; the fallback is
      // dead code today, but fixing it changes behavior. Revisit in Phase 3.
      "no-constant-binary-expression": "off",
      // tailwind.config.ts loads plugins via require(); converting it to
      // static imports risks changing how the Tailwind/PostCSS pipeline
      // resolves the config. Revisit in Phase 3.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
```
Replace with:
```js
    },
  },
  {
    // tailwind.config.ts loads plugins via require() — converting it to
    // static imports risks changing how the Tailwind/PostCSS pipeline
    // resolves the config, so this stays scoped to just this one file
    // rather than off repo-wide (Phase 3 cleanup, see the Phase 0 note
    // this closes out).
    files: ["tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
```
(`no-constant-binary-expression` is not mentioned anywhere in the new content — it's fully re-enabled by omission, now that Step 4 fixed its only two violations. Verify the surrounding brace/paren structure matches `tseslint.config(...)`'s call signature — it takes any number of config objects as separate arguments, so adding one more object before the closing `)` is syntactically valid; re-read the full current file before editing to get the exact brace nesting right, since this excerpt only shows the tail.)

- [ ] **Step 8: Verify — typecheck, lint, format, full suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm run check && npm run lint && npm run format:check
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH; npm test
```

Expected: all exit 0, `52 passed (52)`. This is the final verification for the whole plan — if lint fails on a client file this task didn't finish cleaning up, finish it rather than leaving a dangling unused-var error.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: delete server/routes.ts + storage.ts, dead-code sweep, fix progress.tsx color bug, re-enable no-constant-binary-expression"
```

---

## Completion

After Task 7: final whole-branch review (superpowers:requesting-code-review, most capable model — this is the largest, highest-risk plan of the modernization so far), then superpowers:finishing-a-development-branch → PR `phase-3a-server-restructure` → `main` referencing the spec's Phase 3 section.

**Deliberate spec deviations to call out in the PR description:**

1. A fourth typed error class, `UnauthorizedError` (401), added beyond the spec's named three (`NotFoundError`, `ForbiddenError`, `ValidationError`) — the app has real, distinct 401 cases that would otherwise have to be miscoded as 403s, a genuine status-code regression.
2. `autoAwardBadgeIfComplete`'s `status: "completed"` → `"achieved"` fix (Task 6) — pre-authorized via the Phase 3 spec bullet written during Phase 2's final review, not a new judgment call.
3. `progress.tsx`'s `${badge.color}20` truthy-fallback bug, both instances, fixed (Task 7) — this is the exact bug the Phase 0 review flagged `no-constant-binary-expression` as disabled *for*; fixing it is why that rule can be fully re-enabled.
4. `GET /users/:id` and `GET /organizations/:orgId/users` (Task 2) now validate `:id`/`:orgId` via `z.coerce.number()` instead of unchecked `parseInt`, changing a malformed-id response from 404 to 400 — flagged in Task 2 for the task reviewer to explicitly confirm, not silently accepted.
5. `getUsers` and `updateUser` (dead, zero-caller exports) deleted rather than migrated (Task 2); `getBadgeCategoryById` (dead) deleted rather than migrated (Task 4); `_getTableColumns` (dead function) deleted (Task 6).
6. The `awardedBadges`/`achievements` and `badgeProgress`/`progress` naming duality collapsed to one name each (`achievements`, `progress`) throughout the new `progress` feature and `shared/schema.ts`'s backward-compat aliases removed (Tasks 6-7).

**Explicitly NOT done in this phase (tracked for siblings/later):** client type deduplication (3b), vite/drizzle-orm dependency bumps (3c), OpenAPI rewrite + CI contract test (3d), and the badge-progress flat-percentage storage redesign (still no committed timeline — needs its own design decision, tracked in the spec's Phase 3 section).
