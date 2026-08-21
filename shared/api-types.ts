// shared/api-types.ts
//
// Hand-shaped types for the JSON response bodies server/features/*/routes.ts
// actually sends — as distinct from shared/schema.ts's raw Drizzle table
// types. Several endpoints project, join, or reshape rows before
// responding, and a few of those reshapes are inconsistent with each other
// for "the same concept" (documented per-type below, not fixed — see
// docs/superpowers/plans/2026-08-21-phase-3d-openapi-and-response-types.md).
//
// A note on `Date`-typed fields (createdAt, awardedAt, lastUpdated, etc.):
// they're typed `Date` here because that's what the server-side object
// literal passed to res.json() actually holds. Once serialized over HTTP
// and parsed as JSON on the client, they arrive as ISO-8601 strings, not
// `Date` instances. Client code consuming these types should not call
// `Date`-only methods on them without an explicit `new Date(...)`
// conversion first.

import type { Achievement, Badge } from "./schema";

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

// GET /organizations for an admin caller (server/features/organizations
// /service.ts getOrganizations — raw SQL, narrower than the Drizzle
// Organization row: no createdBy/updatedAt/updatedBy/active).
export type OrganizationSummary = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
};

// GET /organizations/:id, POST /organizations, and PUT /organizations/:id
// all return the full Drizzle Organization row (shared/schema.ts) — wider
// than OrganizationSummary above. A non-admin caller to GET /organizations
// instead gets OrganizationRef[] (organizations/routes.ts) — three
// different widths for "an organization" depending on endpoint and caller
// role; documented as-is, not unified.

// GET /organizations/:orgId/categories (server/features/organizations
// /service.ts getBadgeCategories — raw SQL).
export type BadgeCategorySummary = {
  id: number;
  name: string;
  organizationId: number;
  createdAt: Date;
};

// GET /organizations/:orgId/stats.
export type OrganizationStats = {
  totalBadges: number;
  totalUsers: number;
  totalAwarded: number;
  inProgress: number;
};

// POST /badges/:badgeId/award returns the raw Drizzle row directly.
export type AwardBadgeResponse = Achievement;

// GET /organizations/:orgId/awarded-badges (server/features/progress
// /service.ts getAwardedBadges).
export type OrgAwardedBadge = {
  id: number;
  badgeId: number;
  userId: number;
  awardedBy: number | null;
  awardedAt: Date | null;
  status: string;
  badgeName: string;
  badgeDescription: string;
  badgeColor: string | null;
  badgeImageUrl: string | null;
  userName: string;
  awardedByName: string;
};

// GET /users/:userId/awarded-badges — same shape minus userName (the
// caller already knows which user this is).
export type UserAwardedBadge = Omit<OrgAwardedBadge, "userName">;

export type ProgressMetricEntry = {
  value: string;
  name: string;
  description: string;
  type: string;
  targetValue: number;
};

// GET /badges/:badgeId/progress/:userId, and the response of
// POST /badges/:badgeId/progress/:userId when it doesn't no-op (see
// UpdateBadgeProgressResponse below).
export type BadgeProgressDetail = {
  id: number;
  userId: number;
  badgeId: number;
  progress: number;
  progressData: Record<number, ProgressMetricEntry>;
  lastUpdated: Date;
  status: "completed" | "in_progress";
  badge: BadgeResponse;
  metrics: Array<{
    id: number;
    userId: number;
    metricId: number;
    value: string;
    lastUpdatedAt: Date;
    updatedBy: number | null;
    metricName: string;
    metricDescription: string;
    metricType: string;
    targetValue: number;
  }>;
};

// GET /users/:userId/progress — a differently-shaped per-badge summary
// (flat badgeName/badgeColor/etc. fields instead of a nested `badge`
// object, unlike BadgeProgressDetail above); documented as-is.
export type UserBadgeProgressSummary = {
  id: number;
  badgeId: number;
  userId: number;
  progress: number;
  progressData: Record<number, ProgressMetricEntry>;
  lastUpdated: Date;
  updatedBy: number | null;
  status: "completed" | "in_progress";
  badgeName: string;
  badgeDescription: string;
  badgeColor: string | null;
  badgeImageUrl: string | null;
  requiresProgress: true;
  criteriaSections: unknown;
  updatedByName: string;
};

// GET /organizations/:orgId/progress — yet another shape. `progress` is a
// hardcoded placeholder 0 (server/features/progress/service.ts, "will be
// calculated properly in the client") and `status` is always
// "in_progress" — both pre-existing and faithfully documented, not fixed.
export type OrgBadgeProgressSummary = {
  id: number;
  badgeId: number;
  userId: number;
  lastUpdated: Date;
  updatedBy: number | null;
  badgeName: string;
  userName: string;
  updatedByName: string;
  progress: number;
  status: string;
};

// POST /badges/:badgeId/progress/:userId returns whatever
// getBadgeProgress(badgeId, userId) returns after the update: null if the
// badge has no configured badgeMetrics rows (the known-broken case
// documented in CLAUDE.md and tests/progress.test.ts), otherwise
// BadgeProgressDetail.
export type UpdateBadgeProgressResponse = BadgeProgressDetail | null;
