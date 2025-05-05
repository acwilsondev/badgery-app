import { pgTable, text, serial, integer, boolean, timestamp, json, uuid, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Organizations
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizationsInsertSchema = createInsertSchema(organizations, {
  name: (schema) => schema.min(3, "Name must be at least 3 characters"),
  description: (schema) => schema.min(5, "Description must be at least 5 characters").optional(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users, {
  username: (schema) => schema.min(3, "Username must be at least 3 characters"),
  password: (schema) => schema.min(6, "Password must be at least 6 characters"),
  name: (schema) => schema.min(2, "Name must be at least 2 characters"),
  email: (schema) => schema.email("Must provide a valid email"),
  role: (schema) => schema.optional(),
  organizationId: (schema) => schema.optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Badge categories
export const badgeCategories = pgTable("badge_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const badgeCategoriesInsertSchema = createInsertSchema(badgeCategories, {
  name: (schema) => schema.min(2, "Name must be at least 2 characters"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  requiresProgress: boolean("requires_progress").default(false).notNull(),
  criteriaSections: jsonb("criteria_sections"), // JSON array of criteria sections
  criteriaType: text("criteria_type").default("binary").notNull(), // "binary" or "numeric"
});

export const badgesInsertSchema = createInsertSchema(badges, {
  name: (schema) => schema.min(2, "Name must be at least 2 characters"),
  description: (schema) => schema.min(5, "Description must be at least 5 characters"),
  criteria: (schema) => schema.optional(),
  imageUrl: (schema) => schema.optional(),
  color: (schema) => schema.optional(),
  requiresProgress: (schema) => schema.optional(),
  criteriaSections: (schema) => schema.optional(),
  criteriaType: (schema) => schema.optional().refine(
    val => !val || ['binary', 'numeric'].includes(val), 
    { message: "Criteria type must be either 'binary' or 'numeric'" }
  ),
});

export type InsertBadge = z.infer<typeof badgesInsertSchema>;
export type Badge = typeof badges.$inferSelect;

// Awarded badges
export const awardedBadges = pgTable("awarded_badges", {
  id: serial("id").primaryKey(),
  badgeId: integer("badge_id").references(() => badges.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  awardedBy: integer("awarded_by").references(() => users.id).notNull(),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  status: text("status").default("completed").notNull(),
});

export const awardedBadgesInsertSchema = createInsertSchema(awardedBadges, {
  badgeId: (schema) => schema,
  userId: (schema) => schema,
  awardedBy: (schema) => schema,
  status: (schema) => schema.optional(),
});

export type InsertAwardedBadge = z.infer<typeof awardedBadgesInsertSchema>;
export type AwardedBadge = typeof awardedBadges.$inferSelect;

// Badge Progress Tracking
export const badgeProgress = pgTable("badge_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  badgeId: integer("badge_id").references(() => badges.id).notNull(),
  progress: numeric("progress").default("0").notNull(), // Progress percentage (0-100)
  progressData: jsonb("progress_data"), // JSON object storing progress against criteria
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id).notNull(), // User who last updated progress
  notes: text("notes"), // Optional notes about progress
  status: text("status").default("in_progress").notNull(), // in_progress, completed, etc.
});

export const badgeProgressInsertSchema = createInsertSchema(badgeProgress, {
  userId: (schema) => schema,
  badgeId: (schema) => schema,
  progress: (schema) => schema.optional(),
  progressData: (schema) => schema.optional(),
  updatedBy: (schema) => schema,
  notes: (schema) => schema.optional(),
  status: (schema) => schema.optional(),
});

export type InsertBadgeProgress = z.infer<typeof badgeProgressInsertSchema>;
export type BadgeProgress = typeof badgeProgress.$inferSelect;

// Define relationships
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  badges: many(badges),
  badgeCategories: many(badgeCategories),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  awardedBadges: many(awardedBadges, { relationName: "user_badges" }),
  badgesAwarded: many(awardedBadges, { relationName: "awarded_by_user" }),
  badgeProgress: many(badgeProgress, { relationName: "user_badge_progress" }),
  progressUpdates: many(badgeProgress, { relationName: "progress_updated_by_user" }),
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
  awardedBadges: many(awardedBadges),
  badgeProgress: many(badgeProgress),
}));

export const awardedBadgesRelations = relations(awardedBadges, ({ one }) => ({
  badge: one(badges, {
    fields: [awardedBadges.badgeId],
    references: [badges.id],
  }),
  user: one(users, {
    fields: [awardedBadges.userId],
    references: [users.id],
    relationName: "user_badges",
  }),
  awardedByUser: one(users, {
    fields: [awardedBadges.awardedBy],
    references: [users.id],
    relationName: "awarded_by_user",
  }),
}));

export const badgeProgressRelations = relations(badgeProgress, ({ one }) => ({
  badge: one(badges, {
    fields: [badgeProgress.badgeId],
    references: [badges.id],
  }),
  user: one(users, {
    fields: [badgeProgress.userId],
    references: [users.id],
    relationName: "user_badge_progress",
  }),
  updatedByUser: one(users, {
    fields: [badgeProgress.updatedBy],
    references: [users.id],
    relationName: "progress_updated_by_user",
  }),
}));
