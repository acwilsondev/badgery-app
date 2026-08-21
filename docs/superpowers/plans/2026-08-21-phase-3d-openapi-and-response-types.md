# Phase 3d: OpenAPI Rewrite + Response-Body Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `openapi/openapi.yaml` back into agreement with the real 25 registered routes, add a CI test that fails if they ever drift apart again, and close the response-typing gap Phase 3b's final review flagged — route handlers currently build response bodies from untyped/`any`-shaped values with no compile-time link to what the client expects.

**Architecture:** A new `shared/api-types.ts` sibling to `shared/schema.ts` holds hand-shaped types for every JSON response body the server actually sends (as opposed to `shared/schema.ts`'s raw Drizzle table types) — some endpoints send a raw table row, some send a joined/reshaped projection, and a few send genuinely different shapes for "the same concept" depending on caller role or which endpoint answered. This plan types each as observed, warts included, rather than normalizing behavior. `server/features/*/service.ts` functions get explicit return-type annotations against these types (or against `shared/schema.ts` types where a raw row really is what's sent), which is what actually makes the object literals type-check — an annotation-less `async function` returning an object literal checks nothing. `openapi/openapi.yaml` is then rewritten from scratch (the current file describes a JWT/refresh-token auth flow and endpoints like `/user-organization-roles` that were never real — nothing in it reflects the actual session-cookie API) using `components/schemas` entries that mirror the new TS types by name. A new `tests/contract.test.ts` walks the real Express router at runtime and fails if any registered route is missing from the spec, or any spec path has no matching route.

**Tech Stack:** Existing stack only (Express 4, TypeScript, zod, Drizzle, vitest+supertest). One new devDependency: `yaml` (already present transitively at 2.9.0 via hoisting — this plan makes it a direct, explicit dependency since the new contract test parses `openapi.yaml` with it).

**Spec:** `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` (the "API contract" bullet in the Phase 3 section) plus the two follow-ups recorded in memory from Phase 3b's and 3c's final reviews (response-body typing; this phase folds both in).

## Global Constraints

- **No behavior change.** Every response body byte, status code, and error shape must stay exactly what it is today, including the known-bad ones (`GET /organizations/:orgId/progress`'s hardcoded `progress: 0`, the broken `POST /badges/:badgeId/progress/:userId` metrics handling). Document reality; do not fix it here. `tests/progress.test.ts` already asserts the current (broken) behavior — it must keep passing unchanged.
- **Shell gotcha:** before any `npm`/`npx`/`node`/`tsx` invocation, run `unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH` first (separate Bash call — this harness's sandbox rejects multi-clause `&&`/`;` command chains as "too complex to verify").
- **Lockfile gotcha:** never run a bare `npm install`. Task 7 needs to add `yaml` as an explicit devDependency — use `npm install --save-dev yaml@^2.9.0` (scoped to one package), then run `git diff --stat package-lock.json` and confirm the diff is small and additive (promoting `yaml` from transitive to direct, nothing else re-resolved). If the diff is large/unexpected, `git checkout -- package-lock.json` and investigate rather than committing it.
- **GPG gotcha:** commits need signing; pinentry can time out non-interactively. If a commit fails on a pinentry timeout, retry the exact same `git commit` once. Never fall back to `--no-gpg-sign`.
- **Path aliases:** `@shared/*` → `shared/*`, `@db`/`@db/*` → `db/index.ts`/`db/*` (see `tsconfig.json`/`vitest.config.ts`). New files use these, not relative `../../shared/...` paths.
- **`db/seed.ts` and `tests/support/fixtures.ts` are out of scope** — this plan touches server response construction and the OpenAPI doc only, not seed/fixture data shapes.

---

### Task 1: Users module — foundational `UserRecord` type + response types

**Files:**

- Modify: `server/features/users/service.ts`
- Modify: `server/features/users/routes.ts`
- Create: `shared/api-types.ts`
- Test: `tests/users.test.ts` (existing — no changes needed, just re-run)

**Interfaces:**

- Produces: `UserRecord` (exported from `server/features/users/service.ts` — server-internal only, includes `password`, never sent as a response body directly). `OrgUserResponse`, `UserProfileResponse`, `OrganizationRef` (exported from `shared/api-types.ts`) — later tasks import all four.
- Consumes: nothing from other tasks (this is the foundational task — `getUserById`/`getRequesterOrThrow` are imported by every other feature module, so this goes first).

- [ ] **Step 1: Create `shared/api-types.ts` with the users-module response types**

```ts
// shared/api-types.ts
//
// Hand-shaped types for the JSON response bodies server/features/*/routes.ts
// actually sends — as distinct from shared/schema.ts's raw Drizzle table
// types. Several endpoints project, join, or reshape rows before
// responding, and a few of those reshapes are inconsistent with each other
// for "the same concept" (documented per-type below, not fixed — see
// docs/superpowers/plans/2026-08-21-phase-3d-openapi-and-response-types.md).

// A minimal organization reference embedded in user-shaped responses.
export type OrganizationRef = { id: number; name: string };

// GET /organizations/:orgId/users (server/features/users/service.ts
// getUsersByOrganization). Password already stripped before this shape is
// built — never a raw users-table row.
export type OrgUserResponse = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  organizations: OrganizationRef[];
};

// GET /users/:id (server/features/users/routes.ts). A third, distinct
// user projection: has `organizations` (unlike AuthUserResponse, added in
// Task 2) but no `createdAt` (unlike OrgUserResponse above). Three
// overlapping-but-different user shapes exist across the API; kept
// separate rather than unified, since unifying would change what each
// endpoint actually returns.
export type UserProfileResponse = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  organizations: OrganizationRef[];
};

// Reused by badges/organizations/progress `{ message: string }` responses
// (POST /auth/logout, DELETE /badges/:id) — these two are genuinely
// identical, unlike the shapes above.
export type MessageResponse = { message: string };
```

- [ ] **Step 2: Add `UserRecord` and return-type annotations in `server/features/users/service.ts`**

Add near the top of the file (after the existing imports):

```ts
import type { OrgUserResponse } from "@shared/api-types";

// The full row this module's raw-SQL queries build, joined with the
// user's organizations. Server-internal only — includes `password` and is
// never sent as a response body directly; every route that responds with
// user data hand-picks a subset of this into one of shared/api-types.ts's
// response types instead.
export type UserRecord = {
  id: number;
  username: string;
  password: string;
  name: string;
  email: string;
  role: string;
  organizationId: number | null;
  createdAt: Date;
  organizations: Array<{ id: number; name: string }>;
};
```

Change the four function signatures (return types only — no logic changes):

```ts
export async function getUserById(id: number): Promise<UserRecord | null> {
```

```ts
export async function getUserByUsername(
  username: string,
): Promise<UserRecord | null> {
```

```ts
export async function getUsersByOrganization(
  organizationId: number,
): Promise<OrgUserResponse[]> {
```

```ts
export async function getRequesterOrThrow(userId: number): Promise<UserRecord> {
```

- [ ] **Step 3: Retype the two handlers in `server/features/users/routes.ts`**

Add the import:

```ts
import type { UserProfileResponse } from "@shared/api-types";
```

In the `GET /users/:id` handler, replace the two `(org: any)` casts and the final response with:

```ts
const requesterOrgIds = requester.organizations.map((org) => org.id);
const userOrgIds = user.organizations.map((org) => org.id);
```

(This drops the `? ... : []` fallbacks — safe now that `UserRecord.organizations` is always an array, never `undefined`, per the type from Step 2.)

```ts
const response: UserProfileResponse = {
  id: user.id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  organizations: user.organizations,
};
return res.status(200).json(response);
```

- [ ] **Step 4: Typecheck and run the module's tests**

Run: `npm run check`
Expected: no errors.

Run: `npm test -- tests/users.test.ts`
Expected: all pass, unchanged from before.

- [ ] **Step 5: Commit**

```bash
git add shared/api-types.ts server/features/users/service.ts server/features/users/routes.ts
git commit -m "refactor: type users module response bodies and UserRecord"
```

---

### Task 2: Auth module — response types

**Files:**

- Modify: `shared/api-types.ts`
- Modify: `server/features/auth/routes.ts`
- Test: `tests/auth.test.ts` (existing)

**Interfaces:**

- Consumes: `UserRecord` (Task 1, `server/features/users/service.ts`) — `getUserById` already returns it.
- Produces: `AuthUserResponse`, `LogoutResponse` (from `shared/api-types.ts`).

- [ ] **Step 1: Append auth response types to `shared/api-types.ts`**

```ts
// POST /auth/login, POST /auth/register, GET /auth/me all return this
// exact shape (server/features/auth/routes.ts).
export type AuthUserResponse = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  organizationId: number | null;
};

export type LogoutResponse = MessageResponse;
```

- [ ] **Step 2: Retype the four handlers in `server/features/auth/routes.ts`**

Add the import:

```ts
import type { AuthUserResponse, LogoutResponse } from "@shared/api-types";
```

In the login handler, replace the response with:

```ts
const response: AuthUserResponse = {
  id: user.id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId,
};
return res.status(200).json(response);
```

(Drops the `|| null` — `UserRecord.organizationId` from Task 1 is already `number | null`, never `undefined`.)

In the register handler, same shape, status 201:

```ts
const response: AuthUserResponse = {
  id: newUser.id,
  username: newUser.username,
  name: newUser.name,
  email: newUser.email,
  role: newUser.role,
  organizationId: newUser.organizationId,
};
return res.status(201).json(response);
```

In the `/auth/me` handler, same shape, status 200 (the `getUserById(...)` call site is unchanged, only the response construction):

```ts
const response: AuthUserResponse = {
  id: user.id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId,
};
return res.status(200).json(response);
```

In the logout handler:

```ts
app.post(`${apiPrefix}/auth/logout`, (req, res) => {
  req.session.destroy(() => {
    const response: LogoutResponse = { message: "Logged out successfully" };
    res.status(200).json(response);
  });
});
```

- [ ] **Step 3: Check `registerUser`'s return type flows through**

`registerUser` (in `server/features/auth/service.ts`) calls `createUserRecord` (aliased `createUser` from `users/service.ts`), which is untouched by this plan and already returns a real row shape (`{id, username, password, name, email, role, organizationId, createdAt}` per its `RETURNING` clause) — no change needed there. Confirm `npm run check` has no complaints about `newUser.organizationId`'s type in the register handler (it comes through as `number | null` already, from the `INSERT ... RETURNING organization_id as "organizationId"` column, which TS sees as whatever the query result infers — if `tsc` reports it as untyped/`any` here, that's `users/service.ts:createUser`'s pre-existing lack of a return-type annotation, which is out of scope for this task; the `AuthUserResponse` annotation still catches missing/extra fields either way).

- [ ] **Step 4: Typecheck and run the module's tests**

Run: `npm run check`
Expected: no errors.

Run: `npm test -- tests/auth.test.ts`
Expected: all pass, unchanged.

- [ ] **Step 5: Commit**

```bash
git add shared/api-types.ts server/features/auth/routes.ts
git commit -m "refactor: type auth module response bodies"
```

---

### Task 3: Badges module — response types

**Files:**

- Modify: `shared/api-types.ts`
- Modify: `server/features/badges/service.ts`
- Modify: `server/features/badges/routes.ts`
- Test: `tests/badges.test.ts` (existing)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `BadgeResponse`, `BadgeWriteResponse`, `DeleteBadgeResponse` (from `shared/api-types.ts`) — Task 5 (progress) imports `BadgeResponse`.

- [ ] **Step 1: Append badge response types to `shared/api-types.ts`**

```ts
import type { Badge } from "./schema";

// GET /organizations/:orgId/badges (array) and GET /badges/:id (single) —
// server/features/badges/service.ts getBadges/getBadgeById. A raw-SQL
// join, not a Drizzle-inferred row.
export type BadgeResponse = {
  id: number;
  name: string;
  description: string;
  criteria: string | null;
  imageUrl: string | null;
  color: string | null;
  categoryId: number | null;
  organizationId: number;
  createdAt: Date;
  requiresProgress: boolean;
  criteriaSections: unknown;
  criteriaType: string;
  category: { id: number; name: string } | null;
};

// POST/PUT /badges return the raw Drizzle row directly — notably no
// `category` object, unlike BadgeResponse above. A real, pre-existing
// inconsistency between the write and read shapes for "a badge";
// documented as-is, not fixed by this phase.
export type BadgeWriteResponse = Badge;

export type DeleteBadgeResponse = MessageResponse;
```

(Move the `import type { Badge } from "./schema";` to the top of the file with the other imports if the file already has an import block from Task 1 — there is none yet, so this is the first import line; place it above the `OrganizationRef` type.)

- [ ] **Step 2: Annotate `server/features/badges/service.ts`'s return types**

Add the import:

```ts
import type { BadgeResponse } from "@shared/api-types";
```

Change the two raw-SQL function signatures (no logic changes — the existing `.map()`/object-literal bodies already match `BadgeResponse` exactly):

```ts
export async function getBadges(
  organizationId: number,
  categoryId?: number,
): Promise<BadgeResponse[]> {
```

```ts
export async function getBadgeById(id: number): Promise<BadgeResponse | null> {
```

`createBadge`, `updateBadge`, and `deleteBadge` are unchanged — they already return `Badge`/`{success: true}` via Drizzle's own inference, which is correct as-is.

- [ ] **Step 3: Annotate the response constructions in `server/features/badges/routes.ts`**

Add the import:

```ts
import type {
  BadgeWriteResponse,
  DeleteBadgeResponse,
} from "@shared/api-types";
```

In the POST handler:

```ts
const response: BadgeWriteResponse = newBadge;
return res.status(201).json(response);
```

In the PUT handler:

```ts
const response: BadgeWriteResponse = updatedBadge;
return res.status(200).json(response);
```

In the DELETE handler:

```ts
const response: DeleteBadgeResponse = {
  message: "Badge deleted successfully",
};
return res.status(200).json(response);
```

(The two GET handlers already do `return res.status(200).json(badge)`/`json(badges)` where `badge`/`badges` now flow from the annotated service functions in Step 2 — no change needed there.)

- [ ] **Step 4: Typecheck and run the module's tests**

Run: `npm run check`
Expected: no errors.

Run: `npm test -- tests/badges.test.ts`
Expected: all pass, unchanged.

- [ ] **Step 5: Commit**

```bash
git add shared/api-types.ts server/features/badges/service.ts server/features/badges/routes.ts
git commit -m "refactor: type badges module response bodies"
```

---

### Task 4: Organizations module — response types

**Files:**

- Modify: `shared/api-types.ts`
- Modify: `server/features/organizations/service.ts`
- Modify: `server/features/organizations/routes.ts`
- Test: `tests/organizations.test.ts` (existing)

**Interfaces:**

- Consumes: `OrganizationRef` (Task 1).
- Produces: `OrganizationSummary`, `BadgeCategorySummary`, `OrganizationStats` (from `shared/api-types.ts`). `Organization`/`BadgeCategory` (from `shared/schema.ts`) are reused directly, not redefined.

- [ ] **Step 1: Append organization response types to `shared/api-types.ts`**

```ts
// GET /organizations for an admin caller (server/features/organizations
// /service.ts getOrganizations — raw SQL, narrower than the Drizzle
// Organization row: no createdBy/updatedAt/updatedBy/active).
export type OrganizationSummary = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
};

// GET /organizations/:id, POST /organizations, and PUT /organizations/:id
// all return the full Drizzle Organization row (shared/schema.ts) — wider
// than OrganizationSummary above. A non-admin caller to GET /organizations
// instead gets OrganizationRef[] (organizations/routes.ts) — three
// different widths for "an organization" depending on endpoint and caller
// role; documented as-is, not unified.

// GET /organizations/:orgId/categories (server/features/organizations
// /service.ts getBadgeCategories — raw SQL).
export type BadgeCategorySummary = {
  id: number;
  name: string;
  organizationId: number;
  createdAt: Date;
};

// GET /organizations/:orgId/stats.
export type OrganizationStats = {
  totalBadges: number;
  totalUsers: number;
  totalAwarded: number;
  inProgress: number;
};
```

- [ ] **Step 2: Annotate `server/features/organizations/service.ts`'s return types**

Add the import:

```ts
import type {
  OrganizationSummary,
  BadgeCategorySummary,
  OrganizationStats,
} from "@shared/api-types";
```

```ts
export async function getOrganizations(): Promise<OrganizationSummary[]> {
```

```ts
export async function getBadgeCategories(
  organizationId: number,
): Promise<BadgeCategorySummary[]> {
```

```ts
export async function getOrganizationStats(
  organizationId: number,
): Promise<OrganizationStats> {
```

No logic changes — all three functions' existing return values already match these shapes.

- [ ] **Step 3: Annotate the response constructions in `server/features/organizations/routes.ts`**

Add the import:

```ts
import type { OrganizationRef } from "@shared/api-types";
```

In the `GET /organizations` handler's non-admin branch, tighten the fallback now that `UserRecord.organizations` (Task 1) is always an array:

```ts
        } else {
          // Regular users only see organizations they belong to
          const response: OrganizationRef[] = user.organizations;
          return res.status(200).json(response);
        }
```

The admin branch (`getOrganizations()`), `GET /organizations/:id`, `POST /organizations`, and `PUT /organizations/:id` already return values typed by Step 2's annotations or by `Organization`/`InsertOrganization` from `shared/schema.ts` — no further change needed. Same for the categories GET/POST and stats GET handlers; their service calls are now annotated by Step 2.

- [ ] **Step 4: Typecheck and run the module's tests**

Run: `npm run check`
Expected: no errors.

Run: `npm test -- tests/organizations.test.ts`
Expected: all pass, unchanged.

- [ ] **Step 5: Commit**

```bash
git add shared/api-types.ts server/features/organizations/service.ts server/features/organizations/routes.ts
git commit -m "refactor: type organizations module response bodies"
```

---

### Task 5: Progress module — response types + user-profile.tsx follow-up fix

**Files:**

- Modify: `shared/api-types.ts`
- Modify: `server/features/progress/service.ts`
- Modify: `server/features/progress/routes.ts`
- Modify: `client/src/pages/user-profile.tsx`
- Test: `tests/progress.test.ts` (existing)

**Interfaces:**

- Consumes: `BadgeResponse` (Task 3), `Achievement` (from `shared/schema.ts`).
- Produces: `OrgAwardedBadge`, `UserAwardedBadge`, `ProgressMetricEntry`, `BadgeProgressDetail`, `UserBadgeProgressSummary`, `OrgBadgeProgressSummary`, `AwardBadgeResponse`, `UpdateBadgeProgressResponse` (from `shared/api-types.ts`).

- [ ] **Step 1: Append progress response types to `shared/api-types.ts`**

```ts
import type { Achievement } from "./schema";

// POST /badges/:badgeId/award returns the raw Drizzle row directly.
export type AwardBadgeResponse = Achievement;

// GET /organizations/:orgId/awarded-badges (server/features/progress
// /service.ts getAwardedBadges).
export type OrgAwardedBadge = {
  id: number;
  badgeId: number;
  userId: number;
  awardedBy: number | null;
  awardedAt: Date | null;
  status: string;
  badgeName: string;
  badgeDescription: string;
  badgeColor: string | null;
  badgeImageUrl: string | null;
  userName: string;
  awardedByName: string;
};

// GET /users/:userId/awarded-badges — same shape minus userName (the
// caller already knows which user this is).
export type UserAwardedBadge = Omit<OrgAwardedBadge, "userName">;

export type ProgressMetricEntry = {
  value: string;
  name: string;
  description: string;
  type: string;
  targetValue: number;
};

// GET /badges/:badgeId/progress/:userId, and the response of
// POST /badges/:badgeId/progress/:userId when it doesn't no-op (see
// UpdateBadgeProgressResponse below).
export type BadgeProgressDetail = {
  id: number;
  userId: number;
  badgeId: number;
  progress: number;
  progressData: Record<number, ProgressMetricEntry>;
  lastUpdated: Date;
  status: "completed" | "in_progress";
  badge: BadgeResponse;
  metrics: Array<{
    id: number;
    userId: number;
    metricId: number;
    value: string;
    lastUpdatedAt: Date;
    updatedBy: number | null;
    metricName: string;
    metricDescription: string;
    metricType: string;
    targetValue: number;
  }>;
};

// GET /users/:userId/progress — a differently-shaped per-badge summary
// (flat badgeName/badgeColor/etc. fields instead of a nested `badge`
// object, unlike BadgeProgressDetail above); documented as-is.
export type UserBadgeProgressSummary = {
  id: number;
  badgeId: number;
  userId: number;
  progress: number;
  progressData: Record<number, ProgressMetricEntry>;
  lastUpdated: Date;
  updatedBy: number | null;
  status: "completed" | "in_progress";
  badgeName: string;
  badgeDescription: string;
  badgeColor: string | null;
  badgeImageUrl: string | null;
  requiresProgress: true;
  criteriaSections: unknown;
  updatedByName: string;
};

// GET /organizations/:orgId/progress — yet another shape. `progress` is a
// hardcoded placeholder 0 (server/features/progress/service.ts, "will be
// calculated properly in the client") and `status` is always
// "in_progress" — both pre-existing and faithfully documented, not fixed.
export type OrgBadgeProgressSummary = {
  id: number;
  badgeId: number;
  userId: number;
  lastUpdated: Date;
  updatedBy: number | null;
  badgeName: string;
  userName: string;
  updatedByName: string;
  progress: number;
  status: string;
};

// POST /badges/:badgeId/progress/:userId returns whatever
// getBadgeProgress(badgeId, userId) returns after the update: null if the
// badge has no configured badgeMetrics rows (the known-broken case
// documented in CLAUDE.md and tests/progress.test.ts), otherwise
// BadgeProgressDetail.
export type UpdateBadgeProgressResponse = BadgeProgressDetail | null;
```

(If Task 3 already added `import type { Badge } from "./schema";`, add `Achievement` to that same import line instead of a second `import ... from "./schema"` line.)

- [ ] **Step 2: Annotate `server/features/progress/service.ts`'s return types**

Add the import:

```ts
import type {
  OrgAwardedBadge,
  UserAwardedBadge,
  BadgeProgressDetail,
  UserBadgeProgressSummary,
  OrgBadgeProgressSummary,
} from "@shared/api-types";
```

```ts
export async function getAwardedBadges(
  organizationId: number,
): Promise<OrgAwardedBadge[]> {
```

```ts
export async function getUserAwardedBadges(
  userId: number,
): Promise<UserAwardedBadge[]> {
```

```ts
export async function getBadgeProgress(
  badgeId: number,
  userId: number,
): Promise<BadgeProgressDetail | null> {
```

```ts
export async function getUserProgressForAllBadges(
  userId: number,
): Promise<UserBadgeProgressSummary[]> {
```

```ts
export async function getBadgeProgressForOrganization(
  organizationId: number,
): Promise<OrgBadgeProgressSummary[]> {
```

```ts
export async function createOrUpdateBadgeProgress(
  progressData: any,
): Promise<BadgeProgressDetail | null> {
```

No logic changes in any of the six functions — each already returns a value matching its new annotation (verify with `npm run check`; if any field name mismatch surfaces, it means the earlier research read the code slightly wrong — stop and re-read the actual field before renaming anything, since behavior must not change).

- [ ] **Step 3: Annotate the response constructions in `server/features/progress/routes.ts`**

Add the import:

```ts
import type {
  AwardBadgeResponse,
  UpdateBadgeProgressResponse,
} from "@shared/api-types";
```

In the award handler:

```ts
const response: AwardBadgeResponse = newAward;
return res.status(201).json(response);
```

In the final POST `/badges/:badgeId/progress/:userId` handler:

```ts
const response: UpdateBadgeProgressResponse = updatedProgress;
return res.status(200).json(response);
```

The four GET handlers already `return res.status(200).json(...)` values coming straight from Step 2's now-annotated service functions — no change needed there.

- [ ] **Step 4: Fix `client/src/pages/user-profile.tsx`'s drifted local types (Phase 3b follow-up #1)**

This is the exact endpoint (`GET /users/:id`) and the exact endpoint (`GET /users/:userId/awarded-badges`) this task's types now describe precisely — Phase 3b's final review flagged this file's local `ProfileUser` interface as independently drifted (claims a field the endpoint never returns, missing one it does), and its local `AwardedBadge` interface has the same problem (claims nested `badge`/`user`/`awardedByUser` objects the real endpoint never sends — only flat `badgeName`/`badgeColor`/etc. fields). Both drifted fields are confirmed unused by this file's render code (only `.name`/`.email`/`.role` and the flat award fields are read).

Add the import at the top of the file:

```ts
import type { UserProfileResponse, UserAwardedBadge } from "@shared/api-types";
```

Delete the local `interface ProfileUser { ... }` block and change the query's type parameter:

```ts
const { data: profileUser, isLoading: isLoadingUser } =
  useQuery<UserProfileResponse>({
    queryKey: [`${apiPrefix}/users/${id}`],
  });
```

Delete the local `interface AwardedBadge { ... }` block and change its query's type parameter:

```ts
const { data: awardedBadges = [], isLoading: isLoadingBadges } = useQuery<
  UserAwardedBadge[]
>({
  queryKey: [`${apiPrefix}/users/${id}/awarded-badges`],
});
```

Leave the file's separate local `Badge` interface untouched — it's a different endpoint (`GET /organizations/:orgId/badges`) already covered by `client/src/types/badge.ts`'s `BadgeWithExtras`, which Task 8 wires up; don't scope-creep into it here.

- [ ] **Step 5: Typecheck and run the module's tests**

Run: `npm run check`
Expected: no errors.

Run: `npm test -- tests/progress.test.ts`
Expected: all pass, unchanged — including the tests documenting the current broken `POST /badges/:badgeId/progress/:userId` behavior.

- [ ] **Step 6: Commit**

```bash
git add shared/api-types.ts server/features/progress/service.ts server/features/progress/routes.ts client/src/pages/user-profile.tsx
git commit -m "refactor: type progress module response bodies, fix drifted user-profile types"
```

---

### Task 6: Rewrite `openapi/openapi.yaml`

**Files:**

- Modify: `openapi/openapi.yaml` (full replacement)

**Interfaces:**

- Consumes: the field shapes established in Tasks 1–5 (no code dependency — this is a documentation artifact, but its schema names and fields must match those types exactly, since Task 7's contract test only checks paths/methods, not schema bodies — getting the shapes right here is manual-review-only, so precision matters).

- [ ] **Step 1: Replace the entire contents of `openapi/openapi.yaml`**

```yaml
openapi: 3.0.3
info:
  title: Badgery API
  description: >
    Multi-tenant achievement-badge platform API. Session-cookie
    authentication (not JWT) — see the auth paths below.
  version: 2.0.0
servers:
  - url: /api/v1

paths:
  /auth/register:
    post:
      summary: Register a new user
      tags: [auth]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [username, password, name, email]
              properties:
                username:
                  type: string
                  minLength: 3
                password:
                  type: string
                  minLength: 6
                name:
                  type: string
                  minLength: 2
                email:
                  type: string
                  format: email
      responses:
        "201":
          description: User created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthUserResponse"
        "400":
          $ref: "#/components/responses/ValidationError"

  /auth/login:
    post:
      summary: Log in and start a session
      tags: [auth]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [username, password]
              properties:
                username:
                  type: string
                password:
                  type: string
      responses:
        "200":
          description: Logged in
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthUserResponse"
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          description: Invalid credentials
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /auth/me:
    get:
      summary: Get the current session's user
      tags: [auth]
      responses:
        "200":
          description: Current user
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthUserResponse"
        "401":
          description: Not authenticated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "404":
          description: Session points to a deleted user
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /auth/logout:
    post:
      summary: Log out and destroy the session
      tags: [auth]
      responses:
        "200":
          description: Logged out
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MessageResponse"

  /organizations:
    get:
      summary: List organizations
      description: >
        Admins get every organization (OrganizationSummary[]); non-admins
        get only the organizations they belong to (OrganizationRef[]) — two
        different response shapes on one endpoint depending on caller role.
      tags: [organizations]
      responses:
        "200":
          description: Organizations visible to the caller
          content:
            application/json:
              schema:
                oneOf:
                  - type: array
                    items:
                      $ref: "#/components/schemas/OrganizationSummary"
                  - type: array
                    items:
                      $ref: "#/components/schemas/OrganizationRef"
        "401":
          $ref: "#/components/responses/Unauthorized"
    post:
      summary: Create an organization
      tags: [organizations]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/OrganizationInput"
      responses:
        "201":
          description: Organization created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Organization"
        "400":
          $ref: "#/components/responses/ValidationError"
        "403":
          $ref: "#/components/responses/Forbidden"

  /organizations/{id}:
    get:
      summary: Get an organization by id
      tags: [organizations]
      parameters:
        - $ref: "#/components/parameters/id"
      responses:
        "200":
          description: Organization (full row — wider than OrganizationSummary)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Organization"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"
    put:
      summary: Update an organization
      tags: [organizations]
      parameters:
        - $ref: "#/components/parameters/id"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/OrganizationInput"
      responses:
        "200":
          description: Updated organization
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Organization"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /organizations/{orgId}/users:
    get:
      summary: List an organization's members
      tags: [organizations, users]
      parameters:
        - $ref: "#/components/parameters/orgId"
      responses:
        "200":
          description: Members of the organization
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/OrgUserResponse"
        "403":
          $ref: "#/components/responses/Forbidden"

  /organizations/{orgId}/categories:
    get:
      summary: List an organization's badge categories
      tags: [organizations, badges]
      parameters:
        - $ref: "#/components/parameters/orgId"
      responses:
        "200":
          description: Badge categories
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/BadgeCategorySummary"
        "403":
          $ref: "#/components/responses/Forbidden"
    post:
      summary: Create a badge category
      tags: [organizations, badges]
      parameters:
        - $ref: "#/components/parameters/orgId"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/BadgeCategoryInput"
      responses:
        "201":
          description: Category created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/BadgeCategory"
        "400":
          $ref: "#/components/responses/ValidationError"
        "403":
          $ref: "#/components/responses/Forbidden"

  /organizations/{orgId}/stats:
    get:
      summary: Get organization-level counts
      tags: [organizations]
      parameters:
        - $ref: "#/components/parameters/orgId"
      responses:
        "200":
          description: >
            Aggregate counts. On an internal query error this endpoint
            returns all-zeros rather than a 5xx (pre-existing, not fixed by
            this phase).
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/OrganizationStats"
        "403":
          $ref: "#/components/responses/Forbidden"

  /organizations/{orgId}/badges:
    get:
      summary: List badges in an organization
      tags: [badges]
      parameters:
        - $ref: "#/components/parameters/orgId"
        - name: categoryId
          in: query
          required: false
          schema:
            type: integer
      responses:
        "200":
          description: Badges
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/BadgeResponse"
        "403":
          $ref: "#/components/responses/Forbidden"
    post:
      summary: Create a badge
      tags: [badges]
      parameters:
        - $ref: "#/components/parameters/orgId"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/BadgeInput"
      responses:
        "201":
          description: >
            Badge created. Returns the raw row (BadgeWriteResponse) — no
            `category` object, unlike the GET endpoints' BadgeResponse.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Badge"
        "400":
          $ref: "#/components/responses/ValidationError"
        "403":
          $ref: "#/components/responses/Forbidden"

  /badges/{id}:
    get:
      summary: Get a badge by id
      tags: [badges]
      parameters:
        - $ref: "#/components/parameters/id"
      responses:
        "200":
          description: Badge
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/BadgeResponse"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"
    put:
      summary: Update a badge
      tags: [badges]
      parameters:
        - $ref: "#/components/parameters/id"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/BadgeUpdateInput"
      responses:
        "200":
          description: Updated badge (raw row, same caveat as POST above)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Badge"
        "400":
          $ref: "#/components/responses/ValidationError"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"
    delete:
      summary: Delete a badge
      tags: [badges]
      parameters:
        - $ref: "#/components/parameters/id"
      responses:
        "200":
          description: Deleted
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MessageResponse"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /badges/{badgeId}/award:
    post:
      summary: Award a badge to a user
      tags: [progress]
      parameters:
        - $ref: "#/components/parameters/badgeId"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [userId]
              properties:
                userId:
                  type: integer
      responses:
        "201":
          description: Achievement created (raw row)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Achievement"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /badges/{badgeId}/progress/{userId}:
    get:
      summary: Get one user's progress on one badge
      tags: [progress]
      parameters:
        - $ref: "#/components/parameters/badgeId"
        - $ref: "#/components/parameters/userId"
      responses:
        "200":
          description: >
            Progress detail. 404s if the badge has no configured
            badgeMetrics rows — the normal case for badges created through
            the UI (see CLAUDE.md's "Badge progress persistence is broken"
            note).
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/BadgeProgressDetail"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"
    post:
      summary: Update a user's progress on a badge
      description: >
        Known broken: this route's request body sends a flat
        `{ progress: 0-100 }` percentage, but persistence is built around a
        per-metric model — for badges without pre-configured badgeMetrics
        rows this silently no-ops and returns null. Documented as observed,
        not fixed (see CLAUDE.md and tests/progress.test.ts).
      tags: [progress]
      parameters:
        - $ref: "#/components/parameters/badgeId"
        - $ref: "#/components/parameters/userId"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                progress:
                  type: number
                  minimum: 0
                  maximum: 100
                progressData: {}
                notes:
                  type: string
                status:
                  type: string
      responses:
        "200":
          description: Updated progress, or null if the update silently no-op'd
          content:
            application/json:
              schema:
                nullable: true
                allOf:
                  - $ref: "#/components/schemas/BadgeProgressDetail"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /organizations/{orgId}/awarded-badges:
    get:
      summary: List badges awarded within an organization
      tags: [progress]
      parameters:
        - $ref: "#/components/parameters/orgId"
      responses:
        "200":
          description: Awarded badges, with awarding-user names
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/OrgAwardedBadge"
        "403":
          $ref: "#/components/responses/Forbidden"

  /users/{userId}/awarded-badges:
    get:
      summary: List badges awarded to a user
      tags: [progress]
      parameters:
        - $ref: "#/components/parameters/userId"
      responses:
        "200":
          description: >
            Awarded badges (same shape as the org-scoped endpoint, minus
            userName)
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/UserAwardedBadge"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /users/{userId}/progress:
    get:
      summary: List a user's progress across all badges
      tags: [progress]
      parameters:
        - $ref: "#/components/parameters/userId"
      responses:
        "200":
          description: >
            Per-badge progress summaries — a different shape than
            /badges/{badgeId}/progress/{userId} (flat badge fields instead
            of a nested `badge` object).
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/UserBadgeProgressSummary"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /organizations/{orgId}/progress:
    get:
      summary: List all users' progress within an organization
      tags: [progress]
      parameters:
        - $ref: "#/components/parameters/orgId"
      responses:
        "200":
          description: >
            Per-user-per-badge summaries. `progress` is currently a
            hardcoded 0 and `status` is always "in_progress" — pre-existing,
            documented, not fixed by this phase.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/OrgBadgeProgressSummary"
        "403":
          $ref: "#/components/responses/Forbidden"

  /users/{id}:
    get:
      summary: Get a user's profile
      tags: [users]
      parameters:
        - $ref: "#/components/parameters/id"
      responses:
        "200":
          description: >
            User profile — a third user-shape, distinct from
            AuthUserResponse and OrgUserResponse (see UserProfileResponse).
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserProfileResponse"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

components:
  parameters:
    id:
      name: id
      in: path
      required: true
      schema:
        type: integer
    orgId:
      name: orgId
      in: path
      required: true
      schema:
        type: integer
    badgeId:
      name: badgeId
      in: path
      required: true
      schema:
        type: integer
    userId:
      name: userId
      in: path
      required: true
      schema:
        type: integer

  responses:
    Unauthorized:
      description: Not authenticated
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
    Forbidden:
      description: Authenticated but not permitted
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
    ValidationError:
      description: Request body failed validation
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ValidationErrorResponse"

  schemas:
    ErrorResponse:
      type: object
      required: [message, code]
      properties:
        message:
          type: string
        code:
          type: string

    ValidationErrorResponse:
      type: object
      required: [message, code, errors]
      properties:
        message:
          type: string
        code:
          type: string
        errors:
          type: array
          items: {}

    MessageResponse:
      type: object
      required: [message]
      properties:
        message:
          type: string

    AuthUserResponse:
      type: object
      required: [id, username, name, email, role, organizationId]
      properties:
        id:
          type: integer
        username:
          type: string
        name:
          type: string
        email:
          type: string
        role:
          type: string
        organizationId:
          type: integer
          nullable: true

    OrganizationRef:
      type: object
      required: [id, name]
      properties:
        id:
          type: integer
        name:
          type: string

    OrganizationSummary:
      type: object
      required: [id, name, description, createdAt]
      properties:
        id:
          type: integer
        name:
          type: string
        description:
          type: string
          nullable: true
        createdAt:
          type: string
          format: date-time

    Organization:
      description: Full Drizzle row (shared/schema.ts organizations table)
      type: object
      required:
        [
          id,
          name,
          description,
          createdAt,
          createdBy,
          updatedAt,
          updatedBy,
          active,
        ]
      properties:
        id:
          type: integer
        name:
          type: string
        description:
          type: string
          nullable: true
        createdAt:
          type: string
          format: date-time
        createdBy:
          type: integer
          nullable: true
        updatedAt:
          type: string
          format: date-time
          nullable: true
        updatedBy:
          type: integer
          nullable: true
        active:
          type: boolean

    OrganizationInput:
      type: object
      required: [name]
      properties:
        name:
          type: string
          minLength: 3
        description:
          type: string
          minLength: 5

    BadgeCategorySummary:
      type: object
      required: [id, name, organizationId, createdAt]
      properties:
        id:
          type: integer
        name:
          type: string
        organizationId:
          type: integer
        createdAt:
          type: string
          format: date-time

    BadgeCategory:
      description: Full Drizzle row (shared/schema.ts badgeCategories table)
      type: object
      required:
        [
          id,
          name,
          organizationId,
          createdAt,
          createdBy,
          updatedAt,
          updatedBy,
          active,
        ]
      properties:
        id:
          type: integer
        name:
          type: string
        organizationId:
          type: integer
        createdAt:
          type: string
          format: date-time
        createdBy:
          type: integer
          nullable: true
        updatedAt:
          type: string
          format: date-time
          nullable: true
        updatedBy:
          type: integer
          nullable: true
        active:
          type: boolean

    BadgeCategoryInput:
      type: object
      required: [name]
      properties:
        name:
          type: string
          minLength: 2

    OrganizationStats:
      type: object
      required: [totalBadges, totalUsers, totalAwarded, inProgress]
      properties:
        totalBadges:
          type: integer
        totalUsers:
          type: integer
        totalAwarded:
          type: integer
        inProgress:
          type: integer

    OrgUserResponse:
      type: object
      required: [id, username, name, email, role, createdAt, organizations]
      properties:
        id:
          type: integer
        username:
          type: string
        name:
          type: string
        email:
          type: string
        role:
          type: string
        createdAt:
          type: string
          format: date-time
        organizations:
          type: array
          items:
            $ref: "#/components/schemas/OrganizationRef"

    UserProfileResponse:
      type: object
      required: [id, username, name, email, role, organizations]
      properties:
        id:
          type: integer
        username:
          type: string
        name:
          type: string
        email:
          type: string
        role:
          type: string
        organizations:
          type: array
          items:
            $ref: "#/components/schemas/OrganizationRef"

    BadgeResponse:
      type: object
      required:
        - id
        - name
        - description
        - criteria
        - imageUrl
        - color
        - categoryId
        - organizationId
        - createdAt
        - requiresProgress
        - criteriaSections
        - criteriaType
        - category
      properties:
        id:
          type: integer
        name:
          type: string
        description:
          type: string
        criteria:
          type: string
          nullable: true
        imageUrl:
          type: string
          nullable: true
        color:
          type: string
          nullable: true
        categoryId:
          type: integer
          nullable: true
        organizationId:
          type: integer
        createdAt:
          type: string
          format: date-time
        requiresProgress:
          type: boolean
        criteriaSections: {}
        criteriaType:
          type: string
        category:
          nullable: true
          allOf:
            - $ref: "#/components/schemas/OrganizationRef"

    Badge:
      description: Full Drizzle row (shared/schema.ts badges table) — sent by POST/PUT, unlike BadgeResponse above
      type: object
      required:
        - id
        - name
        - description
        - criteria
        - imageUrl
        - color
        - categoryId
        - organizationId
        - requiresProgress
        - criteriaSections
        - criteriaType
        - createdAt
        - createdBy
        - updatedAt
        - updatedBy
        - active
      properties:
        id:
          type: integer
        name:
          type: string
        description:
          type: string
        criteria:
          type: string
          nullable: true
        imageUrl:
          type: string
          nullable: true
        color:
          type: string
          nullable: true
        categoryId:
          type: integer
          nullable: true
        organizationId:
          type: integer
        requiresProgress:
          type: boolean
        criteriaSections: {}
        criteriaType:
          type: string
        createdAt:
          type: string
          format: date-time
        createdBy:
          type: integer
          nullable: true
        updatedAt:
          type: string
          format: date-time
          nullable: true
        updatedBy:
          type: integer
          nullable: true
        active:
          type: boolean

    BadgeInput:
      type: object
      required: [name, description]
      properties:
        name:
          type: string
          minLength: 2
        description:
          type: string
          minLength: 5
        criteria:
          type: string
        imageUrl:
          type: string
        color:
          type: string
        categoryId:
          type: integer
        requiresProgress:
          type: boolean
        criteriaSections: {}
        criteriaType:
          type: string
          enum: [binary, numeric]

    BadgeUpdateInput:
      description: Same as BadgeInput but all fields optional, organizationId/createdBy never client-assignable
      type: object
      properties:
        name:
          type: string
          minLength: 2
        description:
          type: string
          minLength: 5
        criteria:
          type: string
        imageUrl:
          type: string
        color:
          type: string
        categoryId:
          type: integer
        requiresProgress:
          type: boolean
        criteriaSections: {}
        criteriaType:
          type: string
          enum: [binary, numeric]

    Achievement:
      description: Full Drizzle row (shared/schema.ts achievements table)
      type: object
      required:
        [
          id,
          userId,
          badgeId,
          status,
          awardedAt,
          awardedBy,
          createdAt,
          createdBy,
          updatedAt,
          updatedBy,
          active,
        ]
      properties:
        id:
          type: integer
        userId:
          type: integer
        badgeId:
          type: integer
        status:
          type: string
          enum: [in_progress, achieved]
        awardedAt:
          type: string
          format: date-time
          nullable: true
        awardedBy:
          type: integer
          nullable: true
        createdAt:
          type: string
          format: date-time
        createdBy:
          type: integer
          nullable: true
        updatedAt:
          type: string
          format: date-time
          nullable: true
        updatedBy:
          type: integer
          nullable: true
        active:
          type: boolean

    OrgAwardedBadge:
      type: object
      required:
        [
          id,
          badgeId,
          userId,
          awardedBy,
          awardedAt,
          status,
          badgeName,
          badgeDescription,
          badgeColor,
          badgeImageUrl,
          userName,
          awardedByName,
        ]
      properties:
        id:
          type: integer
        badgeId:
          type: integer
        userId:
          type: integer
        awardedBy:
          type: integer
          nullable: true
        awardedAt:
          type: string
          format: date-time
          nullable: true
        status:
          type: string
        badgeName:
          type: string
        badgeDescription:
          type: string
        badgeColor:
          type: string
          nullable: true
        badgeImageUrl:
          type: string
          nullable: true
        userName:
          type: string
        awardedByName:
          type: string

    UserAwardedBadge:
      description: Same as OrgAwardedBadge minus userName
      type: object
      required:
        [
          id,
          badgeId,
          userId,
          awardedBy,
          awardedAt,
          status,
          badgeName,
          badgeDescription,
          badgeColor,
          badgeImageUrl,
          awardedByName,
        ]
      properties:
        id:
          type: integer
        badgeId:
          type: integer
        userId:
          type: integer
        awardedBy:
          type: integer
          nullable: true
        awardedAt:
          type: string
          format: date-time
          nullable: true
        status:
          type: string
        badgeName:
          type: string
        badgeDescription:
          type: string
        badgeColor:
          type: string
          nullable: true
        badgeImageUrl:
          type: string
          nullable: true
        awardedByName:
          type: string

    ProgressMetricEntry:
      type: object
      required: [value, name, description, type, targetValue]
      properties:
        value:
          type: string
        name:
          type: string
        description:
          type: string
        type:
          type: string
        targetValue:
          type: integer

    BadgeProgressDetail:
      type: object
      required:
        [
          id,
          userId,
          badgeId,
          progress,
          progressData,
          lastUpdated,
          status,
          badge,
          metrics,
        ]
      properties:
        id:
          type: integer
        userId:
          type: integer
        badgeId:
          type: integer
        progress:
          type: integer
        progressData:
          type: object
          additionalProperties:
            $ref: "#/components/schemas/ProgressMetricEntry"
        lastUpdated:
          type: string
          format: date-time
        status:
          type: string
          enum: [completed, in_progress]
        badge:
          $ref: "#/components/schemas/BadgeResponse"
        metrics:
          type: array
          items:
            type: object
            required:
              [
                id,
                userId,
                metricId,
                value,
                lastUpdatedAt,
                updatedBy,
                metricName,
                metricDescription,
                metricType,
                targetValue,
              ]
            properties:
              id:
                type: integer
              userId:
                type: integer
              metricId:
                type: integer
              value:
                type: string
              lastUpdatedAt:
                type: string
                format: date-time
              updatedBy:
                type: integer
                nullable: true
              metricName:
                type: string
              metricDescription:
                type: string
              metricType:
                type: string
              targetValue:
                type: integer

    UserBadgeProgressSummary:
      type: object
      required:
        [
          id,
          badgeId,
          userId,
          progress,
          progressData,
          lastUpdated,
          updatedBy,
          status,
          badgeName,
          badgeDescription,
          badgeColor,
          badgeImageUrl,
          requiresProgress,
          criteriaSections,
          updatedByName,
        ]
      properties:
        id:
          type: integer
        badgeId:
          type: integer
        userId:
          type: integer
        progress:
          type: integer
        progressData:
          type: object
          additionalProperties:
            $ref: "#/components/schemas/ProgressMetricEntry"
        lastUpdated:
          type: string
          format: date-time
        updatedBy:
          type: integer
          nullable: true
        status:
          type: string
          enum: [completed, in_progress]
        badgeName:
          type: string
        badgeDescription:
          type: string
        badgeColor:
          type: string
          nullable: true
        badgeImageUrl:
          type: string
          nullable: true
        requiresProgress:
          type: boolean
          enum: [true]
        criteriaSections: {}
        updatedByName:
          type: string

    OrgBadgeProgressSummary:
      type: object
      required:
        [
          id,
          badgeId,
          userId,
          lastUpdated,
          updatedBy,
          badgeName,
          userName,
          updatedByName,
          progress,
          status,
        ]
      properties:
        id:
          type: integer
        badgeId:
          type: integer
        userId:
          type: integer
        lastUpdated:
          type: string
          format: date-time
        updatedBy:
          type: integer
          nullable: true
        badgeName:
          type: string
        userName:
          type: string
        updatedByName:
          type: string
        progress:
          type: integer
          description: Currently always 0 — pre-existing placeholder, not fixed by this phase
        status:
          type: string
          description: Currently always "in_progress" — pre-existing, not fixed by this phase
```

- [ ] **Step 2: Manually verify path/method coverage against the real route inventory**

Cross-check every path+method above against this exact list of the 25 registered routes (confirmed via `server/app.ts` and each `features/*/routes.ts` file):

```
POST   /auth/register
POST   /auth/login
GET    /auth/me
POST   /auth/logout
GET    /organizations
POST   /organizations
GET    /organizations/{id}
PUT    /organizations/{id}
GET    /organizations/{orgId}/users
GET    /organizations/{orgId}/categories
POST   /organizations/{orgId}/categories
GET    /organizations/{orgId}/stats
GET    /organizations/{orgId}/badges
POST   /organizations/{orgId}/badges
GET    /badges/{id}
PUT    /badges/{id}
DELETE /badges/{id}
POST   /badges/{badgeId}/award
GET    /badges/{badgeId}/progress/{userId}
POST   /badges/{badgeId}/progress/{userId}
GET    /organizations/{orgId}/awarded-badges
GET    /users/{userId}/awarded-badges
GET    /users/{userId}/progress
GET    /organizations/{orgId}/progress
GET    /users/{id}
```

That's 25. Count the `paths:` entries and their HTTP methods in the file above and confirm it's exactly these 25, no more, no fewer (Task 7's contract test automates this going forward, but do the count by hand now since Task 7 hasn't been written yet).

- [ ] **Step 3: Commit**

```bash
git add openapi/openapi.yaml
git commit -m "docs: rewrite openapi.yaml to match the real 25 routes"
```

---

### Task 7: CI contract test

**Files:**

- Create: `tests/support/introspect-routes.ts`
- Create: `tests/contract.test.ts`
- Modify: `package.json` (add `yaml` devDependency)
- Modify: `package-lock.json` (via `npm install`, not hand-edited)

**Interfaces:**

- Consumes: `openapi/openapi.yaml` (Task 6), `createApp()` from `server/app.ts` (unchanged).
- Produces: `enumerateRoutes(app: Express): string[]` from `tests/support/introspect-routes.ts` — method+path strings like `"GET /badges/:id"`.

- [ ] **Step 1: Add `yaml` as an explicit devDependency**

Run: `unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH`

Run: `npm install --save-dev yaml@^2.9.0`

Run: `git diff --stat package-lock.json`
Expected: a small, additive diff (promotes the existing transitive `yaml@2.9.0` entry to also being a direct dependency). If the diff touches many unrelated packages, run `git checkout -- package-lock.json package.json` and stop — investigate before proceeding (per this plan's lockfile gotcha).

- [ ] **Step 2: Write `tests/support/introspect-routes.ts`**

```ts
import type { Express } from "express";

/**
 * Walks Express's internal router stack and returns every registered
 * route as "METHOD /path" (Express :param syntax, e.g. "GET /badges/:id").
 * `_router` isn't part of Express's public types, hence the local cast —
 * this is the same approach standalone route-listing packages use; no
 * such package is installed in this repo, and adding one for a single
 * enumeration is unwarranted here.
 */
export function enumerateRoutes(app: Express): string[] {
  const routes: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (app as any)._router?.stack ?? [];

  for (const layer of stack) {
    if (!layer.route) continue;
    const routePath: string = layer.route.path;
    const methods: Record<string, boolean> = layer.route.methods;
    for (const method of Object.keys(methods)) {
      if (methods[method]) {
        routes.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }

  return routes;
}
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/contract.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Express } from "express";
import { createApp } from "../server/app";
import { enumerateRoutes } from "./support/introspect-routes";

describe("openapi contract", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("every registered route is documented, and every documented path has a route", () => {
    const registered = new Set(
      enumerateRoutes(app).map((route) =>
        // Express "/badges/:id" -> OpenAPI "/badges/{id}", and strip the
        // /api/v1 prefix baked into every route registration (the spec's
        // `servers: [{url: /api/v1}]` already accounts for it).
        route
          .replace(/^([A-Z]+) \/api\/v1/, "$1 ")
          .replace(/:([a-zA-Z0-9_]+)/g, "{$1}"),
      ),
    );

    const spec = parse(readFileSync("openapi/openapi.yaml", "utf-8")) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const documented = new Set<string>();
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        documented.add(`${method.toUpperCase()} ${path}`);
      }
    }

    const undocumented = [...registered].filter((r) => !documented.has(r));
    const nonexistent = [...documented].filter((d) => !registered.has(d));

    expect(
      undocumented,
      "routes registered but missing from openapi.yaml",
    ).toEqual([]);
    expect(
      nonexistent,
      "openapi.yaml paths with no matching registered route",
    ).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it and confirm it passes against Task 6's rewritten spec**

Run: `npm test -- tests/contract.test.ts`
Expected: PASS (both `undocumented` and `nonexistent` are empty arrays), since Task 6's spec was hand-verified against the same 25-route inventory.

- [ ] **Step 5: Confirm the test actually catches drift**

Temporarily comment out the `/badges/{id}` GET operation in `openapi/openapi.yaml` (just the `get:` block under that path, or the whole path entry), then:

Run: `npm test -- tests/contract.test.ts`
Expected: FAIL, with `undocumented` containing `"GET /badges/{id}"`.

Revert the temporary edit:

Run: `git checkout -- openapi/openapi.yaml`

Run: `npm test -- tests/contract.test.ts`
Expected: PASS again.

- [ ] **Step 6: Run the full suite once**

Run: `npm test`
Expected: all test files pass, including the new `contract.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tests/support/introspect-routes.ts tests/contract.test.ts
git commit -m "test: add CI contract test enforcing openapi.yaml matches registered routes"
```

---

### Task 8: Client wiring — eliminate the last hand-duplicated response types

**Files:**

- Modify: `client/src/types/session.ts`
- Modify: `client/src/types/badge.ts`
- Modify: `client/src/types/user.ts`

**Interfaces:**

- Consumes: `AuthUserResponse` (Task 2), `BadgeResponse` (Task 3), `OrgUserResponse` (Task 1) — all from `shared/api-types.ts`.

This closes Phase 3b's follow-up #2 exactly: these three client files hand-duplicate server response shapes with no compile-time link back to the route handlers Tasks 1–5 just typed. Now that `shared/api-types.ts` exists, each becomes a thin re-export/extension instead of an independent hand-written copy. No behavior change: every field every current consumer reads keeps the same runtime value; only the type declarations' _source_ changes.

- [ ] **Step 1: `client/src/types/session.ts`**

Replace the whole file:

```ts
// The shape returned by POST /api/v1/auth/login, POST /api/v1/auth
// /register, and GET /api/v1/auth/me. Re-exported from shared/api-types.ts
// (server/features/auth/routes.ts) rather than hand-duplicated, so a
// future server-side field change fails this file's imports at compile
// time instead of silently drifting.
export type { AuthUserResponse as AuthUser } from "@shared/api-types";
```

- [ ] **Step 2: `client/src/types/user.ts`**

Replace the whole file:

```ts
// The shape returned by GET /api/v1/organizations/:orgId/users
// (server/features/users/service.ts getUsersByOrganization). Re-exported
// from shared/api-types.ts rather than hand-duplicated.
export type { OrgUserResponse as OrgUser } from "@shared/api-types";
```

- [ ] **Step 3: `client/src/types/badge.ts`**

Replace the whole file:

```ts
import type { BadgeResponse } from "@shared/api-types";

// The badges list/detail views enrich BadgeResponse with `awarded`, which
// is populated only on the per-user badge card view and is never part of
// the server's response — it's computed client-side.
export type BadgeWithExtras = BadgeResponse & {
  awarded?: number;
};
```

(This drops the old file's separately-declared `criteriaSections`/`category` fields, since `BadgeResponse` from Task 3 already includes both with the same shapes.)

- [ ] **Step 4: Typecheck and run the full suite**

Run: `npm run check`
Expected: no errors. If any consumer of `AuthUser`/`OrgUser`/`BadgeWithExtras` fails, read the error carefully — it means that consumer relied on a field name/shape the old hand-written type had but the real server response doesn't (a genuine latent bug this task just surfaced); do not paper over it with a cast — stop and report it rather than silently widening the type back out.

Run: `npm test`
Expected: all pass, unchanged.

- [ ] **Step 5: Commit**

```bash
git add client/src/types/session.ts client/src/types/user.ts client/src/types/badge.ts
git commit -m "refactor: derive client response types from shared/api-types.ts"
```

---

### Task 9: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH`
Run: `npm run check`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Format check**

Run: `npm run format:check`
Expected: clean. If `openapi/openapi.yaml` or `shared/api-types.ts` fail formatting, run `npx prettier --write <file>` and re-check.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: all test files pass, including `tests/contract.test.ts`.

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Grep-verify no leftover hand-duplicated response shapes**

Run: `grep -rn "organizationId?: number | null" client/src/ --include="*.tsx" --include="*.ts"`
Expected: no matches outside generated/build output (confirms Task 8 actually replaced every `AuthUser`-shaped local declaration, not just the three files this plan named).

Run: `grep -rn "interface ProfileUser\|interface AwardedBadge" client/src/`
Expected: no matches (confirms Task 5 Step 4's deletions took).

- [ ] **Step 7: Smoke test against a real server**

Start the dev server against real Postgres (`podman start badgery-app_postgres_1` if not already running, then `npm run dev` in the background), then curl:

- `POST /api/v1/auth/login` with seeded credentials, confirm 200 and the `AuthUserResponse` shape.
- `GET /api/v1/organizations/:id/users`, confirm 200 and the `OrgUserResponse[]` shape.
- `GET /api/v1/organizations/:id/badges`, confirm 200 and the `BadgeResponse[]` shape (with `category` present).

If no browser-automation tool is available in this session, note explicitly in the final report that this was an API-level smoke test, not a full UI/console-error browser check — do not claim full UI verification without actually having run it.
