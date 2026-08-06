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
