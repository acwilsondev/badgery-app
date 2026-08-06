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
