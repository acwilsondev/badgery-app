import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";
import { createTestUser, uniqueSuffix } from "./support/fixtures";

describe("POST /api/v1/auth/register", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("creates a user with only self-service fields", async () => {
    const suffix = uniqueSuffix();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        username: `newuser_${suffix}`,
        password: "hunter22",
        name: "New User",
        email: `newuser_${suffix}@test.dev`,
      });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe(`newuser_${suffix}`);
    expect(res.body.role).toBe("user");
    expect(res.body).not.toHaveProperty("password");
  });

  it("ignores a client-supplied role/organizationId (privilege escalation)", async () => {
    const suffix = uniqueSuffix();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        username: `escalator_${suffix}`,
        password: "hunter22",
        name: "Escalator",
        email: `escalator_${suffix}@test.dev`,
        role: "admin",
        organizationId: 999999,
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("user");
    expect(res.body.organizationId).toBeNull();
  });

  it("rejects a duplicate username with 400", async () => {
    const suffix = uniqueSuffix();
    const body = {
      username: `dup_${suffix}`,
      password: "hunter22",
      name: "Dup",
      email: `dup_${suffix}@test.dev`,
    };
    const first = await request(app).post("/api/v1/auth/register").send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...body, email: `dup2_${suffix}@test.dev` });
    expect(second.status).toBe(400);
  });

  it("rejects a body missing required fields with 400 and a zod errors array", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "ab" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

describe("POST /api/v1/auth/login", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("logs in with correct credentials and sets a session cookie", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(user.username);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/connect\.sid=/);
  });

  it("rejects a wrong password with 401", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects a nonexistent username with 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: `nobody_${uniqueSuffix()}`, password: "whatever123" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing password with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "someone" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

describe("GET /api/v1/auth/me and POST /api/v1/auth/logout", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a session, and 401 after logout", async () => {
    const user = await createTestUser();
    const agent = request.agent(app);
    await agent
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: user.password });

    const meRes = await agent.get("/api/v1/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(user.id);

    const logoutRes = await agent.post("/api/v1/auth/logout");
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await agent.get("/api/v1/auth/me");
    expect(meAfterLogout.status).toBe(401);
  });
});

// Isolated in its own app/describe block: it deliberately exhausts the
// in-memory rate limiter, which would otherwise break every other login
// test sharing the same app instance.
describe("login rate limiting", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("returns 429 after 10 login attempts in the window", async () => {
    const user = await createTestUser();
    const results: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ username: user.username, password: "wrong-password" });
      results.push(res.status);
    }
    expect(results.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(results[10]).toBe(429);
  });
});

// Also isolated: exhausts the register limiter (5/hour).
describe("register rate limiting", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("returns 429 after 5 register attempts in the window", async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const suffix = uniqueSuffix();
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          username: `ratelimit_${suffix}`,
          password: "hunter22",
          name: "Rate Limit",
          email: `ratelimit_${suffix}@test.dev`,
        });
      results.push(res.status);
    }
    expect(results.slice(0, 5)).toEqual(Array(5).fill(201));
    expect(results[5]).toBe(429);
  });
});
