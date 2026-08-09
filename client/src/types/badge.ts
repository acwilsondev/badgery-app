import type { Badge as BaseBadge } from "@shared/schema";

// The badges list/detail views enrich the raw Badge row with its category
// (joined) and a parsed criteriaSections structure (badges.tsx stores this
// as a jsonb column, typed unknown on BaseBadge; these views need it typed).
// `awarded` is populated only on the per-user badge card view.
export type BadgeWithExtras = BaseBadge & {
  criteriaSections?: Array<{
    title: string;
    criteria: Array<{
      id: number;
      name: string;
      description?: string;
    }>;
  }>;
  category?: {
    id: number;
    name: string;
  } | null;
  awarded?: number;
};
