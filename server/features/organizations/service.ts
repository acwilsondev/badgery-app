import { db } from "@db";
import { eq } from "drizzle-orm";
import { pool } from "@db";
import {
  organizations,
  badgeCategories,
  type InsertOrganization,
  type Organization,
  type InsertBadgeCategory,
} from "@shared/schema";
import type {
  OrganizationSummary,
  BadgeCategorySummary,
  OrganizationStats,
} from "@shared/api-types";

export async function getOrganizations(): Promise<OrganizationSummary[]> {
  try {
    // Use raw SQL query to avoid schema-related issues
    const sql = `
      SELECT id, name, description, created_at as "createdAt"
      FROM organizations
      ORDER BY name ASC
    `;

    const result = await pool.query(sql);
    return result.rows;
  } catch (error) {
    console.error("Error in getOrganizations:", error);
    throw error;
  }
}

export async function getOrganizationById(id: number) {
  return db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
}

export async function createOrganization(organization: InsertOrganization) {
  const [newOrganization] = await db
    .insert(organizations)
    .values(organization)
    .returning();
  return newOrganization;
}

export async function updateOrganization(
  id: number,
  data: Partial<Organization>,
) {
  const [updatedOrganization] = await db
    .update(organizations)
    .set(data)
    .where(eq(organizations.id, id))
    .returning();
  return updatedOrganization;
}

export async function getBadgeCategories(
  organizationId: number,
): Promise<BadgeCategorySummary[]> {
  try {
    // Use raw SQL query to avoid schema-related issues
    const sql = `
      SELECT id, name, organization_id as "organizationId",
             created_at as "createdAt"
      FROM badge_categories
      WHERE organization_id = $1
      ORDER BY name ASC
    `;

    const result = await pool.query(sql, [organizationId]);
    return result.rows;
  } catch (error) {
    console.error("Error in getBadgeCategories:", error);
    throw error;
  }
}

export async function createBadgeCategory(
  category: InsertBadgeCategory & { organizationId: number },
) {
  const [newCategory] = await db
    .insert(badgeCategories)
    .values(category)
    .returning();
  return newCategory;
}

export async function getOrganizationStats(
  organizationId: number,
): Promise<OrganizationStats> {
  try {
    // Count badges in organization
    const badgeSql = `
      SELECT COUNT(*) as count
      FROM badges
      WHERE organization_id = $1
    `;
    const badgeResult = await pool.query(badgeSql, [organizationId]);
    const badgeCount = parseInt(badgeResult.rows[0].count);

    // Count users in organization (using many-to-many)
    const userSql = `
      SELECT COUNT(*) as count
      FROM user_organization
      WHERE organization_id = $1
    `;
    const userResult = await pool.query(userSql, [organizationId]);
    const userCount = parseInt(userResult.rows[0].count);

    // Count awarded badges
    const awardSql = `
      SELECT COUNT(*) as count
      FROM achievements a
      JOIN badges b ON a.badge_id = b.id
      WHERE b.organization_id = $1
    `;
    const awardResult = await pool.query(awardSql, [organizationId]);
    const awardCount = parseInt(awardResult.rows[0].count);

    // Count in-progress metrics (a bit more complex with the new schema)
    const progressSql = `
      SELECT COUNT(DISTINCT p.user_id || '-' || bm.badge_id) as count
      FROM progress p
      JOIN metrics m ON p.metric_id = m.id
      JOIN badge_metrics bm ON m.id = bm.metric_id
      JOIN badges b ON bm.badge_id = b.id
      WHERE b.organization_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM achievements a
        WHERE a.badge_id = bm.badge_id
        AND a.user_id = p.user_id
      )
    `;
    const progressResult = await pool.query(progressSql, [organizationId]);
    const inProgressCount = parseInt(progressResult.rows[0].count);

    return {
      totalBadges: badgeCount || 0,
      totalUsers: userCount || 0,
      totalAwarded: awardCount || 0,
      inProgress: inProgressCount || 0,
    };
  } catch (error) {
    console.error("Error in getOrganizationStats:", error);
    return {
      totalBadges: 0,
      totalUsers: 0,
      totalAwarded: 0,
      inProgress: 0,
    };
  }
}
