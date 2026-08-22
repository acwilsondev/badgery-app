import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";
import { createTestOrganization, createTestUser } from "./support/fixtures";

describe("test harness smoke test", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("registers, logs in, and reads the current user through a real session", async () => {
    const org = await createTestOrganization();
    const user = await createTestUser({ organizationIds: [org.id] });

    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: user.password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.username).toBe(user.username);

    const meRes = await agent.get("/api/v1/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(user.id);
  });

  it("rejects requests with no session", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("GET /healthz", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("returns 200 when the database is reachable", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
