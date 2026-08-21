// shared/api-types.ts
//
// Hand-shaped types for the JSON response bodies server/features/*/routes.ts
// actually sends — as distinct from shared/schema.ts's raw Drizzle table
// types. Several endpoints project, join, or reshape rows before
// responding, and a few of those reshapes are inconsistent with each other
// for "the same concept" (documented per-type below, not fixed — see
// docs/superpowers/plans/2026-08-21-phase-3d-openapi-and-response-types.md).

import type { Badge } from "./schema";

// A minimal organization reference embedded in user-shaped responses.
export type OrganizationRef = { id: number; name: string };

// GET /organizations/:orgId/users (server/features/users/service.ts
// getUsersByOrganization). Password already stripped before this shape is
// built — never a raw users-table row.
export type OrgUserResponse = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  organizations: OrganizationRef[];
};

// GET /users/:id (server/features/users/routes.ts). A third, distinct
// user projection: has `organizations` (unlike AuthUserResponse, added in
// Task 2) but no `createdAt` (unlike OrgUserResponse above). Three
// overlapping-but-different user shapes exist across the API; kept
// separate rather than unified, since unifying would change what each
// endpoint actually returns.
export type UserProfileResponse = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  organizations: OrganizationRef[];
};

// Reused by badges/organizations/progress `{ message: string }` responses
// (POST /auth/logout, DELETE /badges/:id) — these two are genuinely
// identical, unlike the shapes above.
export type MessageResponse = { message: string };

// POST /auth/login, POST /auth/register, GET /auth/me all return this
// exact shape (server/features/auth/routes.ts).
export type AuthUserResponse = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  organizationId: number | null;
};

export type LogoutResponse = MessageResponse;

// GET /organizations/:orgId/badges (array) and GET /badges/:id (single) —
// server/features/badges/service.ts getBadges/getBadgeById. A raw-SQL
// join, not a Drizzle-inferred row.
export type BadgeResponse = {
  id: number;
  name: string;
  description: string;
  criteria: string | null;
  imageUrl: string | null;
  color: string | null;
  categoryId: number | null;
  organizationId: number;
  createdAt: Date;
  requiresProgress: boolean;
  criteriaSections: unknown;
  criteriaType: string;
  category: { id: number; name: string } | null;
};

// POST/PUT /badges return the raw Drizzle row directly — notably no
// `category` object, unlike BadgeResponse above. A real, pre-existing
// inconsistency between the write and read shapes for "a badge";
// documented as-is, not fixed by this phase.
export type BadgeWriteResponse = Badge;

export type DeleteBadgeResponse = MessageResponse;
