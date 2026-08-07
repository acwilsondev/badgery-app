import crypto from "node:crypto";
import argon2 from "argon2";
import request from "supertest";
import type { Express } from "express";
import * as storage from "../../server/storage";
import { createUser } from "../../server/features/users/service";
import {
  createOrganization,
  createBadgeCategory,
} from "../../server/features/organizations/service";

// Fixtures are intentionally never cleaned up (no afterEach truncation).
// Uniqueness (uniqueSuffix()) is what prevents collisions between tests;
// the whole database is reset once per `npm test` run by
// tests/globalSetup.ts. Adding cleanup logic here would fight that design
// and risks deleting another test's still-in-use fixtures if tests ever
// run concurrently.

export function uniqueSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

export const TEST_PASSWORD = "test-password-123";

export async function createTestOrganization(
  overrides: { name?: string; description?: string } = {},
) {
  return createOrganization({
    name: overrides.name ?? `Test Org ${uniqueSuffix()}`,
    description:
      overrides.description ?? "Fixture organization for integration tests",
  });
}

export async function createTestUser(
  options: {
    organizationIds?: number[];
    role?: "user" | "manager" | "admin";
    username?: string;
    name?: string;
    email?: string;
  } = {},
) {
  const suffix = uniqueSuffix();
  const passwordHash = await argon2.hash(TEST_PASSWORD);
  const user = await createUser(
    {
      username: options.username ?? `user_${suffix}`,
      password: passwordHash,
      name: options.name ?? "Test User",
      email: options.email ?? `user_${suffix}@test.dev`,
      role: options.role ?? "user",
    },
    options.organizationIds ?? [],
  );
  return { ...user, password: TEST_PASSWORD };
}

export async function createTestCategory(
  organizationId: number,
  overrides: { name?: string } = {},
) {
  return createBadgeCategory({
    name: overrides.name ?? `Category ${uniqueSuffix()}`,
    organizationId,
  });
}

export async function createTestBadge(
  organizationId: number,
  overrides: {
    name?: string;
    description?: string;
    categoryId?: number;
    requiresProgress?: boolean;
  } = {},
) {
  return storage.createBadge({
    name: overrides.name ?? `Badge ${uniqueSuffix()}`,
    description: overrides.description ?? "Fixture badge for integration tests",
    organizationId,
    categoryId: overrides.categoryId,
    requiresProgress: overrides.requiresProgress ?? false,
  });
}

export async function loginAs(
  app: Express,
  username: string,
  password: string,
) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/v1/auth/login")
    .send({ username, password });
  if (res.status === 429) {
    throw new Error(
      `loginAs(${username}) hit the per-app login rate limit (10 attempts / ` +
        `15 min). Each createApp() instance gets a fresh limiter — split this ` +
        `describe block into its own beforeAll(() => createApp()) if it's ` +
        `making 10+ loginAs() calls.`,
    );
  }
  if (res.status !== 200) {
    throw new Error(
      `loginAs(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return agent;
}
