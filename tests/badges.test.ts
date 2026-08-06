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

    const listRes = await agent.get(`/api/v1/organizations/${org.id}/categories`);
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
