// The shape returned by GET /api/v1/organizations/:orgId/users
// (server/features/users/service.ts getUsersByOrganization). Re-exported
// from shared/api-types.ts rather than hand-duplicated.
export type { OrgUserResponse as OrgUser } from "@shared/api-types";
