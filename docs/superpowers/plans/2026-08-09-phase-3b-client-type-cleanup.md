# Phase 3b — Client Type Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the client's hand-written type duplicates of `shared/schema.ts` entities (`Badge`, `BadgeCategory`, `Organization`), consolidate the copy-pasted "current session user" shape that's duplicated verbatim across 7 files into one real type, and replace the one `any[]`-typed API response (`users.tsx`) with a real type. No behavior change anywhere in this plan — this is type-safety-only, verified by `tsc` (`npm run check`), the existing 52-test integration suite (unaffected — no runtime code path changes), and a manual browser smoke pass at the end.

**Architecture:** Add a small `client/src/types/` directory (doesn't exist yet) holding two new client-only types that have no `shared/schema.ts` equivalent (`AuthUser` — a session/auth-response shape, not a raw DB row; `OrgUser` — the users-by-organization endpoint's actual response shape, also not a raw DB row). Everywhere else, delete the hand-written duplicate and import the real type directly from `@shared/schema`. Each task is scoped to one duplicate-type "family" so a reviewer can accept/reject independently.

**Tech Stack:** Same as Phase 3a — React 18, TypeScript, `@shared/schema` (Drizzle-inferred types), no new dependencies.

## Global Constraints

- **Shell gotcha:** every `npm`/`npx`/`node`/`tsx` invocation MUST be prefixed with `unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH` (nvm lazy-loading breaks non-interactive shells; shell state does not persist between commands).
- **Lockfile gotcha:** do not run a bare `npm install` on this repo — it silently re-mutates `package-lock.json` to local npm's resolution style, which then breaks CI (npm 10, pinned via `.github/workflows/ci.yml`'s `node-version: 20`). This plan adds no dependencies and touches no `package.json`/`package-lock.json`, so this should not come up, but if any step accidentally triggers a lockfile diff, run `git checkout -- package-lock.json` and investigate before proceeding.
- **GPG gotcha:** git commits in this repo require GPG signing; the pinentry dialog periodically times out in non-interactive/subagent shells. If a commit fails with a GPG pinentry timeout, do not use `--no-gpg-sign` — report it and let the controller (a session with terminal access) run the commit.
- Branch: `phase-3b-client-type-cleanup` off up-to-date `main`. One commit per task.
- **No behavior change.** Every type replaced in this plan is structurally satisfied by real API responses already (verified against the actual server routes/services at plan-writing time — see each task's "Verified against" note). If a step ever needs to narrow or widen a type beyond what's specified below to make `tsc` pass, stop and report rather than silently reshaping data or adding a cast to force it through.
- **The full test suite (`npm test`, 52 tests) must still pass after every task** — none of these changes touch a route or service's runtime logic, so this is a regression check, not an expected-changes check.
- `npm run check` (tsc) must be clean after every task — this plan's entire point is type-safety, so a task that leaves `tsc` red is not done.
- Spec: `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md` (Phase 3 section: "`shared/schema.ts` is the single source of truth for types; delete the client's hand-written duplicates (`Badge` etc.) and import from `shared/`.").
- **The spec's other Phase-3-client item — "Fix the broken `useIsMobile`/`useMobile` import" — is already resolved** (fixed in Phase 1, commit `873a622`, well before this plan was written). `client/src/hooks/use-mobile.tsx` exports `useIsMobile`, and both consumers (`dashboard.tsx`, `components/ui/sidebar.tsx`) import it correctly. No task in this plan touches it; do not "fix" it again.
- Deferred to sibling sub-phases (not in scope here): dependency bumps (3c), OpenAPI rewrite (3d).

---

### Task 1: `AuthUser` type — consolidate the session-user shape duplicated across 7 files

**Files:**

- Create: `client/src/types/session.ts`
- Modify: `client/src/App.tsx:19` (`useState<any>(null)` → `useState<AuthUser | null>(null)`)
- Modify: `client/src/components/sidebar.tsx:37-44` (`SidebarProps.user` inline shape → `AuthUser`)
- Modify: `client/src/pages/dashboard.tsx:25-31` (`DashboardProps.user` inline shape → `AuthUser`)
- Modify: `client/src/pages/badges.tsx:53-59` (`BadgesProps.user` inline shape → `AuthUser`)
- Modify: `client/src/pages/users.tsx:27-33` (`UsersProps.user` inline shape → `AuthUser`)
- Modify: `client/src/pages/progress.tsx:33-39` (`ProgressProps.user` inline shape → `AuthUser`)
- Modify: `client/src/pages/user-profile.tsx:18-24` (`UserProfileProps.user` inline shape → `AuthUser`)
- Modify: `client/src/pages/branding.tsx:21-27` (`BrandingProps.user` inline shape → `AuthUser`)

**Interfaces:**

- Produces: `AuthUser` type, exported from `client/src/types/session.ts`, imported as `import type { AuthUser } from "@/types/session";` everywhere in this task.
- Verified against: `GET /api/v1/auth/me` and `POST /api/v1/auth/login` (`server/features/auth/routes.ts:75-94` and `:42-49`) both return exactly `{ id, username, name, email, role, organizationId }` (`organizationId` is `user.organizationId || null`, so always present, never `undefined`, on the wire — but existing code across all 7 files treats it as optional/absent-capable, so the type keeps `organizationId?: number | null` to match existing usage without forcing an unrelated cleanup of every callsite's `user.organizationId || 1` fallback pattern).

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b phase-3b-client-type-cleanup
```

- [ ] **Step 2: Create `client/src/types/session.ts`**

```ts
// The shape returned by POST /api/v1/auth/login and GET /api/v1/auth/me
// (server/features/auth/routes.ts). Not a shared/schema.ts type: this is
// an API response projection of the users table, not a raw DB row (no
// password, no createdAt/updatedAt/active audit fields).
export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  organizationId?: number | null;
};
```

- [ ] **Step 3: Update `client/src/App.tsx`**

Change line 19 from:

```ts
const [currentUser, setCurrentUser] = useState<any>(null);
```

to:

```ts
const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
```

Add the import near the top with the other `@/` imports:

```ts
import type { AuthUser } from "@/types/session";
```

- [ ] **Step 4: Replace the inline `user` shape in each of the 7 prop interfaces**

In each of `client/src/components/sidebar.tsx`, `client/src/pages/dashboard.tsx`, `client/src/pages/badges.tsx`, `client/src/pages/users.tsx`, `client/src/pages/progress.tsx`, `client/src/pages/user-profile.tsx`, `client/src/pages/branding.tsx`:

Add `import type { AuthUser } from "@/types/session";` near the top with the other `@/` imports.

Replace the inline shape (all 7 are byte-identical):

```ts
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
```

with:

```ts
  user: AuthUser;
```

(In `user-profile.tsx`, this is inside `UserProfileProps` alongside its own `id: string` field — only the nested `user: {...}` block changes; leave `id: string` as-is, it's the route param, unrelated to the session user.)

- [ ] **Step 5: Typecheck**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH
npm run check
```

Expected: no errors. If an error appears about `organizationId` being possibly `undefined` somewhere it wasn't before, that means a callsite was relying on the field always being present — do not add a non-null assertion to force it through; report the exact file/line instead, since that would be a real narrowing this plan didn't anticipate.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: 52/52 passing, unchanged (this task touches no server code and no runtime logic).

- [ ] **Step 7: Commit**

```bash
git add client/src/types/session.ts client/src/App.tsx client/src/components/sidebar.tsx client/src/pages/dashboard.tsx client/src/pages/badges.tsx client/src/pages/users.tsx client/src/pages/progress.tsx client/src/pages/user-profile.tsx client/src/pages/branding.tsx
git commit -m "refactor: consolidate duplicated session-user shape into AuthUser type"
```

---

### Task 2: `Badge`/`BadgeCategory` — delete `badge-dialog.tsx`'s hand-written duplicates

**Files:**

- Modify: `client/src/components/badge-dialog.tsx:36-65` (delete local `Badge`/`BadgeCategory` types, import real ones)

**Interfaces:**

- Consumes: `Badge`, `BadgeCategory` from `@shared/schema` (`shared/schema.ts:184-225` for `Badge`/`InsertBadge`, `:178-181`-ish for `BadgeCategory` — both are `typeof <table>.$inferSelect`).
- Verified against actual usage in the file: `badge` (the `BadgeDialogProps.badge?: Badge` prop) is only read via `badge?.name`, `badge?.description`, `badge?.categoryId`, `badge?.imageUrl`, `badge?.criteriaType`, `badge?.criteriaSections` (cast to `BadgeFormValues["criteriaSections"]` already, so the schema type's `unknown`/`jsonb` typing for that field is fine as-is), and `badge?.id` — every one of these exists on the real `Badge` type. `categories` (typed `BadgeCategory[]`) is only read via `category.id`/`category.name` in a `.map()` — both exist on the real `BadgeCategory` type. No extension needed; this is a straight swap, unlike Task 3.

- [ ] **Step 1: Replace the type block**

In `client/src/components/badge-dialog.tsx`, delete this block (current lines 36-65):

```ts
// Type definitions
type ApiError = {
  message: string;
  status?: number;
};

interface BadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: Badge;
  organizationId: number;
}

type BadgeCategory = {
  id: number;
  name: string;
  organizationId: number;
};

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

Replace with:

```ts
// Type definitions
type ApiError = {
  message: string;
  status?: number;
};

interface BadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: Badge;
  organizationId: number;
}
```

(`ApiError` here is a local dialog-specific error shape, not `shared/schema.ts`-related — leave it untouched, it's out of scope.)

Add the import near the top of the file, with the other `@/`/`@shared` imports:

```ts
import type { Badge, BadgeCategory } from "@shared/schema";
```

- [ ] **Step 2: Typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: 52/52 passing, unchanged.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/badge-dialog.tsx
git commit -m "refactor: import Badge/BadgeCategory from shared schema in badge-dialog"
```

---

### Task 3: `Badge` extension type — consolidate `badge-card.tsx`/`badges.tsx`'s duplicate into `types/badge.ts`

**Files:**

- Create: `client/src/types/badge.ts`
- Modify: `client/src/components/ui/badge-card.tsx:1-18`
- Modify: `client/src/pages/badges.tsx:1-24`

**Interfaces:**

- Produces: `BadgeWithExtras` type, exported from `client/src/types/badge.ts`.
- Both files currently declare a near-identical local `type Badge = BaseBadge & {...}` (`BaseBadge` = `Badge` imported from `@shared/schema`) — `badge-card.tsx`'s version additionally has an optional `awarded?: number` field that `badges.tsx`'s doesn't. `BadgeWithExtras` is the union of both (all fields optional, so it satisfies both current callsites unchanged).

- [ ] **Step 1: Create `client/src/types/badge.ts`**

```ts
import type { Badge as BaseBadge } from "@shared/schema";

// The badges list/detail views enrich the raw Badge row with its category
// (joined) and a parsed criteriaSections structure (badges.tsx stores this
// as a jsonb column, typed unknown on BaseBadge; these views need it typed).
// `awarded` is populated only on the per-user badge card view.
export type BadgeWithExtras = BaseBadge & {
  criteriaSections?: Array<{
    title: string;
    criteria: Array<{
      id: number;
      name: string;
      description?: string;
    }>;
  }>;
  category?: {
    id: number;
    name: string;
  } | null;
  awarded?: number;
};
```

- [ ] **Step 2: Update `client/src/components/ui/badge-card.tsx`**

Replace (current lines 1-18):

```ts
import { Badge as BaseBadge } from "@shared/schema";

// Extended Badge type with criteriaSections and category
type Badge = BaseBadge & {
  criteriaSections?: Array<{
    title: string;
    criteria: Array<{
      id: number;
      name: string;
      description?: string;
    }>;
  }>;
  category?: {
    id: number;
    name: string;
  } | null;
  awarded?: number;
};
import { Card, CardContent, CardFooter } from "@/components/ui/card";
```

with:

```ts
import type { BadgeWithExtras as Badge } from "@/types/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
```

(Aliasing the import as `Badge` keeps every downstream reference in this file — `BadgeCardProps`, `onEdit`/`onAward`/`onClick` signatures — unchanged, so this step touches only the import block.)

- [ ] **Step 3: Update `client/src/pages/badges.tsx`**

Replace (current lines 7, 10-23 — note the import block is split by the type declaration in the original file, so preserve the surrounding imports exactly):

```ts
import { Badge as BaseBadge } from "@shared/schema";
import { apiPrefix } from "@/lib/queryClient";

// Extended Badge type with criteriaSections and category
type Badge = BaseBadge & {
  criteriaSections?: Array<{
    title: string;
    criteria: Array<{
      id: number;
      name: string;
      description?: string;
    }>;
  }>;
  category?: {
    id: number;
    name: string;
  } | null;
};
```

with:

```ts
import type { BadgeWithExtras as Badge } from "@/types/badge";
import { apiPrefix } from "@/lib/queryClient";
```

- [ ] **Step 4: Typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: 52/52 passing, unchanged.

- [ ] **Step 6: Commit**

```bash
git add client/src/types/badge.ts client/src/components/ui/badge-card.tsx client/src/pages/badges.tsx
git commit -m "refactor: consolidate duplicated Badge extension type into types/badge.ts"
```

---

### Task 4: `Organization` — delete `sidebar.tsx`'s hand-written duplicate

**Files:**

- Modify: `client/src/components/sidebar.tsx:29-33` (delete local `Organization` interface, import real one)

**Interfaces:**

- Consumes: `Organization` from `@shared/schema` (`shared/schema.ts:24-42`, `typeof organizations.$inferSelect`).
- Verified against actual usage: `organizations` (the `useQuery<Organization[]>` result) is only read via `org.id`/`org.name` in a `.map()` inside the org-selector dropdown (`client/src/components/sidebar.tsx:146`) — both exist on the real `Organization` type (which additionally carries `description`, `active`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt` — all unused here but harmless since nothing destructures the object narrowly).

- [ ] **Step 1: Replace the type**

In `client/src/components/sidebar.tsx`, delete:

```ts
interface Organization {
  id: number;
  name: string;
  description?: string;
}
```

Add the import near the top of the file, with the other `@/`/`@shared` imports (note: Task 1 already added an `import type { AuthUser } from "@/types/session";` line here — add this alongside it):

```ts
import type { Organization } from "@shared/schema";
```

- [ ] **Step 2: Typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: 52/52 passing, unchanged.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/sidebar.tsx
git commit -m "refactor: import Organization from shared schema in sidebar"
```

---

### Task 5: `OrgUser` type — replace `users.tsx`'s `useQuery<any[]>`

**Files:**

- Create: `client/src/types/user.ts`
- Modify: `client/src/pages/users.tsx:43-52`

**Interfaces:**

- Produces: `OrgUser` type, exported from `client/src/types/user.ts`.
- Verified against: `GET /api/v1/organizations/:orgId/users` (`server/features/users/routes.ts:15-35`) is handled by `getUsersByOrganization` (`server/features/users/service.ts:143-176`), which runs `SELECT u.*` joined against `organizations`/`user_organization` but then explicitly re-maps every row to `{ id, username, name, email, role, createdAt, organizations: [{id, name}] }` before returning — **no password field reaches the response** (initial concern about this was checked and ruled out — the raw `SELECT u.*` is intermediate, not what's returned). `OrgUser` mirrors that exact mapped shape, not the raw DB row, so it's a client-only type (not from `@shared/schema`), same reasoning as `AuthUser` in Task 1.

- [ ] **Step 1: Create `client/src/types/user.ts`**

```ts
// The shape returned by GET /api/v1/organizations/:orgId/users
// (server/features/users/service.ts getUsersByOrganization). A hand-mapped
// API response projection, not a raw users-table row — notably it excludes
// password and includes the joined organizations array, so it isn't a
// shared/schema.ts type.
export type OrgUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  organizations: Array<{ id: number; name: string }>;
};
```

- [ ] **Step 2: Update `client/src/pages/users.tsx`**

Add the import near the top with the other `@/` imports:

```ts
import type { OrgUser } from "@/types/user";
```

Change (current lines 43-52):

```ts
  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: [`${apiPrefix}/organizations/${organizationId}/users`],
  });

  const filteredUsers = Array.isArray(users)
    ? users.filter((user: any) => {
        return searchQuery
          ? user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
              user.username.toLowerCase().includes(searchQuery.toLowerCase())
          : true;
      })
    : [];
```

to:

```ts
  const { data: users = [], isLoading } = useQuery<OrgUser[]>({
    queryKey: [`${apiPrefix}/organizations/${organizationId}/users`],
  });

  const filteredUsers = Array.isArray(users)
    ? users.filter((user: OrgUser) => {
        return searchQuery
          ? user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
              user.username.toLowerCase().includes(searchQuery.toLowerCase())
          : true;
      })
    : [];
```

Note: this page also has a local page-scope variable named `user` from `UsersProps` destructuring (the logged-in session user, now typed `AuthUser` per Task 1) — the `.filter((user: OrgUser) => ...)` callback parameter shadows it, exactly as the original `(user: any) =>` did. This is pre-existing shadowing, not introduced by this task; leave it as-is (renaming it is an unrelated cleanup, out of scope).

- [ ] **Step 3: Typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: 52/52 passing, unchanged.

- [ ] **Step 5: Commit**

```bash
git add client/src/types/user.ts client/src/pages/users.tsx
git commit -m "refactor: type users.tsx's org-users query as OrgUser[] instead of any[]"
```

---

### Task 6: Full-branch verification and manual smoke pass

**Files:** None (verification only).

- [ ] **Step 1: Full verification suite**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH
npm run check && npm run lint && npm run format:check && npm run build && npm test
```

Expected: all green, 52/52 tests passing.

- [ ] **Step 2: Grep-verify no hand-written duplicates remain**

```bash
grep -rn "^interface Organization\|^type Badge = {\|^type BadgeCategory = {" client/src --include="*.ts" --include="*.tsx"
grep -rn "organizationId?: number;" client/src --include="*.tsx"
grep -n "any\[\]" client/src/pages/users.tsx
```

Expected: first command finds nothing. Second command finds nothing (all 7 sites replaced with `AuthUser` in Task 1 — if this still matches, a file was missed). Third command finds nothing.

- [ ] **Step 3: Manual browser smoke test**

Start the dev server (`npm run dev`) and, logged in, visit: Dashboard, Badges (open the create/edit badge dialog), Users, Progress, Branding, and a user profile page. Confirm each renders with no console errors and no visibly missing data (this plan changes only compile-time types, so a regression here would mean a type was narrowed incorrectly in an earlier task — if anything looks wrong, identify which task's type is the mismatch rather than patching it here).

- [ ] **Step 4: Update the plan's own tracking**

No commit needed for this task (verification-only) — if all checks pass, the branch is ready for the final whole-branch review per the established workflow (`superpowers:requesting-code-review`), then `superpowers:finishing-a-development-branch`.
