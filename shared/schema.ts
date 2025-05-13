import { pgTable, text, serial, integer, boolean, timestamp, json, uuid, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Standard audit fields for all tables
const createAuditFields = () => ({
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by"),  // Will reference users.id but defined later to avoid circular dependencies
  updatedAt: timestamp("updated_at"),
  updatedBy: integer("updated_by"),  // Will reference users.id
  active: boolean("active").default(true).notNull(),
});

// Organizations
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ...createAuditFields(),
});

export const organizationsInsertSchema = createInsertSchema(organizations, {
  name: (schema) => schema.min(3, "Name must be at least 3 characters"),
  description: (schema) => schema.min(5, "Description must be at least 5 characters").optional(),
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertOrganization = z.infer<typeof organizationsInsertSchema>;
export type Organization = typeof organizations.$inferSelect;

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").default("user").notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  ...createAuditFields(),
});

export const insertUserSchema = createInsertSchema(users, {
  username: (schema) => schema.min(3, "Username must be at least 3 characters"),
  password: (schema) => schema.min(6, "Password must be at least 6 characters"),
  name: (schema) => schema.min(2, "Name must be at least 2 characters"),
  email: (schema) => schema.email("Must provide a valid email"),
  role: (schema) => schema.optional(),
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// User-Organization mapping (many-to-many)
export const userOrganization = pgTable("user_organization", {
  userId: integer("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  ...createAuditFields(),
}, (table) => {
  return {
    pk: { columns: [table.userId, table.organizationId] },
  };
});

export const userOrganizationInsertSchema = createInsertSchema(userOrganization, {
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertUserOrganization = z.infer<typeof userOrganizationInsertSchema>;
export type UserOrganization = typeof userOrganization.$inferSelect;

// User Organization Scopes/Permissions
export const userOrganizationScope = pgTable("user_organization_scope", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  scope: text("scope").notNull(), // e.g., 'grant_achievement', 'revoke_achievement', 'edit_badge', 'viewer'
  ...createAuditFields(),
});

export const userOrganizationScopeInsertSchema = createInsertSchema(userOrganizationScope, {
  scope: (schema) => schema.refine(
    val => ['grant_achievement', 'revoke_achievement', 'edit_badge', 'viewer'].includes(val),
    { message: "Scope must be one of the predefined values" }
  ),
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertUserOrganizationScope = z.infer<typeof userOrganizationScopeInsertSchema>;
export type UserOrganizationScope = typeof userOrganizationScope.$inferSelect;

// Badge categories (maintained from existing implementation for organization)
export const badgeCategories = pgTable("badge_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  ...createAuditFields(),
});

export const badgeCategoriesInsertSchema = createInsertSchema(badgeCategories, {
  name: (schema) => schema.min(2, "Name must be at least 2 characters"),
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertBadgeCategory = z.infer<typeof badgeCategoriesInsertSchema>;
export type BadgeCategory = typeof badgeCategories.$inferSelect;

// Badges
export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  criteria: text("criteria"),
  imageUrl: text("image_url"),
  color: text("color").default("#4F46E5"),
  categoryId: integer("category_id").references(() => badgeCategories.id),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  requiresProgress: boolean("requires_progress").default(false).notNull(),
  criteriaSections: jsonb("criteria_sections"), // JSON array of criteria sections
  criteriaType: text("criteria_type").default("binary").notNull(), // "binary" or "numeric"
  ...createAuditFields(),
});

export const badgesInsertSchema = createInsertSchema(badges, {
  name: (schema) => schema.min(2, "Name must be at least 2 characters"),
  description: (schema) => schema.min(5, "Description must be at least 5 characters"),
  criteria: (schema) => schema.optional(),
  imageUrl: (schema) => schema.optional(),
  color: (schema) => schema.optional(),
  categoryId: (schema) => schema.optional(),
  requiresProgress: (schema) => schema.optional(),
  criteriaSections: (schema) => schema.optional(),
  criteriaType: (schema) => schema.optional().refine(
    val => !val || ['binary', 'numeric'].includes(val), 
    { message: "Criteria type must be either 'binary' or 'numeric'" }
  ),
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertBadge = z.infer<typeof badgesInsertSchema>;
export type Badge = typeof badges.$inferSelect;

// Badge Prerequisites (badges that are required before earning another badge)
export const badgePrerequisites = pgTable("badge_prerequisites", {
  badgeId: integer("badge_id").references(() => badges.id).notNull(),
  prerequisiteBadgeId: integer("prerequisite_badge_id").references(() => badges.id).notNull(),
  ...createAuditFields(),
}, (table) => {
  return {
    pk: { columns: [table.badgeId, table.prerequisiteBadgeId] },
  };
});

export const badgePrerequisitesInsertSchema = createInsertSchema(badgePrerequisites, {
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertBadgePrerequisite = z.infer<typeof badgePrerequisitesInsertSchema>;
export type BadgePrerequisite = typeof badgePrerequisites.$inferSelect;

// Metrics (requirements for badges)
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // 'boolean' or 'numeric'
  targetValue: integer("target_value").notNull(), // e.g., 1 for boolean true, or 100 for numeric goal
  ...createAuditFields(),
});

export const metricsInsertSchema = createInsertSchema(metrics, {
  name: (schema) => schema.min(2, "Name must be at least 2 characters"),
  description: (schema) => schema.min(5, "Description must be at least 5 characters"),
  type: (schema) => schema.refine(
    val => ['boolean', 'numeric'].includes(val),
    { message: "Type must be either 'boolean' or 'numeric'" }
  ),
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertMetric = z.infer<typeof metricsInsertSchema>;
export type Metric = typeof metrics.$inferSelect;

// Badge Metrics (join table between badges and metrics)
export const badgeMetrics = pgTable("badge_metrics", {
  badgeId: integer("badge_id").references(() => badges.id).notNull(),
  metricId: integer("metric_id").references(() => metrics.id).notNull(),
  ...createAuditFields(),
}, (table) => {
  return {
    pk: { columns: [table.badgeId, table.metricId] },
  };
});

export const badgeMetricsInsertSchema = createInsertSchema(badgeMetrics, {
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertBadgeMetric = z.infer<typeof badgeMetricsInsertSchema>;
export type BadgeMetric = typeof badgeMetrics.$inferSelect;

// Achievements (tracks user progress and completion of badges)
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  badgeId: integer("badge_id").references(() => badges.id).notNull(),
  status: text("status").default("in_progress").notNull(), // 'in_progress', 'achieved'
  awardedAt: timestamp("awarded_at"),
  awardedBy: integer("awarded_by").references(() => users.id),
  ...createAuditFields(),
});

export const achievementsInsertSchema = createInsertSchema(achievements, {
  status: (schema) => schema.refine(
    val => ['in_progress', 'achieved'].includes(val),
    { message: "Status must be either 'in_progress' or 'achieved'" }
  ),
  awardedAt: (schema) => schema.optional(),
  awardedBy: (schema) => schema.optional(),
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
  updatedAt: (schema) => schema.optional(),
});

export type InsertAchievement = z.infer<typeof achievementsInsertSchema>;
export type Achievement = typeof achievements.$inferSelect;

// Progress (tracks user progress on individual metrics)
export const progress = pgTable("progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  metricId: integer("metric_id").references(() => metrics.id).notNull(),
  value: text("value").notNull(), // Stored as text to handle both boolean and numeric types
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  ...createAuditFields(),
});

export const progressInsertSchema = createInsertSchema(progress, {
  value: (schema) => schema,
  active: (schema) => schema.optional(),
  createdBy: (schema) => schema.optional(),
  updatedBy: (schema) => schema.optional(),
});

export type InsertProgress = z.infer<typeof progressInsertSchema>;
export type Progress = typeof progress.$inferSelect;

// Define relationships
export const organizationsRelations = relations(organizations, ({ many }) => ({
  userOrganizations: many(userOrganization),
  userScopes: many(userOrganizationScope),
  badges: many(badges),
  badgeCategories: many(badgeCategories),
}));

export const usersRelations = relations(users, ({ many }) => ({
  userOrganizations: many(userOrganization),
  userScopes: many(userOrganizationScope),
  achievements: many(achievements, { relationName: "user_achievements" }),
  achievementsAwarded: many(achievements, { relationName: "awarded_by_user" }),
  progress: many(progress),
}));

export const userOrganizationRelations = relations(userOrganization, ({ one }) => ({
  user: one(users, {
    fields: [userOrganization.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganization.organizationId],
    references: [organizations.id],
  }),
}));

export const userOrganizationScopeRelations = relations(userOrganizationScope, ({ one }) => ({
  user: one(users, {
    fields: [userOrganizationScope.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganizationScope.organizationId],
    references: [organizations.id],
  }),
}));

export const badgeCategoriesRelations = relations(badgeCategories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [badgeCategories.organizationId],
    references: [organizations.id],
  }),
  badges: many(badges),
}));

export const badgesRelations = relations(badges, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [badges.organizationId],
    references: [organizations.id],
  }),
  category: one(badgeCategories, {
    fields: [badges.categoryId],
    references: [badgeCategories.id],
  }),
  prerequisites: many(badgePrerequisites, { relationName: "badge_prerequisites" }),
  requiredFor: many(badgePrerequisites, { relationName: "prerequisite_for_badges" }),
  badgeMetrics: many(badgeMetrics),
  achievements: many(achievements),
}));

export const badgePrerequisitesRelations = relations(badgePrerequisites, ({ one }) => ({
  badge: one(badges, {
    fields: [badgePrerequisites.badgeId],
    references: [badges.id],
    relationName: "badge_prerequisites",
  }),
  prerequisiteBadge: one(badges, {
    fields: [badgePrerequisites.prerequisiteBadgeId],
    references: [badges.id],
    relationName: "prerequisite_for_badges",
  }),
}));

export const metricsRelations = relations(metrics, ({ many }) => ({
  badgeMetrics: many(badgeMetrics),
  progress: many(progress),
}));

export const badgeMetricsRelations = relations(badgeMetrics, ({ one }) => ({
  badge: one(badges, {
    fields: [badgeMetrics.badgeId],
    references: [badges.id],
  }),
  metric: one(metrics, {
    fields: [badgeMetrics.metricId],
    references: [metrics.id],
  }),
}));

export const achievementsRelations = relations(achievements, ({ one }) => ({
  badge: one(badges, {
    fields: [achievements.badgeId],
    references: [badges.id],
  }),
  user: one(users, {
    fields: [achievements.userId],
    references: [users.id],
    relationName: "user_achievements",
  }),
  awardedByUser: one(users, {
    fields: [achievements.awardedBy],
    references: [users.id],
    relationName: "awarded_by_user",
  }),
}));

export const progressRelations = relations(progress, ({ one }) => ({
  metric: one(metrics, {
    fields: [progress.metricId],
    references: [metrics.id],
  }),
  user: one(users, {
    fields: [progress.userId],
    references: [users.id],
  }),
}));

// For backward compatibility - these will be deprecated
export const awardedBadges = achievements;
export const awardedBadgesInsertSchema = achievementsInsertSchema;
export type InsertAwardedBadge = InsertAchievement;
export type AwardedBadge = Achievement;

export const badgeProgress = progress;
export const badgeProgressInsertSchema = progressInsertSchema;
export type InsertBadgeProgress = InsertProgress;
export type BadgeProgress = Progress;
