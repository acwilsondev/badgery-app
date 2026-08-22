// The shape returned by POST /api/v1/auth/login, POST /api/v1/auth
// /register, and GET /api/v1/auth/me. Re-exported from shared/api-types.ts
// (server/features/auth/routes.ts) rather than hand-duplicated, so a
// future server-side field change fails this file's imports at compile
// time instead of silently drifting.
export type { AuthUserResponse as AuthUser } from "@shared/api-types";
