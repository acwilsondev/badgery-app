# Phase 4 — Docker + Kubernetes (GitOps) Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give badgery-app a production container image and deploy it to
Aaron's existing k3s homelab cluster (`~/Projects/homelab-docker`) via
GitOps (Argo CD), replacing the original spec's "VPS + docker-compose +
SSH-based GitHub Actions CD" design with the pattern this cluster already
uses for `acwilsondev/vikunja-tagger` (its own repo/image, deployed as an
Argo CD child `Application`).

**Architecture:** Two repositories, two verification styles:

- **`badgery-app`** (this repo): a multi-stage `Dockerfile`, a `/healthz`
  endpoint (DB connectivity check — doubles as the k8s liveness/readiness
  target), and a `build.yml` GitHub Actions workflow that builds and
  pushes `ghcr.io/acwilsondev/badgery-app` on every push to `main`. Also
  fixes two production-only bugs identified during Phase 3c's final
  review that this phase is the first to actually exercise (a
  `drizzle-kit push` table-drop hazard, and a static `vite` import that
  crashes a `--omit=dev` production install). Verified the existing way:
  `npm run check`/`lint`/`test`/`build`, plus a real `podman build` +
  `podman run` smoke test.
- **`homelab-docker`** (`~/Projects/homelab-docker`, a separate git repo —
  a live, real GitOps reference for Aaron's home k3s cluster, not
  application code): a new `badgery` namespace holding two Argo CD child
  `Application`s (the app itself, and a dedicated Postgres — same split
  `matrix-postgresql`/`matrix-synapse` uses), plus a Traefik
  `IngressRoute` at `badges.anarchy.pizza`. Verified the way that repo's
  own `CLAUDE.md` documents: `helm template <chart> -f values.yaml`
  against the pinned chart version, no CI. **Secrets are never committed**
  — namespace/secret creation, DNS, and the initial schema push are
  written up as manual steps in a `SETUP.md`, matching
  `k8s/apps/vikunja-tagger/SETUP.md`'s pattern exactly, not executed by
  this plan.

Image promotion is **manual**, by explicit choice (confirmed with Aaron):
CI builds and pushes `ghcr.io/acwilsondev/badgery-app:<sha>`; deploying a
given build means hand-editing the pinned `tag:` in
`homelab-docker/k8s/apps/badgery/values.yaml` and pushing — Argo CD's
git-diff sync (`selfHeal: true`) takes it from there. This is exactly
`vikunja-tagger`'s current setup, except pinned to a SHA from the very
first deploy (that repo initially shipped `tag: latest` and had to
backfill the SHA pin later, in commit `8f020ff`, because `latest` never
changes in git and gives Argo CD nothing to react to — no reason to repeat
that here).

**Tech Stack:** Node 22 (matches `flake.nix`/CI), `node:22-alpine` for the
Docker image (verified below that `argon2`'s prebuilt binaries cover both
glibc and musl `linux-x64`/`linux-arm64`, so alpine's smaller size costs
nothing here), Postgres 17 (matches `docker-compose.yml`/CI), Argo CD +
Helm (`bjw-s-labs/app-template` chart, pinned `3.7.3` — the same version
every other generic app in `homelab-docker` uses) + Traefik `IngressRoute`
+ CrowdSec bouncer middleware (no Authelia — badgery has its own
multi-tenant session auth, same reasoning `vaultwarden-and-authelia.yaml`
documents for Vaultwarden).

**Spec:** `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md`
(Phase 4 section — Task 7 of this plan updates it in place to describe the
k8s/GitOps approach actually taken, since the original text described a
VPS + SSH design that this plan deliberately does not build).

## Global Constraints

- **Two repo roots** — every task states which one it's in. Do not assume
  a shared working directory across tasks:
  - `badgery-app` repo root: `/home/aaron/Projects/badgery-app`
  - `homelab-docker` repo root: `/home/aaron/Projects/homelab-docker`
- **badgery-app branch:** `phase-4-docker-and-k8s-deploy`, off up-to-date
  `main`. One commit per task (Tasks 1–7).
- **homelab-docker branch:** `phase-4-badgery`, off up-to-date `main`. One
  commit per task (Tasks 8–12). **Do not push or merge this branch to
  `main` without Aaron's explicit go-ahead** — `main` is the live GitOps
  deploy target for a real personal cluster (`prune: true`, `selfHeal:
true`); a merge takes effect on real infrastructure automatically, with
  no staging environment. Open a PR for review instead of merging
  directly, same as this repo's own habit, even though that repo's own
  process doesn't strictly require one.
- **No real secrets in either repo, ever.** `homelab-docker` enforces this
  with a `gitleaks` pre-commit hook; don't try to route around it. Every
  task that needs a real value (a DB password, `SESSION_SECRET`) writes
  the *command* to create it via `kubectl`, in `SETUP.md`, for Aaron to
  run himself — never a literal secret in a committed file.
- **direnv/flake are already active in `badgery-app`** (Phase-3-era
  setup, Node 22) — no `nvm`/podman-container workaround needed for `npm`
  commands in this repo; just run them normally from the repo root. This
  host has **no `docker` binary, only `podman`** — every `docker build`/
  `docker run` instruction below is `podman build`/`podman run`
  (drop-in compatible CLI).
- **GPG gotcha (badgery-app only):** commits require GPG signing; the
  pinentry dialog periodically times out in non-interactive/subagent
  shells. If a commit fails with a pinentry timeout, do not fall back to
  `--no-gpg-sign` — report it and let the controller (a session with
  terminal access) retry the same `git commit`.
- **`npm run check`, `npm run lint`, and `npm test` must stay green after
  every badgery-app task** (Tasks 1–7). `npm run build` must succeed after
  Tasks 2 and onward (Task 2 changes the exact module graph `esbuild`
  bundles for the server entrypoint).
- Out of scope for this phase: the badge-progress flat-percentage storage
  bug (documented, pre-existing, unrelated), Dependabot/scheduled-agent
  automation (that's Phase 5), and automating the image-tag bump
  (deliberately deferred per Aaron's choice above).

---

## Part A — badgery-app

### Task 1: Protect the `session` table from `db:push`

**Files:**

- Modify: `drizzle.config.ts`

**Context:** `session` is created and owned entirely at runtime by
`connect-pg-simple` (`server/app.ts`, `createTableIfMissing: true`) — it's
deliberately not declared in `shared/schema.ts`. `drizzle-kit push --force`
reconciles the *entire* target database against `shared/schema.ts`, so
without an explicit exclusion it drops `session` (`DROP TABLE "session"
CASCADE`) every time, since as far as drizzle-kit is concerned it's an
"extra" table nobody declared. This is pre-existing and was ruled benign
in dev (Phase 3c) because the table self-heals on the next server
*restart* — but Phase 4 is the first thing in this project that could run
`db:push` against a database behind a **live, already-running** app
(Task 11's one-time schema push), where a mid-session drop would error out
every in-flight session write until someone notices and restarts the pod.
Fix it now, before that path exists for real.

- [ ] **Step 1: Add the exclusion**

Edit `drizzle.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./db/migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // connect-pg-simple owns this table at runtime (server/app.ts,
  // createTableIfMissing: true) — it's deliberately not declared in
  // shared/schema.ts, and without this exclusion `db:push --force`
  // treats it as an orphaned table and drops it on every push.
  tablesFilter: ["!session"],
  verbose: true,
});
```

- [ ] **Step 2: Verify the table survives a push**

From the repo root, with the dev Postgres container running
(`podman start badgery-app_postgres_1` if it's stopped) and the dev server
started at least once so `session` exists:

```bash
psql postgres://badgery:badgery@localhost:5432/badgery -c '\dt session'
```

Expect the table listed. Then:

```bash
npm run db:push
```

```bash
psql postgres://badgery:badgery@localhost:5432/badgery -c '\dt session'
```

Expect the table **still listed** (previously this would have printed "Did
not find any relation named session").

- [ ] **Step 3: Commit**

```bash
git add drizzle.config.ts
git commit -m "fix: exclude connect-pg-simple's session table from db:push"
```

---

### Task 2: Stop the production build from crashing on a missing `vite` devDependency

**Files:**

- Create: `server/static.ts`
- Modify: `server/vite.ts`
- Modify: `server/index.ts`

**Context:** `server/index.ts` currently has a **static** top-level import
of `./vite` (`import { setupVite, serveStatic } from "./vite"`), and
`server/vite.ts` itself has a static top-level import of the real `vite`
package. Static ES module imports execute their target module's top-level
code immediately at process boot, before any runtime branch — so even
though `setupVite()` is only ever *called* inside `if (app.get("env") ===
"development")`, the `vite` package is imported unconditionally on every
boot, dev or production. `vite` is a `devDependency`; a production image
built with `npm ci --omit=dev` (Task 4's Dockerfile) will not have it
installed, and the process will crash on startup with `MODULE_NOT_FOUND`
before ever reaching the line that checks `NODE_ENV`.

The fix: `serveStatic` doesn't touch `vite` at all, so pull it into its
own module that's safe to import unconditionally; make the `vite`-touching
half (`setupVite`, still in `server/vite.ts`) a **dynamic** import that
only happens inside the dev branch.

- [ ] **Step 1: Extract `serveStatic` into its own file**

Create `server/static.ts`:

```ts
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
```

- [ ] **Step 2: Remove `serveStatic` from `server/vite.ts`**

`server/vite.ts` should now contain only `setupVite` (still importing the
real `vite` package at the top — that's fine now, since this whole module
will only ever be dynamically imported from the dev branch):

```ts
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
```

(The `express` import stays — it's still needed for the `Express` type on
`setupVite`'s parameter.)

- [ ] **Step 3: Make `server/index.ts` import `vite` only in the dev branch**

```ts
import { createApp } from "./app";
import { config } from "./config";
import { serveStatic } from "./static";
import { log } from "./logger";

(async () => {
  const { app, httpServer } = await createApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }

  // Serves both the API and the client on one port. Defaults to 5000
  // (config.port) — override with PORT if you need a different one.
  const port = config.port;
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

- [ ] **Step 4: Typecheck and run the full suite**

```bash
npm run check
```

Expect: PASS.

```bash
npm test
```

Expect: PASS (unchanged — this is a boot-path change, not a route/behavior
change).

- [ ] **Step 5: Prove the production path no longer needs `vite` installed**

```bash
npm run build
```

Temporarily rename the `vite` package out of the way to simulate a
`--omit=dev` install, then boot the built server exactly the way
production does:

```bash
mv node_modules/vite node_modules/vite.bak
NODE_ENV=production PORT=5050 DATABASE_URL=postgres://badgery:badgery@localhost:5432/badgery SESSION_SECRET=test-secret-at-least-32-characters-long node dist/index.js &
sleep 1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5050/
kill %1
mv node_modules/vite.bak node_modules/vite
```

Expect the `curl` line to print `200` (or another real HTTP status — the
point is the process didn't crash with `MODULE_NOT_FOUND` before ever
binding the port). Before this task's fix, this exact repro crashes
immediately. Restore `node_modules/vite` (last line) before moving on —
don't skip it, `npm run dev` needs it.

- [ ] **Step 6: Commit**

```bash
git add server/static.ts server/vite.ts server/index.ts
git commit -m "fix: dynamic-import vite so a --omit=dev production install doesn't crash on boot"
```

---

### Task 3: Add a `/healthz` endpoint

**Files:**

- Modify: `server/app.ts`
- Modify: `tests/health.test.ts`

**Context:** Needed both as the k8s liveness/readiness probe target
(Task 9) and as the fastest way to confirm the whole stack (app → DB) is
actually up after a deploy. Checks real DB connectivity (`SELECT 1`
through the existing `pool` from `@db`) rather than just "the process is
alive" — a wedged DB connection is exactly the failure mode you want k8s
to notice and restart the pod for.

Note: `tests/health.test.ts` already exists but (despite its name) is the
test-harness login/session smoke test, not a health-endpoint test — this
task adds a new `describe` block alongside it rather than replacing
anything.

- [ ] **Step 1: Write the failing test**

Add to `tests/health.test.ts` (new `describe` block, alongside the
existing one — don't remove the existing smoke test):

```ts
describe("GET /healthz", () => {
  it("returns 200 when the database is reachable", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

(This reuses the same `app` from the file's existing `beforeAll`.)

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test -- tests/health.test.ts
```

Expect: FAIL — `GET /healthz` currently 404s (no such route registered).

- [ ] **Step 3: Add the route**

Edit `server/app.ts` — add the health check right after body-parsing
middleware and *before* session middleware (a k8s probe hitting this
every few seconds shouldn't create session-store overhead on every hit):

```ts
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get("/healthz", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("Health check failed:", err);
      res.status(503).json({ status: "error" });
    }
  });

  // Add session middleware
  const PgSession = connectPgSimple(session);
```

(`pool` is already imported from `@db` at the top of `server/app.ts` — no
new import needed.)

- [ ] **Step 4: Run the test again and confirm it passes**

```bash
npm test -- tests/health.test.ts
```

Expect: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and lint**

```bash
npm run check && npm run lint && npm test
```

Expect: all PASS.

- [ ] **Step 6: Commit**

```bash
git add server/app.ts tests/health.test.ts
git commit -m "feat: add /healthz endpoint for k8s liveness/readiness probes"
```

---

### Task 4: Add a multi-stage Dockerfile

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`

**Context:** `argon2`'s prebuilt binaries (`node_modules/argon2/prebuilds/`)
cover both `glibc` and `musl` for `linux-x64`/`linux-arm64`, so there's no
native-compile risk either way — `node:22-alpine` is used for image size.
Node version pinned to match `flake.nix`/CI (currently 22) — keep these in
sync the same way `flake.nix`'s own comment already asks for.

- [ ] **Step 1: Write the Dockerfile**

Create `Dockerfile`:

```dockerfile
# Keep the Node major version in sync with flake.nix / .github/workflows/ci.yml (currently 22).
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 5000

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Write `.dockerignore`**

Create `.dockerignore`:

```
node_modules
dist
.git
.direnv
.env
.env.local
tests
docs
*.md
.superpowers
```

- [ ] **Step 3: Build the image**

```bash
podman build -t badgery-app:local .
```

Expect: builds successfully, both stages complete.

- [ ] **Step 4: Run it against the real dev Postgres and smoke-test it**

```bash
podman start badgery-app_postgres_1
```

(or `docker compose up -d` if that's available in whatever environment
runs this step — this host only has `podman`, see Global Constraints)

```bash
podman run --rm --network host \
  -e DATABASE_URL=postgres://badgery:badgery@localhost:5432/badgery \
  -e SESSION_SECRET=test-secret-at-least-32-characters-long \
  -e PORT=5050 \
  badgery-app:local &
sleep 2
curl -s http://localhost:5050/healthz
kill %1
```

Expect the `curl` line to print `{"status":"ok"}`. This is the real,
end-to-end proof that Task 2's fix works — the image was built with
`npm run build` then `npm ci --omit=dev`, no `vite` package present at
all, and it still boots and serves traffic.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add multi-stage Dockerfile"
```

---

### Task 5: Add the CI build+push workflow

**Files:**

- Create: `.github/workflows/build.yml`

**Context:** Mirrors `~/Projects/vikunja-tagger/.github/workflows/build.yml`
exactly — that's the proven pattern already running for another
`acwilsondev` app deployed into the same cluster. Triggers on push to
`main` only (not PRs) — by the time a commit reaches `main`,
`.github/workflows/ci.yml` has already gated it as a required PR check, so
this workflow doesn't re-run typecheck/lint/test itself, same as
`vikunja-tagger`'s.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/build.yml`:

```yaml
name: build

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/badgery-app:latest
            ghcr.io/${{ github.repository_owner }}/badgery-app:${{ github.sha }}
```

- [ ] **Step 2: Note the verification limit**

This workflow can't be exercised locally — it only proves itself once
merged to `main` and run by GitHub Actions (it needs the real
`GITHUB_TOKEN`/`ghcr.io` permissions of that context). Nothing to run
here; this is a documentation step, not a gap to fix.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: build and push badgery-app image to GHCR on push to main"
```

---

### Task 6: Update `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "What this is" summary line**

Find:

```
Phases 0–3b are done (server restructure into
feature modules, client type cleanup); Docker/CD (Phase 4) is not done yet —
`docker-compose.yml` only runs Postgres, there's no app container/Dockerfile.
```

Replace with:

```
Phases 0–3d are done (server restructure into feature modules, client type
cleanup, OpenAPI rewrite). Phase 4 (Docker + k8s GitOps deploy) is done —
see "Deployment" below; Phase 5 (agentic layer) is not done yet.
```

- [ ] **Step 2: Add a "Deployment" section**

Add after the "### Tests" / "### CI" sections, before "## Architecture":

```markdown
## Deployment

`Dockerfile` builds a production image (`node:22-alpine`, multi-stage:
`npm run build` in a builder stage, `npm ci --omit=dev` + the built
`dist/` in the runtime stage). `.github/workflows/build.yml` builds and
pushes `ghcr.io/acwilsondev/badgery-app:latest` and
`ghcr.io/acwilsondev/badgery-app:<commit sha>` on every push to `main`.

The image is deployed to Aaron's personal k3s homelab cluster via Argo CD
GitOps — the actual deploy config (Helm values, Postgres, Traefik
ingress, secrets setup) lives in a separate repo,
`~/Projects/homelab-docker` (`k8s/apps/badgery/` and
`k8s/apps/badgery-postgres/`), not in this one. Promoting a new image
build is a manual step there (bump the pinned image tag in
`k8s/apps/badgery/values.yaml`, push) — see that repo's
`k8s/apps/badgery/SETUP.md`.

`GET /healthz` checks real DB connectivity (`SELECT 1`) and is what the
k8s liveness/readiness probes hit — not just a process-alive check.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Phase 4 Docker/deployment setup in CLAUDE.md"
```

---

### Task 7: Update the modernization spec's Phase 4 section

**Files:**

- Modify: `docs/superpowers/specs/2026-07-13-agentic-modernization-design.md`

**Context:** The spec was written before Aaron had a k3s homelab cluster
to deploy into and describes a "VPS + docker-compose + SSH-based GitHub
Actions CD" design this plan deliberately does not build. Update it in
place so a future session reading the spec sees what was actually done,
not a stale plan.

- [ ] **Step 1: Replace the Phase 4 section**

Find:

```
### Phase 4 — Docker + CD

- Multi-stage Dockerfile (build → slim runtime image).
- docker-compose for the VPS: app + Postgres + volume; `.env`-driven config.
- `/healthz` endpoint (checks DB connectivity) used by compose healthcheck and
  the deploy workflow.
- GitHub Actions CD: on merge to `main`, build image, deploy to VPS over SSH,
  verify health.
```

Replace with:

```
### Phase 4 — Docker + Kubernetes (GitOps) deploy

Revised from the original VPS/docker-compose/SSH-CD design once Aaron's
existing k3s homelab cluster (`~/Projects/homelab-docker`, a separate
GitOps repo) became the actual deploy target — see
`docs/superpowers/plans/2026-08-22-phase-4-docker-and-k8s-deploy.md` for
the decision and full detail.

- Multi-stage Dockerfile (`node:22-alpine`, build → slim runtime image).
- `/healthz` endpoint (checks DB connectivity) — the k8s liveness/readiness
  probe target.
- GitHub Actions: on push to `main`, build and push
  `ghcr.io/acwilsondev/badgery-app` (tagged `latest` and by commit SHA).
- Deploy config lives in `homelab-docker`, not here: an Argo CD child
  `Application` per bjw-s-labs/app-template + a dedicated Postgres
  `Application` (same split `matrix-postgresql`/`matrix-synapse` uses),
  both in a `badgery` namespace; a Traefik `IngressRoute` at
  `badges.anarchy.pizza` with the CrowdSec bouncer middleware but no
  Authelia gate (badgery has its own multi-tenant session auth, same
  reasoning as Vaultwarden). Image promotion is a manual pinned-tag bump
  in that repo, not automatic — Aaron's explicit choice, to avoid adding
  cross-repo CI credentials for a one-app cluster.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-13-agentic-modernization-design.md
git commit -m "docs: update spec's Phase 4 section to describe the k8s/GitOps approach taken"
```

---

## Part B — homelab-docker

All tasks in this part are in `/home/aaron/Projects/homelab-docker`, on
branch `phase-4-badgery`. Verification is `helm template` (that repo has
no CI), per its own `CLAUDE.md`. **None of these tasks run `kubectl`
against the live cluster** — that's Aaron's job, documented in Task 11's
`SETUP.md`.

### Task 8: Add the `badgery-postgres` Application

**Files:**

- Create: `k8s/apps/badgery-postgres/application.yaml`
- Create: `k8s/apps/badgery-postgres/values.yaml`

**Interfaces:**

- Produces: a Postgres 17 instance reachable in-cluster at
  `badgery-postgres.badgery.svc.cluster.local:5432` (Service name always
  matches the Argo CD `Application`'s `metadata.name`, confirmed by every
  existing app in this repo — e.g. `vikunja-tagger` → Service
  `vikunja-tagger`). Task 9 depends on this exact hostname.

**Context:** Same pattern as `k8s/apps/matrix-postgresql/` — a dedicated
Postgres per app rather than a shared instance, in the *same namespace*
as the app that uses it (`matrix-postgresql`'s `Application` targets
namespace `matrix`, not its own `matrix-postgresql` namespace — mirrored
here: this targets `badgery`, not `badgery-postgres`). Version 17 to match
`badgery-app`'s own `docker-compose.yml`/CI.

- [ ] **Step 1: Write the Application manifest**

Create `k8s/apps/badgery-postgres/application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: badgery-postgres
  namespace: argocd
spec:
  project: default
  sources:
    - repoURL: https://bjw-s-labs.github.io/helm-charts
      chart: app-template
      targetRevision: 3.7.3
      helm:
        valueFiles:
          - $values/k8s/apps/badgery-postgres/values.yaml
    - repoURL: git@github.com:acwilsondev/homelab-docker.git
      targetRevision: main
      ref: values
  destination:
    server: https://kubernetes.default.svc
    namespace: badgery
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 2: Write the values file**

Create `k8s/apps/badgery-postgres/values.yaml`:

```yaml
controllers:
  main:
    containers:
      main:
        image:
          repository: postgres
          tag: "17"
        envFrom:
          - secretRef:
              name: badgery-postgres-secrets
        resources:
          requests:
            cpu: 10m
            memory: 64Mi
          limits:
            memory: 512Mi

service:
  main:
    controller: main
    ports:
      postgres:
        port: 5432

persistence:
  data:
    type: persistentVolumeClaim
    accessMode: ReadWriteOnce
    size: 5Gi
    globalMounts:
      - path: /var/lib/postgresql
```

- [ ] **Step 3: Validate the rendered manifest**

```bash
helm template badgery-postgres oci://ghcr.io/bjw-s-labs/helm-charts/app-template \
  --version 3.7.3 -f k8s/apps/badgery-postgres/values.yaml
```

Expect: renders cleanly (Deployment, Service, PVC), no errors. Eyeball
the output — `image: postgres:17`, a `Service` on port 5432, a PVC
requesting 5Gi.

- [ ] **Step 4: Commit**

```bash
git add k8s/apps/badgery-postgres/
git commit -m "feat: add badgery-postgres Argo CD application"
```

---

### Task 9: Add the `badgery` Application

**Files:**

- Create: `k8s/apps/badgery/application.yaml`
- Create: `k8s/apps/badgery/values.yaml`

**Interfaces:**

- Consumes: `badgery-postgres.badgery.svc.cluster.local:5432` (Task 8).
- Produces: a Service named `badgery` on port 5000 in namespace `badgery`.
  Task 10 depends on this exact Service name/port.

**Context:** Same shape as `k8s/apps/vikunja-tagger/` — a generic
container with no dedicated upstream Helm chart, so
`bjw-s-labs/app-template` is the chart (same version pin every other app
in this repo uses, `3.7.3`). `DATABASE_URL` and `SESSION_SECRET` come
entirely from a `badgery-secrets` Secret applied by hand
(`kubectl create secret`, documented in Task 11's `SETUP.md`) — never
composed here from other values, same as `vikunja-tagger-secrets`.

- [ ] **Step 1: Write the Application manifest**

Create `k8s/apps/badgery/application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: badgery
  namespace: argocd
spec:
  project: default
  sources:
    - repoURL: https://bjw-s-labs.github.io/helm-charts
      chart: app-template
      targetRevision: 3.7.3
      helm:
        valueFiles:
          - $values/k8s/apps/badgery/values.yaml
    - repoURL: git@github.com:acwilsondev/homelab-docker.git
      targetRevision: main
      ref: values
  destination:
    server: https://kubernetes.default.svc
    namespace: badgery
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 2: Write the values file**

Create `k8s/apps/badgery/values.yaml`:

```yaml
controllers:
  main:
    containers:
      main:
        image:
          repository: ghcr.io/acwilsondev/badgery-app
          # Bumped by hand to a real commit SHA after the first CI build —
          # see SETUP.md's "Updating after a badgery-app release". Pinned
          # to a SHA (not "latest") from day one so Argo CD's git-diff
          # sync has something to react to on every future bump.
          tag: "latest"
          pullPolicy: IfNotPresent
        env:
          NODE_ENV: "production"
          PORT: "5000"
        envFrom:
          - secretRef:
              name: badgery-secrets
        resources:
          requests:
            cpu: 10m
            memory: 128Mi
          limits:
            memory: 512Mi

service:
  main:
    controller: main
    ports:
      http:
        port: 5000
```

- [ ] **Step 3: Validate the rendered manifest**

```bash
helm template badgery oci://ghcr.io/bjw-s-labs/helm-charts/app-template \
  --version 3.7.3 -f k8s/apps/badgery/values.yaml
```

Expect: renders cleanly, `image: ghcr.io/acwilsondev/badgery-app:latest`,
a `Service` named `badgery` on port 5000, an `envFrom` referencing
`badgery-secrets`.

- [ ] **Step 4: Commit**

```bash
git add k8s/apps/badgery/application.yaml k8s/apps/badgery/values.yaml
git commit -m "feat: add badgery Argo CD application"
```

---

### Task 10: Add the Traefik IngressRoute

**Files:**

- Create: `k8s/apps/ingress/badgery.yaml`

**Interfaces:**

- Consumes: Service `badgery` on port 5000, namespace `badgery` (Task 9).

**Context:** Matches `k8s/apps/ingress/vaultwarden-and-authelia.yaml`'s
pattern for Vaultwarden exactly — badgery has its own multi-tenant
session-based login (orgs create their own users), so it's routed through
Traefik + the CrowdSec bouncer middleware only, deliberately **not**
behind `authelia-forwardauth`. Subdomain: `badges.anarchy.pizza` (Aaron's
choice), covered by the existing shared multi-SAN certificate — no new
`Certificate` resource needed (see `k8s/apps/ingress/certificate.yaml`
and `tls-store.yaml`).

- [ ] **Step 1: Write the IngressRoute**

Create `k8s/apps/ingress/badgery.yaml`:

```yaml
# Badgery has its own multi-tenant, session-based auth (organizations
# create their own users) — deliberately not behind authelia-forwardauth,
# same reasoning as vaultwarden-and-authelia.yaml: it relies on its own
# login + CrowdSec only.
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: badgery
  namespace: badgery
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`badges.anarchy.pizza`)
      kind: Rule
      services:
        - name: badgery
          port: 5000
      middlewares:
        - name: crowdsec-bouncer
          namespace: traefik
  tls: {}
```

- [ ] **Step 2: Sanity-check against the existing pattern**

```bash
diff <(grep -A2 'match:\|middlewares:' k8s/apps/ingress/badgery.yaml) \
     <(grep -A2 'match:\|middlewares:' k8s/apps/ingress/vaultwarden-and-authelia.yaml | head -6)
```

Expect the `middlewares:`/`- name: crowdsec-bouncer` / `namespace:
traefik` shape to line up (the `match:` host obviously differs — that's
expected).

- [ ] **Step 3: Commit**

```bash
git add k8s/apps/ingress/badgery.yaml
git commit -m "feat: route badges.anarchy.pizza to badgery via Traefik"
```

---

### Task 11: Write `SETUP.md`

**Files:**

- Create: `k8s/apps/badgery/SETUP.md`

**Context:** Same purpose as `k8s/apps/vikunja-tagger/SETUP.md` — the
manual, non-git-tracked wiring: namespace + secrets, DNS, the one-time
schema push, and how to promote a new image build. This task only writes
the document; none of its commands are run as part of this plan.

- [ ] **Step 1: Write the file**

Create `k8s/apps/badgery/SETUP.md`:

````markdown
# badgery setup

Deploys [badgery-app](https://github.com/acwilsondev/badgery-app) (kept
as its own repo/image, not part of this one — see that repo's
README/CLAUDE.md for what it is). This file is just the wiring: namespace
+ secrets, DNS, the one-time schema push, and the manual image-tag bump
this app currently needs after each release (same pattern as
`vikunja-tagger` — see that app's `SETUP.md`).

## 1. Create the namespace and secrets

Not tracked in git, same as every other app's secrets in this stack:

```bash
kubectl create namespace badgery
kubectl -n badgery create secret generic badgery-postgres-secrets \
  --from-literal=POSTGRES_USER=badgery \
  --from-literal=POSTGRES_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=POSTGRES_DB=badgery
```

Save the generated `POSTGRES_PASSWORD` (`kubectl -n badgery get secret
badgery-postgres-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64
-d` if you lose it) — you need it in the next command's `DATABASE_URL`.

```bash
kubectl -n badgery create secret generic badgery-secrets \
  --from-literal=DATABASE_URL="postgres://badgery:<POSTGRES_PASSWORD from above>@badgery-postgres.badgery.svc.cluster.local:5432/badgery" \
  --from-literal=SESSION_SECRET="$(openssl rand -hex 32)"
```

## 2. Point DNS at the server

Add an A/AAAA record for `badges.anarchy.pizza` pointing at the same
public IP as every other app in this stack (see the root README's "Point
DNS at your server" step) — it's covered by the existing shared multi-SAN
certificate/`TLSStore`, no new `Certificate` resource needed.

## 3. Push the schema

`badgery-postgres` starts out empty — badgery-app has no migration runner
wired into its own startup (see its `CLAUDE.md`: schema changes go
through `npm run db:push` against a resettable dev DB, no migration
workflow exists yet). Push the baseline schema once, from a machine with
`kubectl` access, using badgery-app's own checkout:

```bash
kubectl -n badgery port-forward svc/badgery-postgres 5432:5432
```

then, in a second terminal, from badgery-app's repo root:

```bash
DATABASE_URL="postgres://badgery:<POSTGRES_PASSWORD>@localhost:5432/badgery" npm run db:push
```

## 4. Verify Argo CD sync and image pull

```bash
kubectl -n badgery get pods
kubectl -n badgery logs -l app.kubernetes.io/name=badgery -f
```

Then confirm the health check from outside the cluster:

```bash
curl -s https://badges.anarchy.pizza/healthz
```

Expect `{"status":"ok"}`.

## Updating after a badgery-app release

badgery-app's own CI (`.github/workflows/build.yml`) builds and pushes
`ghcr.io/acwilsondev/badgery-app:<commit sha>` on every push to `main`,
but does **not** update this repo automatically — a deliberate choice
(see badgery-app's
`docs/superpowers/plans/2026-08-22-phase-4-docker-and-k8s-deploy.md`, to
avoid adding cross-repo CI credentials for a one-app cluster). After a
release you want deployed:

1. Get the new commit's SHA from badgery-app's `main` branch.
2. Edit `k8s/apps/badgery/values.yaml`'s `tag:` to that SHA.
3. Commit and push. Argo CD sees the git diff and syncs/rolls out
   automatically — no manual `kubectl rollout restart` needed, unlike
   `vikunja-tagger`'s `latest`-tag setup. Pinning to a SHA from day one
   (rather than starting on `latest` the way `vikunja-tagger` originally
   did) avoids that gotcha entirely — see
   `k8s/apps/vikunja-tagger/SETUP.md`'s "Updating after a source change"
   section for why that step exists there.

## Troubleshooting

If pods are stuck `ImagePullBackOff`: the image hasn't been built yet, or
the tag in `values.yaml` doesn't match a real pushed tag — check
`https://github.com/acwilsondev/badgery-app/pkgs/container/badgery-app`
for what's actually available.

If `/healthz` returns `503` (or times out): check
`kubectl -n badgery logs -l app.kubernetes.io/name=badgery` for a DB
connection error first — most likely `badgery-secrets`' `DATABASE_URL`
has the wrong password, or `badgery-postgres` isn't up yet
(`kubectl -n badgery get pods`).
````

- [ ] **Step 2: Commit**

```bash
git add k8s/apps/badgery/SETUP.md
git commit -m "docs: add badgery setup instructions"
```

---

### Task 12: Update the root README

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a row to the "Current Apps" table**

Find the table row for Vaultwarden:

```
| Vaultwarden | `vault.${DOMAIN}` | None yet (candidate) |
```

Add a new row directly after it:

```
| Vaultwarden | `vault.${DOMAIN}` | None yet (candidate) |
| Badgery | `badges.${DOMAIN}` | None (own multi-tenant login) |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: list badgery in the current-apps table"
```

---

## Final check (both repos)

- [ ] **badgery-app:** `npm run check && npm run lint && npm test && npm run build` all pass on the tip of `phase-4-docker-and-k8s-deploy`; `podman build -t badgery-app:local .` succeeds; the Task 4 Step 4 smoke test (`curl /healthz` → `{"status":"ok"}`) passes against the built image.
- [ ] **homelab-docker:** `helm template` (Tasks 8 and 9's Step 3 commands) both render cleanly on the tip of `phase-4-badgery`. No `kubectl` command from `SETUP.md` has been run — that's Aaron's step, after reviewing the PR.
- [ ] Report back to Aaron with both branches ready for review, and flag explicitly that merging `homelab-docker`'s branch is the one step in this whole plan that touches the live cluster.
