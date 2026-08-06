import { describe, it, expect, beforeAll } from "vitest";
import type { Express } from "express";
import { createApp } from "../server/app";
import { createTestOrganization, createTestUser, loginAs } from "./support/fixtures";

describe("users", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("GET org users 403s for a user outside the org", async () => {
    const org = await createTestOrganization();
    await createTestUser({ organizationIds: [org.id] });
    const outsider = await createTestUser();
    const agent = await loginAs(app, outsider.username, outsider.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}/users`);
    expect(res.status).toBe(403);
  });

  it("GET org users 200s and lists members for a member", async () => {
    const org = await createTestOrganization();
    const member = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, member.username, member.password);

    const res = await agent.get(`/api/v1/organizations/${org.id}/users`);
    expect(res.status).toBe(200);
    expect(res.body.map((u: { id: number }) => u.id)).toContain(member.id);
  });

  it("GET /users/:id 200s for the caller's own profile", async () => {
    const user = await createTestUser();
    const agent = await loginAs(app, user.username, user.password);

    const res = await agent.get(`/api/v1/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body).not.toHaveProperty("password");
  });

  it("GET /users/:id 403s across users with no shared organization", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const userA = await createTestUser({ organizationIds: [orgA.id] });
    const userB = await createTestUser({ organizationIds: [orgB.id] });
    const agent = await loginAs(app, userA.username, userA.password);

    const res = await agent.get(`/api/v1/users/${userB.id}`);
    expect(res.status).toBe(403);
  });

  it("GET /users/:id 200s across users who share an organization", async () => {
    const org = await createTestOrganization();
    const userA = await createTestUser({ organizationIds: [org.id] });
    const userB = await createTestUser({ organizationIds: [org.id] });
    const agent = await loginAs(app, userA.username, userA.password);

    const res = await agent.get(`/api/v1/users/${userB.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userB.id);
  });

  it("GET /users/:id 200s for an admin viewing any user", async () => {
    const other = await createTestUser();
    const admin = await createTestUser({ role: "admin" });
    const agent = await loginAs(app, admin.username, admin.password);

    const res = await agent.get(`/api/v1/users/${other.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(other.id);
  });
});
