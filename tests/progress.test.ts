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

  it("documents a known bug: POST progress silently no-ops for badges without pre-configured metrics, so auto-award never fires", async () => {
    // KNOWN BUG (see docs/superpowers/specs/2026-07-13-agentic-modernization-design.md
    // (Phase 3 section — "Badge progress persistence is broken")):
    // storage.createOrUpdateBadgeProgress only persists progress against the
    // per-metric badgeMetrics/metrics/progress model. The route (and the real
    // client, client/src/components/badge-progress-dialog.tsx) send a flat
    // 0-100 `progress` percentage instead, which has no backing column
    // anywhere. For any badge with no badgeMetrics rows configured (the
    // normal case for badges created through the UI), the POST silently
    // no-ops: it returns 200 with a `null` body, nothing is persisted, and
    // the 100%-auto-award check never fires. This test locks in that CURRENT
    // behavior so a real fix (tracked for Phase 3) has a regression test to
    // update rather than a silent behavior change.
    const org = await createTestOrganization();
    const badge = await createTestBadge(org.id, { requiresProgress: true });
    const manager = await createTestUser({
      role: "manager",
      organizationIds: [org.id],
    });
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, manager.username, manager.password);

    const complete = await agent
      .post(`/api/v1/badges/${badge.id}/progress/${member.id}`)
      .send({ progress: 100 });
    expect(complete.status).toBe(200);
    expect(complete.body).toBeNull();

    const awarded = await agent.get(
      `/api/v1/organizations/${org.id}/awarded-badges`,
    );
    expect(awarded.status).toBe(200);
    expect(
      awarded.body.some(
        (a: { badgeId: number; userId: number }) =>
          a.badgeId === badge.id && a.userId === member.id,
      ),
    ).toBe(false);
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

  it("403s a stranger reading another user's progress; owner gets 404 since nothing was ever persisted (known bug)", async () => {
    // See the "known bug" note above: the prior POST is a documented no-op,
    // so there is no progress row for the owner to read either — 404, not 200.
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
    expect(ownRes.status).toBe(404);

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
