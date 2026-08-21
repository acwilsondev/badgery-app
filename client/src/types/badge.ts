import type { BadgeResponse } from "@shared/api-types";

// The badges list/detail views enrich BadgeResponse with `awarded`, which
// is populated only on the per-user badge card view and is never part of
// the server's response — it's computed client-side.
export type BadgeWithExtras = BadgeResponse & {
  awarded?: number;
};
