// The shape returned by POST /api/v1/auth/login and GET /api/v1/auth/me
// (server/features/auth/routes.ts). Not a shared/schema.ts type: this is
// an API response projection of the users table, not a raw DB row (no
// password, no createdAt/updatedAt/active audit fields).
export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  organizationId?: number | null;
};
