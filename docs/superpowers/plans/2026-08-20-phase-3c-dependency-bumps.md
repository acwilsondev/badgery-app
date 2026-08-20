# Phase 3c — Dependency Bumps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the deferred major dependency bumps called out in the Phase 3
spec (vite, drizzle-orm) plus their directly-coupled devDependencies
(`@vitejs/plugin-react`, `vitest`, `drizzle-kit`), and drop one dead
dependency found along the way. Tests green after each bump, per the spec.

**Architecture:** No source-code architecture changes — this phase only
touches `package.json`/`package-lock.json` and, where a major bump forces
it, the minimal config/call-site changes needed to keep `npm run check`,
`npm run lint`, `npm test`, and `npm run build` green. Each task bumps one
coupled group of packages and re-verifies before moving to the next, so a
regression is always traceable to a single task's diff.

**Tech Stack:** Same stack as Phase 3a/3b. Target versions fixed by
research at plan-writing time (2026-08-20):

| Package                | Current   | Target     | Why this target, not latest                                                                                                                                                                                                                                                             |
| ---------------------- | --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite`                 | `^5.4.9`  | `^6.4.3`   | vitest 4.x's peer range is `^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0` — 6 is the floor and was chosen over 7/8 (Aaron's call): 6 and 7 are both still esbuild+Rollup, same mental model as 5; 8 switches the bundler to Oxc/Rolldown, more risk than this phase needs.                            |
| `@vitejs/plugin-react` | `^4.3.2`  | `^4.7.0`   | Latest version still in the `4.x` line that supports `vite ^6`. **Do not bump to plugin-react 6.x** — its `6.0.0`/`6.1.0` peer dep is `vite: ^8.0.0` only (rolldown-specific), it will not work with vite 6.                                                                            |
| `vitest`               | `^4.1.10` | `^4.1.11`  | Patch-only; already on the 4.x line, this just picks up the latest patch while the vite peer range is satisfied.                                                                                                                                                                        |
| `drizzle-orm`          | `^0.38.4` | `^0.45.2`  | Latest. No `index()`/`uniqueIndex()` usage in `shared/schema.ts` (verified by grep) so the 0.31 drizzle-kit PG-index-API rework doesn't apply. No raw Postgres error-code sniffing in `server/` (verified by grep) so the 0.44 `DrizzleQueryError` wrapper change doesn't apply either. |
| `drizzle-kit`          | `^0.27.1` | `^0.31.10` | Latest, paired with drizzle-orm 0.45.2 per Drizzle's own compatibility guidance (bump both together).                                                                                                                                                                                   |

**Spec:** `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md`
(Phase 3 section: "Take the deferred major dependency bumps (vite,
drizzle-orm) here, tests green after each.")

## Global Constraints

- **Shell gotcha:** every `npm`/`npx`/`node`/`tsx` invocation MUST be
  prefixed with `unset -f node npm npx 2>/dev/null; export
PATH=/usr/local/bin:$PATH` (nvm lazy-loading breaks non-interactive
  shells; shell state does not persist between commands).
- **Lockfile gotcha — this is the load-bearing rule for this whole phase:**
  CI pins Node 20 (`.github/workflows/ci.yml`'s `node-version: 20`, which
  resolves to npm 10). Local npm is npm 11. A bare local `npm install`
  resolves and rewrites `package-lock.json` in npm 11's style, which
  breaks `npm ci` in CI (this exact failure mode already happened once, in
  Phase 3a, PR #29). Therefore:
  - Every command in this plan that changes dependency versions (`npm
install <pkg>@<version>`) MUST run inside a `node:20` container, never
    with local npm:
    ```bash
    podman run --rm -v "$PWD":/work:Z -w /work docker.io/library/node:20 \
      npm install <pkg>@<version>
    ```
  - After a container-based install, sync local `node_modules` to the new
    lockfile with `npm ci` (safe to run locally — unlike `npm install`,
    `npm ci` never rewrites the lockfile; it only installs exactly what's
    already locked, or fails if `package.json`/lock disagree). This also
    means local `node_modules`' native bindings (e.g. `argon2`) end up
    built for the local machine's Node version, matching normal dev use.
  - If any step ever produces a lockfile diff without you having run a
    container-based `npm install`, stop: `git checkout --
package-lock.json` and investigate before proceeding — don't commit
    it.
- **GPG gotcha:** git commits in this repo require GPG signing; the
  pinentry dialog periodically times out in non-interactive/subagent
  shells. If a commit fails with a GPG pinentry timeout, do not use
  `--no-gpg-sign` — report it and let the controller (a session with
  terminal access) retry the same `git commit` (it has succeeded on retry
  every time so far).
- Branch: `phase-3c-dependency-bumps` off up-to-date `main`. One commit per
  task.
- **`npm test` (integration suite against real Postgres) must pass after
  every task.** Tasks 3 and 4 touch the ORM/migration tool directly, so
  this is the real regression gate, not a formality.
- **`npm run check` (tsc) and `npm run lint` must be clean after every
  task.**
- **`npm run build` must succeed after every task** (Task 2 in particular
  — it's the one most likely to break the client build).
- Deferred to sibling sub-phase 3d (not in scope here): OpenAPI rewrite +
  CI contract test. The badge-progress storage redesign (flat-percentage
  vs per-metric) is also out of scope — untouched by this phase.
- If any bump surfaces a real behavior change beyond what's documented in
  this plan's target-version table (a test failure that isn't obviously a
  call-site/API-rename fix, or any change to production runtime behavior),
  **stop and escalate to Aaron** before patching around it — same rule as
  Phase 2/3a: plan-authoring bugs get fixed inline, production-code
  surprises get escalated.

---

### Task 1: Remove the unused `@replit/vite-plugin-shadcn-theme-json` dependency

**Files:**

- Modify: `package.json` (remove line 51, the
  `"@replit/vite-plugin-shadcn-theme-json": "^0.0.4"` entry from
  `dependencies`)
- Modify: `package-lock.json` (regenerated by the install step)

**Interfaces:** None — this package is not imported anywhere. Verified at
plan-writing time: `grep -rn "shadcn-theme-json" --include="*.ts"
--include="*.tsx" .` (excluding `node_modules`) only matches
`package.json`/`package-lock.json` themselves, never `vite.config.ts` or
any source file. It's leftover from the original Replit prototype scaffold.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b phase-3c-dependency-bumps
```

- [ ] **Step 2: Confirm it's really unused (guard against stale grep)**

```bash
grep -rn "shadcn-theme-json" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v package-lock.json | grep -v package.json
```

Expected: no output. If this prints a real source-file match, STOP — do
not remove the dependency, report the finding instead (the plan's premise
was wrong).

- [ ] **Step 3: Remove it from `package.json`**

Delete this line from the `dependencies` block:

```json
"@replit/vite-plugin-shadcn-theme-json": "^0.0.4",
```

- [ ] **Step 4: Regenerate the lockfile via the node:20 container**

```bash
podman run --rm -v "$PWD":/work:Z -w /work docker.io/library/node:20 npm install
```

(No package argument — this re-resolves the lockfile to match the edited
`package.json`, still using npm 10's resolution algorithm.)

- [ ] **Step 5: Sync local `node_modules` and verify**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH
npm ci
npm run check && npm run lint && npm test && npm run build
```

Expected: all four green, and `@replit/vite-plugin-shadcn-theme-json` no
longer appears anywhere in `package-lock.json`
(`grep shadcn-theme-json package-lock.json` → no output).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused @replit/vite-plugin-shadcn-theme-json dependency"
```

---

### Task 2: Bump vite → 6.4.3, @vitejs/plugin-react → 4.7.0, vitest → 4.1.11

**Files:**

- Modify: `package.json` (`vite`, `@vitejs/plugin-react`, `vitest` entries
  in `devDependencies`)
- Modify: `package-lock.json` (regenerated by the install step)
- Possibly modify: `vite.config.ts`, `vitest.config.ts`, `server/vite.ts`
  — only if the build/dev-server/test-suite verification in Step 3 finds a
  real incompatibility (see the vite 5→6 changes noted in Interfaces
  below); do not pre-emptively change these files.

**Interfaces:**

- Known vite 5→6 changes checked against this codebase at plan-writing
  time: minimum `terser` version bump (irrelevant — this repo doesn't set
  `build.minify: 'terser'`, esbuild is the default minifier and is what's
  used here); `commonjsOptions.strictRequires` default change (irrelevant
  — not overridden in `vite.config.ts`); library-mode CSS output filename
  change (irrelevant — this is an app build, not library mode); glob range
  brace syntax removal (irrelevant — no such globs in this config).
  `vite.config.ts`'s three plugins (`@vitejs/plugin-react`,
  `@replit/vite-plugin-runtime-error-modal`,
  `@replit/vite-plugin-cartographer`) don't declare a `vite` peerDependency
  constraint that excludes 6, but neither has been test-verified against
  vite 6 upstream — Step 3's dev-server and build checks are what actually
  confirm they still work, not the peer-dep metadata.
- `server/vite.ts` imports `createServer as createViteServer, createLogger`
  from `"vite"` and spreads `viteConfig` (the `vite.config.ts` default
  export) into `createViteServer`'s options — this is vite's standard
  programmatic dev-server API and is unchanged in vite 6's migration guide;
  no code change expected here, but Step 3 exercises it directly (`npm run
dev`).

- [ ] **Step 1: Bump the three packages via the node:20 container**

```bash
podman run --rm -v "$PWD":/work:Z -w /work docker.io/library/node:20 \
  npm install --save-dev vite@6.4.3 @vitejs/plugin-react@4.7.0 vitest@4.1.11
```

- [ ] **Step 2: Sync local `node_modules`**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH
npm ci
```

- [ ] **Step 3: Verify — typecheck, lint, full test suite, production build**

```bash
npm run check
npm run lint
npm test
npm run build
```

Expected: all four green with no code changes. If any fails with a vite-6-
specific error, fix the minimal call site (e.g. a renamed/removed vite
config option) and re-run — this is exactly the kind of small compat fix
this task exists to absorb. If a fix isn't minimal/obvious, stop and
escalate per the Global Constraints rule.

- [ ] **Step 4: Manually verify the dev server still serves the client**

```bash
npm run dev &
sleep 3
curl -sf http://localhost:5000/ | grep -q "<title>" && echo "OK: dev server serving HTML"
kill %1
```

Expected: `OK: dev server serving HTML` printed, no vite/HMR errors in the
captured output above it.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump vite to 6.4.3, @vitejs/plugin-react to 4.7.0, vitest to 4.1.11"
```

---

### Task 3: Bump drizzle-orm → 0.45.2, drizzle-kit → 0.31.10

**Files:**

- Modify: `package.json` (`drizzle-orm` in `dependencies`, `drizzle-kit`
  in `devDependencies`)
- Modify: `package-lock.json` (regenerated by the install step)
- Possibly modify: any `server/features/*/service.ts` file, `db/seed.ts`,
  or `drizzle.config.ts` — only if Step 3's full test run surfaces a real
  query-builder or drizzle-kit CLI incompatibility; do not pre-emptively
  change these files.

**Interfaces:**

- Verified at plan-writing time: `shared/schema.ts` defines no `index()` /
  `uniqueIndex()` calls (`grep -n "index(\|uniqueIndex(\|\.on(("
shared/schema.ts` → no matches), so drizzle-kit 0.31's PostgreSQL index
  API rework has nothing to migrate.
- Verified at plan-writing time: no code under `server/` inspects a raw
  Postgres driver error property (`grep -rn "\.code\b\|23505" server/` only
  matches `ApiError`'s own `.code` field in `server/middleware/errors.ts`,
  not a caught DB error), so drizzle-orm 0.44's `DrizzleQueryError` wrapper
  (which wraps driver errors rather than passing them through raw) has no
  call site to update.
- `drizzle.config.ts` uses `defineConfig` from `"drizzle-kit"` with
  `dialect: "postgresql"` and `dbCredentials: { url: ... }` — this is the
  current (not legacy `driver`/`connectionString`) config shape, already
  compatible with 0.31's config schema.
- `npm run db:push` (`drizzle-kit push --force --config=./drizzle.config.ts`)
  is the one drizzle-kit CLI invocation used in this repo (per
  `package.json`'s scripts) — Step 4 below exercises it directly against
  the dev DB.

- [ ] **Step 1: Bump both packages via the node:20 container**

```bash
podman run --rm -v "$PWD":/work:Z -w /work docker.io/library/node:20 \
  npm install drizzle-orm@0.45.2 && \
podman run --rm -v "$PWD":/work:Z -w /work docker.io/library/node:20 \
  npm install --save-dev drizzle-kit@0.31.10
```

- [ ] **Step 2: Sync local `node_modules`**

```bash
unset -f node npm npx 2>/dev/null; export PATH=/usr/local/bin:$PATH
npm ci
```

- [ ] **Step 3: Verify — typecheck, lint, full integration test suite**

```bash
npm run check
npm run lint
npm test
```

Expected: all three green. `npm test` is the real gate here — every test
file exercises real Drizzle queries against real Postgres
(`tests/{auth,badges,health,organizations,progress,stats,users}.test.ts`),
so a query-builder behavior change would show up as a test failure here,
not a compile error. If a test fails with what looks like a genuine
drizzle-orm 0.45 behavior difference (not a typo/config issue), stop and
escalate per the Global Constraints rule — don't adjust test expectations
to match new behavior without Aaron's sign-off.

- [ ] **Step 4: Verify drizzle-kit's CLI path against the real dev DB**

```bash
docker compose up -d
npm run db:push
```

Expected: exits 0, reports the schema already in sync (no destructive
prompt — `--force` is already set) or applies a no-op diff. This confirms
drizzle-kit 0.31's CLI and config parsing still work end-to-end, not just
that it type-checks.

- [ ] **Step 5: Production build sanity check**

```bash
npm run build
```

Expected: green (drizzle-orm is bundled into the server build via esbuild;
this confirms no ESM/export-shape change broke the bundle).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump drizzle-orm to 0.45.2, drizzle-kit to 0.31.10"
```

---

### Task 4: Final whole-branch verification and PR

**Files:** None modified — this task only verifies and opens the PR.

**Interfaces:** None.

- [ ] **Step 1: Full CI-equivalent check, run exactly as CI runs it**

```bash
podman run --rm -v "$PWD":/work:Z -w /work docker.io/library/node:20 sh -c \
  "npm ci && npm run check && npm run lint && npm test && npm run build"
```

Expected: all green, inside the same Node 20/npm 10 environment CI itself
uses — this is the definitive check that the lockfile and every bump are
CI-compatible, not just locally-compatible.

- [ ] **Step 2: Confirm no stray version drift**

```bash
npm outdated vite vitest @vitejs/plugin-react drizzle-orm drizzle-kit
```

Expected: each package shows `Current` matching this plan's target version
column (vite 6.4.3, vitest 4.1.11, @vitejs/plugin-react 4.7.0, drizzle-orm
0.45.2, drizzle-kit 0.31.10) — `Wanted`/`Latest` may show newer patches
that landed after plan-writing time; that's fine, out of scope for this
task.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin phase-3c-dependency-bumps
gh pr create --title "Phase 3c: Dependency bumps (vite, drizzle-orm)" --body "$(cat <<'EOF'
## Summary
- Removed unused `@replit/vite-plugin-shadcn-theme-json` dependency (never imported anywhere)
- Bumped vite 5.4.18 → 6.4.3, @vitejs/plugin-react 4.3.4 → 4.7.0, vitest → 4.1.11 (resolves the vite/vitest peer-range mismatch first surfaced in Phase 3a's CI lockfile fix)
- Bumped drizzle-orm 0.38.4 → 0.45.2, drizzle-kit 0.27.2 → 0.31.10

## Test plan
- [x] `npm run check` / `npm run lint` / `npm test` / `npm run build` all green after every task
- [x] Full CI-equivalent run (node:20 container, `npm ci` from scratch) green
- [x] `npm run db:push` verified against a real Postgres dev DB
- [x] Dev server manually verified serving the client under vite 6

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Completion

- [ ] All 4 tasks committed on `phase-3c-dependency-bumps`
- [ ] PR opened against `main`, CI green
- [ ] Update badgery memory: Phase 3c done, move to 3d (OpenAPI rewrite +
      CI contract test) as the next/last Phase-3 sub-phase
