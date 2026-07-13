# Phase 0: Baseline Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo honest — delete dead files, drive `tsc` from 38 errors to 0, add lint/format tooling, README/.env.example/LICENSE, and take the safe dependency bumps — without changing runtime behavior.

**Architecture:** No structural changes. Type-level fixes flow one way: storage function signatures adopt the drizzle-zod `Insert*` types already exported by `shared/schema.ts`; routes get a `requireSessionUserId()` narrowing helper; client dialogs widen their prop types to accept what pages actually pass. Phase 3 (restructure) will replace much of this code — these fixes just make the current code verifiable.

**Tech Stack:** TypeScript 5.6, Express 4, Drizzle ORM, React 18, Vite 5, ESLint 9 (flat config), Prettier.

**Spec:** `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` (Phase 0 section).

## Global Constraints

- No runtime behavior changes. Type-level and tooling changes only. (Sole exception: `requireSessionUserId` throws if a session has no userId — unreachable behind `isAuthenticated`, which already guards every affected route.)
- No test infrastructure exists yet (that's Phase 2). The verify cycle for each task is the `tsc` error count: each task states the expected count before and after. Run `npm run check 2>&1 | grep -c "error TS"` to count.
- All work on branch `phase-0-hygiene`, one commit per task.
- Do not touch `server/routes.ts` logic, `db/migrations/`, or `shared/schema.ts` column definitions.
- Node 20+. If `npm`/`npx` fail with `_nvm_lazy` not found, run `unset -f node npm npx; export PATH=/usr/local/bin:$PATH` first (broken lazy-nvm shell functions on this machine).

---

### Task 1: Branch and delete dead files

**Files:**
- Delete: `server/routes.updated.ts`, `server/routes.ts.bak`, `badge-dialog-backup.tsx`, `badge-dialog-new.tsx`, `db/align-schema-with-doc.sql`, `db/run-align-schema.ts`, `db/run-migration.ts`, `attached_assets/` (8 Replit screenshots)

**Interfaces:**
- Consumes: nothing
- Produces: branch `phase-0-hygiene`; tsc error count drops 38 → 31 (the 7 errors in `server/routes.updated.ts` disappear)

- [ ] **Step 1: Create the branch**

```bash
git checkout -b phase-0-hygiene
```

- [ ] **Step 2: Verify nothing imports the files being deleted**

```bash
grep -rn "routes.updated\|routes.ts.bak\|badge-dialog-backup\|badge-dialog-new\|run-align-schema\|run-migration\|align-schema-with-doc\|attached_assets" \
  server client shared db package.json vite.config.ts --include="*.ts" --include="*.tsx" --include="*.json" | grep -v Binary
```

Expected: no output (nothing references them).

- [ ] **Step 3: Delete**

```bash
git rm server/routes.updated.ts server/routes.ts.bak badge-dialog-backup.tsx badge-dialog-new.tsx \
  db/align-schema-with-doc.sql db/run-align-schema.ts db/run-migration.ts
git rm -r attached_assets
```

- [ ] **Step 4: Verify error count dropped**

Run: `npm run check 2>&1 | grep -c "error TS"`
Expected: `31`

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: delete dead files (backup routes, dialog copies, one-off db scripts, screenshots)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Storage create-functions accept Insert types

The five `create*` functions in `server/storage.ts` declare params as `Omit<Entity, "id" | "createdAt">` — every remaining column required. Routes pass drizzle-zod-parsed insert data (optional columns optional), causing 5 errors in `server/routes.ts` (lines 75, 178, 290, 413, 682). `shared/schema.ts` already exports the correct `Insert*` types.

**Files:**
- Modify: `server/storage.ts:3-29` (import block), `:55-56`, `:247-248`, `:381-382`, `:481`, `:501-502`

**Interfaces:**
- Consumes: `InsertOrganization`, `InsertUser`, `InsertBadgeCategory`, `InsertBadge`, `InsertAwardedBadge` from `@shared/schema` (already exported there)
- Produces: `createOrganization(organization: InsertOrganization)`, `createUser(userData: InsertUser)`, `createBadgeCategory(category: InsertBadgeCategory)`, `createBadge(badge: InsertBadge)`, `awardBadge(awardData: InsertAwardedBadge)` — Task 3+ and all existing routes rely on these exact names

- [ ] **Step 1: Add the type imports**

In the existing `import { ... } from "@shared/schema";` block at the top of `server/storage.ts`, add:

```ts
  type InsertOrganization,
  type InsertUser,
  type InsertBadgeCategory,
  type InsertBadge,
  type InsertAwardedBadge,
```

- [ ] **Step 2: Change the five signatures**

```ts
// line ~55  was: organization: Omit<Organization, "id" | "createdAt">
export async function createOrganization(organization: InsertOrganization) {

// line ~247 was: userData: Omit<User, "id" | "createdAt">
export async function createUser(userData: InsertUser) {

// line ~381 was: category: Omit<BadgeCategory, "id" | "createdAt">
export async function createBadgeCategory(category: InsertBadgeCategory) {

// line ~481 was: badge: Omit<Badge, "id" | "createdAt">
export async function createBadge(badge: InsertBadge) {

// line ~501 was: awardData: Omit<AwardedBadge, "id" | "awardedAt">
export async function awardBadge(awardData: InsertAwardedBadge) {
```

Keep the function bodies unchanged — drizzle's `.values()` accepts insert-shaped data.

- [ ] **Step 3: Verify error count**

Run: `npm run check 2>&1 | grep -c "error TS"`
Expected: `26`. If new errors appear *inside* `server/storage.ts`, they will be at `.values(...)` calls where the zod-inferred type disagrees with drizzle's `$inferInsert`; in that case change the offending parameter type to `typeof <table>.$inferInsert` (e.g. `typeof users.$inferInsert`) instead of the zod-inferred type and re-run.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "fix: type storage create functions with drizzle-zod Insert types

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Session userId narrowing helper + vite ServerOptions fix

`req.session.userId` is `number | undefined` (see `server/types.ts`), but 18 call sites in routes behind `isAuthenticated` pass it where `number` is required. Add one narrowing helper. Also fix the one-line `allowedHosts` literal-type error in `server/vite.ts:26`.

**Files:**
- Modify: `server/middleware.ts` (append helper), `server/routes.ts:8` (import) and the 18 sites below, `server/vite.ts:26`

**Interfaces:**
- Consumes: `isAuthenticated` middleware (existing, unchanged)
- Produces: `requireSessionUserId(req: Request): number` exported from `server/middleware.ts` — throws if session has no userId; only for routes behind `isAuthenticated`

- [ ] **Step 1: Add the helper to `server/middleware.ts`**

Append (it already imports `Request` from express for the middleware signatures; add it to that import if absent):

```ts
/**
 * Narrow req.session.userId to number. Only call in handlers behind
 * isAuthenticated, which guarantees the session has a userId.
 */
export function requireSessionUserId(req: Request): number {
  const userId = req.session.userId;
  if (userId === undefined) {
    throw new Error("Session userId missing — route must be behind isAuthenticated");
  }
  return userId;
}
```

- [ ] **Step 2: Import it in `server/routes.ts`**

Add `requireSessionUserId` to the existing `import { isAuthenticated, ... } from "./middleware";` block at the top of the file.

- [ ] **Step 3: Replace the 17 assignment sites**

At each of these lines in `server/routes.ts` — 233, 270, 319, 357, 393, 445, 499, 538, 576, 637, 703, 737, 796, 871, 931, 975, 1053 — the code reads:

```ts
const userId = req.session.userId;          // (variable name varies:
                                            //  userId / requesterId / currentUserId)
```

Replace only the right-hand side, keeping each site's variable name:

```ts
const userId = requireSessionUserId(req);
```

Do NOT change line 128 (`GET /organizations` handler) — it deliberately checks `if (userId)` at runtime and has no type error.

- [ ] **Step 4: Fix the object-literal site at line 1032**

```ts
// was:
            updatedBy: req.session.userId,
// becomes:
            updatedBy: requireSessionUserId(req),
```

- [ ] **Step 5: Fix `server/vite.ts:26`**

```ts
// was:
    allowedHosts: true,
// becomes:
    allowedHosts: true as const,
```

(`ServerOptions.allowedHosts` is `true | string[] | undefined`; the plain literal widens to `boolean`.)

- [ ] **Step 6: Verify error count**

Run: `npm run check 2>&1 | grep -c "error TS"`
Expected: `7` (all remaining errors are under `client/`).

- [ ] **Step 7: Commit**

```bash
git add server/middleware.ts server/routes.ts server/vite.ts
git commit -m "fix: narrow session userId via requireSessionUserId helper; fix vite allowedHosts literal type

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Client type fixes

Seven errors, four root causes: (a) `sidebar.tsx` imports a hook name that doesn't exist; (b) `BrandHeading` widens its dynamic tag to all intrinsic elements; (c) `award-badge-dialog.tsx` has an untyped `useQuery` and demands the full DB `Badge` row when it uses 5 fields; (d) `badge-dialog.tsx` declares its own `Badge` with `imageUrl?: string` while callers pass DB rows with `imageUrl: string | null`.

**Files:**
- Modify: `client/src/hooks/use-mobile.tsx:5`, `client/src/pages/dashboard.tsx:28`, `client/src/components/ui/brand-elements.tsx:95`, `client/src/components/award-badge-dialog.tsx:34-38,57-60`, `client/src/components/badge-dialog.tsx:69-80,127`

**Interfaces:**
- Consumes: `Badge` type from `@shared/schema` (`$inferSelect`: `imageUrl: string | null`, `categoryId: number | null`, `criteriaSections: unknown` — it's an untyped jsonb column, sometimes a string at runtime; do not try to type the column itself in this phase)
- Produces: `useIsMobile` hook (renamed from `useMobile`); `AwardBadgeDialogProps.badge: Pick<Badge, "id" | "name" | "description" | "color" | "imageUrl">`; `BadgeDialog`'s local `Badge` widened as below

- [ ] **Step 1: Rename the mobile hook to the shadcn-standard name**

In `client/src/hooks/use-mobile.tsx:5`: `export function useMobile()` → `export function useIsMobile()`.
In `client/src/pages/dashboard.tsx:28`: change `import { useMobile }` to `import { useIsMobile }` and update its call site(s) in that file (search `useMobile(` within dashboard.tsx).
`sidebar.tsx:6` already imports `useIsMobile` — leave it.
These are the only two importers (verified by grep).

- [ ] **Step 2: Narrow `BrandHeading`'s dynamic tag (`brand-elements.tsx:95`)**

```ts
// was:
    const Component = `h${level}` as keyof JSX.IntrinsicElements;
// becomes:
    const Component = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
```

This fixes both errors at lines 117–118 (heading tags accept `HTMLAttributes<HTMLHeadingElement>` and the forwarded ref; the 170-member intrinsic union was the source of the ref mismatch and TS2590).

- [ ] **Step 3: Fix `award-badge-dialog.tsx`**

Type the users query (line ~57):

```ts
const { data: users = [] } = useQuery<{ id: number; name: string }[]>({
  queryKey: [`${apiPrefix}/organizations/${organizationId}/users`],
  enabled: !!organizationId && open,
});
```

Narrow the badge prop (lines 34–38) to the fields the component actually uses (`id`, `color`, `imageUrl`, `name`, `description` — verified by grep):

```ts
interface AwardBadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge: Pick<Badge, "id" | "name" | "description" | "color" | "imageUrl">;
  organizationId: number;
}
```

(`Badge` is already imported from `@shared/schema` at line 31.) This fixes the `users` error at line 160 and the `user-profile.tsx:430` error — user-profile's locally-declared badge shape satisfies the Pick structurally.

- [ ] **Step 4: Widen `badge-dialog.tsx`'s local `Badge` (lines 69–80)**

```ts
type Badge = {
  id: number;
  name: string;
  description: string;
  imageUrl?: string | null;
  categoryId?: number | null;
  organizationId: number;
  requiresProgress: boolean;
  criteriaType?: string;
  criteriaSections?: unknown;
  criteriaSectionsJson?: string;
};
```

Then fix the one place `criteriaSections?: unknown` breaks the form defaults (line ~127):

```ts
// was:
      criteriaSections: badge?.criteriaSections || [
// becomes:
      criteriaSections: (badge?.criteriaSections as BadgeFormValues["criteriaSections"]) || [
```

The `unknown` + cast mirrors what the codebase already does with this jsonb field (see `badge-progress-dialog.tsx:70-73`, which handles it being a string at runtime). Do not deep-type it here; proper typing happens in the Phase 3 restructure. This fixes `badges.tsx:460` and `dashboard.tsx:334` (both pass `@shared/schema`-derived rows).

- [ ] **Step 5: Verify zero errors**

Run: `npm run check 2>&1 | grep -c "error TS"`
Expected: `0`
Run: `npm run check; echo "exit: $?"`
Expected: `exit: 0`

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "fix: resolve all client type errors (hook rename, heading tag union, dialog prop types)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: ESLint + Prettier

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (devDependencies + scripts)

**Interfaces:**
- Consumes: nothing
- Produces: `npm run lint` and `npm run format:check` both exit 0 — Phase 2's CI workflow will call exactly these script names

- [ ] **Step 1: Install**

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-config-prettier prettier
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "db/migrations/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // The codebase is full of `any` from its prototype days; cleaning that
      // up is Phase 3 work, not a lint gate.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
```

- [ ] **Step 4: Run and settle the lint baseline**

```bash
npm run lint:fix
npm run lint
```

Expected: exits 0. If violations remain: fix unused vars by prefixing with `_`; for any other rule that fires widely on existing code, turn that rule `"off"` in `eslint.config.js` with a one-line comment naming the phase that will re-enable it (pattern: the `no-explicit-any` entry above). Do not rewrite logic to satisfy lint in this phase.

- [ ] **Step 5: Run the formatter and re-verify types**

```bash
npm run format
npm run check
```

Expected: `check` still exits 0. (`.prettierignore` already exists and covers generated files.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add ESLint 9 flat config and Prettier with lint/format scripts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: README, .env.example, LICENSE, .gitignore

**Files:**
- Create: `README.md`, `.env.example`, `LICENSE`
- Modify: `.gitignore` (ensure `.env` is ignored)

**Interfaces:**
- Consumes: nothing
- Produces: onboarding docs Phase 5's CLAUDE.md will link to rather than duplicate

- [ ] **Step 1: Create `.env.example`**

```bash
# PostgreSQL connection string (drizzle.config.ts and server/index.ts read this)
DATABASE_URL=postgres://badgery:badgery@localhost:5432/badgery

# Session-cookie signing secret. Required in production (enforced from Phase 1).
SESSION_SECRET=change-me-in-production
```

- [ ] **Step 2: Ensure `.gitignore` covers env files**

Check `.gitignore`; if `.env` is not present, append:

```
.env
.env.local
```

- [ ] **Step 3: Create `README.md`**

```markdown
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

| Script                 | What it does                            |
| ---------------------- | --------------------------------------- |
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
```

- [ ] **Step 4: Create `LICENSE`**

Standard MIT license text with the line: `Copyright (c) 2026 Aaron Wilson`. (package.json already declares `"license": "MIT"` — this adds the missing file.)

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example LICENSE .gitignore
git commit -m "docs: add README, .env.example, MIT LICENSE; ignore .env

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Safe dependency bumps (Dependabot triage)

10 of the 12 open Dependabot PRs are transitive/lockfile-level or patch bumps. They're months stale and will conflict with each other; instead of merging serially, apply the equivalent bumps locally in one commit — Dependabot auto-closes its PRs once main contains the fix. Defer the two majors per the spec.

**Files:**
- Modify: `package-lock.json` (and `package.json` only if `npm update` moves a direct dep's resolved version)

**Interfaces:**
- Consumes: green `npm run check` from Task 4
- Produces: lockfile with the security bumps; Dependabot PRs #5, #8, #11, #13–#18, #20 satisfied

- [ ] **Step 1: Apply the bumps**

```bash
npm update express-session on-headers glob lodash minimatch sucrase rollup yaml brace-expansion path-to-regexp picomatch
```

- [ ] **Step 2: Verify nothing broke**

```bash
npm run check && npm run lint && npm run build
```

Expected: all exit 0 and `dist/` is produced.

- [ ] **Step 3: Confirm the vulnerable versions are gone**

```bash
npm audit --omit=dev || true
```

Expected: no high/critical findings for the packages above. (Findings that require the deferred vite/drizzle majors are acceptable — note them in the commit message.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: apply transitive security bumps (supersedes Dependabot PRs 5,8,11,13-18,20)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Record the deferrals on the two major-bump PRs**

```bash
gh pr comment 19 --body "Deferring drizzle-orm 0.38→0.45 to Phase 3 (after the test harness lands in Phase 2). Tracked in docs/superpowers/specs/2026-07-13-agentic-modernization-design.md."
gh pr comment 21 --body "Deferring vite 5→8 to Phase 3 (after the test harness lands in Phase 2). Tracked in docs/superpowers/specs/2026-07-13-agentic-modernization-design.md."
```

---

### Task 8: Final verification and PR

**Files:** none (verification only)

**Interfaces:**
- Consumes: all prior tasks
- Produces: an open PR for `phase-0-hygiene` → `main`

- [ ] **Step 1: Clean-room verify**

```bash
rm -rf node_modules && npm ci
npm run check && npm run lint && npm run format:check && npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Optional runtime smoke (only if a local Postgres is available)**

```bash
npm run dev &
sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/auth/me
kill %1
```

Expected: `401` (unauthenticated — proves the server boots and routes respond). Skip without failing the task if no database is configured.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin phase-0-hygiene
gh pr create --title "Phase 0: baseline hygiene" --body "$(cat <<'EOF'
Implements Phase 0 of docs/superpowers/specs/2026-07-13-agentic-modernization-design.md:

- Delete dead files (backup routes, dialog copies, one-off db scripts, screenshots)
- tsc: 38 errors → 0 (storage Insert types, session-userId narrowing, client dialog prop types)
- ESLint 9 + Prettier with lint/format scripts
- README, .env.example, MIT LICENSE
- Transitive security bumps superseding Dependabot PRs 5,8,11,13-18,20 (majors 19/21 deferred to Phase 3)

No runtime behavior changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Request review**

Use superpowers:requesting-code-review to verify the work before merge.
