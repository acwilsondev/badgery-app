// The shape returned by GET /api/v1/organizations/:orgId/users
// (server/features/users/service.ts getUsersByOrganization). A hand-mapped
// API response projection, not a raw users-table row — notably it excludes
// password and includes the joined organizations array, so it isn't a
// shared/schema.ts type.
export type OrgUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  organizations: Array<{ id: number; name: string }>;
};
