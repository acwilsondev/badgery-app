import { db, pool } from "@db";
import {
  eq,
  and,
  desc,
  sql,
  count as _count,
  asc as _asc,
  inArray,
} from "drizzle-orm";
import {
  organizations,
  users,
  badges,
  badgeCategories,
  userOrganization,
  userOrganizationScope as _userOrganizationScope,
  metrics,
  badgeMetrics,
  achievements, // new name for awardedBadges
  progress, // new name for badgeProgress
  badgePrerequisites as _badgePrerequisites,
  type Organization,
  type User,
  type Badge,
  type BadgeCategory as _BadgeCategory,
  type Achievement as _Achievement, // renamed from AwardedBadge
  type Progress as _Progress, // renamed from BadgeProgress
  type Metric as _Metric,
  type UserOrganization as _UserOrganization,
  type UserOrganizationScope as _UserOrganizationScope,
  type InsertOrganization,
  type InsertUser,
  type InsertBadgeCategory,
  type InsertBadge,
  type InsertAwardedBadge,
  // For backward compatibility
  awardedBadges,
  badgeProgress as _badgeProgress,
  type AwardedBadge as _AwardedBadge,
  type BadgeProgress as _BadgeProgress,
} from "@shared/schema";

// Organizations
export async function getOrganizations() {
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

// Users
export async function getUsers() {
  try {
    // Use raw SQL query for compatibility during schema transition
    const sql = `
      SELECT u.*,
            array_agg(DISTINCT o.id) as organization_ids,
            array_agg(DISTINCT o.name) as organization_names
      FROM users u
      LEFT JOIN user_organization uo ON u.id = uo.user_id
      LEFT JOIN organizations o ON uo.organization_id = o.id
      GROUP BY u.id
      ORDER BY u.name ASC
    `;

    const result = await pool.query(sql);

    // Format the results to include the organizations array
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    }));
  } catch (error) {
    console.error("Error in getUsers:", error);
    throw error;
  }
}

export async function getUsersByOrganization(organizationId: number) {
  try {
    // Use raw SQL query for compatibility during schema transition
    const sql = `
      SELECT u.*,
            array_agg(DISTINCT o.id) as organization_ids,
            array_agg(DISTINCT o.name) as organization_names
      FROM users u
      JOIN user_organization uo ON u.id = uo.user_id
      JOIN organizations o ON uo.organization_id = o.id
      WHERE uo.organization_id = $1
      GROUP BY u.id
      ORDER BY u.name ASC
    `;

    const result = await pool.query(sql, [organizationId]);

    // Format the results to include the organizations array
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    }));
  } catch (error) {
    console.error("Error in getUsersByOrganization:", error);
    throw error;
  }
}

export async function getUserById(id: number) {
  try {
    // Use direct SQL query to avoid relationship issues during schema transition
    const sql = `
      SELECT u.*, 
             array_agg(DISTINCT o.id) as organization_ids,
             array_agg(DISTINCT o.name) as organization_names
      FROM users u
      LEFT JOIN user_organization uo ON u.id = uo.user_id
      LEFT JOIN organizations o ON uo.organization_id = o.id
      WHERE u.id = $1
      GROUP BY u.id
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      name: row.name,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    };
  } catch (error) {
    console.error("Error in getUserById:", error);
    throw error;
  }
}

export async function getUserByUsername(username: string) {
  try {
    // Use direct SQL query to avoid relationship issues during schema transition
    const sql = `
      SELECT u.*, 
             array_agg(DISTINCT o.id) as organization_ids,
             array_agg(DISTINCT o.name) as organization_names
      FROM users u
      LEFT JOIN user_organization uo ON u.id = uo.user_id
      LEFT JOIN organizations o ON uo.organization_id = o.id
      WHERE u.username = $1
      GROUP BY u.id
    `;

    const result = await pool.query(sql, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      name: row.name,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    };
  } catch (error) {
    console.error("Error in getUserByUsername:", error);
    throw error;
  }
}

export async function createUser(
  userData: InsertUser,
  organizationIds?: number[],
) {
  try {
    // Log the exact SQL and values used for debugging
    console.log("Creating user with data:", {
      username: userData.username,
      name: userData.name,
      email: userData.email,
      role: userData.role || "user",
      organizationId: userData.organizationId || null,
    });

    // Use direct SQL for user creation with only columns that definitely exist
    const sql = `
      INSERT INTO users (username, password, name, email, role, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, password, name, email, role, organization_id as "organizationId", created_at as "createdAt"
    `;

    const values = [
      userData.username,
      userData.password,
      userData.name,
      userData.email,
      userData.role || "user",
      userData.organizationId || null,
    ];

    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      throw new Error("Failed to create user");
    }

    const newUser = result.rows[0];
    console.log("User created successfully:", newUser.id);

    // Associate user with organizations if provided
    if (organizationIds && organizationIds.length > 0) {
      const orgPromises = organizationIds.map((orgId) => {
        return pool.query(
          `INSERT INTO user_organization (user_id, organization_id)
           VALUES ($1, $2)`,
          [newUser.id, orgId],
        );
      });

      await Promise.all(orgPromises);
    }

    return newUser;
  } catch (error) {
    console.error("Error in createUser:", error);
    throw error;
  }
}

// Helper function to get table columns (keeping for reference)
async function _getTableColumns(tableName: string): Promise<string[]> {
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [tableName],
    );
    return result.rows.map((row) => row.column_name);
  } catch (error) {
    console.error(`Error fetching columns for table ${tableName}:`, error);
    return [];
  }
}

export async function updateUser(
  id: number,
  data: Partial<User>,
  organizationIds?: number[],
) {
  // Start a transaction
  return await db.transaction(async (tx) => {
    // Update the user
    const [updatedUser] = await tx
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();

    // Update organization associations if provided
    if (organizationIds) {
      // First delete existing associations
      await tx.delete(userOrganization).where(eq(userOrganization.userId, id));

      // Then create new ones
      if (organizationIds.length > 0) {
        const userOrgData = organizationIds.map((orgId) => ({
          userId: id,
          organizationId: orgId,
          createdBy: data.updatedBy || null,
          updatedBy: data.updatedBy || null,
        }));

        await tx.insert(userOrganization).values(userOrgData);
      }
    }

    return updatedUser;
  });
}

// Badge Categories
export async function getBadgeCategories(organizationId: number) {
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

export async function getBadgeCategoryById(id: number) {
  return db.query.badgeCategories.findFirst({
    where: eq(badgeCategories.id, id),
  });
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

// Badges
export async function getBadges(organizationId: number, categoryId?: number) {
  try {
    // Using SQL directly to avoid schema caching issues
    let sql = `
      SELECT b.*, c.name as category_name, c.id as category_id
      FROM badges b
      LEFT JOIN badge_categories c ON b.category_id = c.id
      WHERE b.organization_id = $1
    `;

    const params = [organizationId];

    if (categoryId) {
      sql += ` AND b.category_id = $2`;
      params.push(categoryId);
    }

    sql += ` ORDER BY b.name ASC`;

    const result = await pool.query(sql, params);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      criteria: row.criteria,
      imageUrl: row.image_url,
      color: row.color,
      categoryId: row.category_id,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      requiresProgress: row.requires_progress,
      criteriaSections: row.criteria_sections,
      criteriaType: row.criteria_type || "binary",
      category: row.category_id
        ? {
            id: row.category_id,
            name: row.category_name,
          }
        : null,
    }));
  } catch (error) {
    console.error("Error in getBadges:", error);
    throw error;
  }
}

export async function getBadgeById(id: number) {
  try {
    // Using SQL directly to avoid schema caching issues
    const sql = `
      SELECT b.*, c.name as category_name, c.id as category_id
      FROM badges b
      LEFT JOIN badge_categories c ON b.category_id = c.id
      WHERE b.id = $1
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      criteria: row.criteria,
      imageUrl: row.image_url,
      color: row.color,
      categoryId: row.category_id,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      requiresProgress: row.requires_progress,
      criteriaSections: row.criteria_sections,
      criteriaType: row.criteria_type || "binary",
      category: row.category_id
        ? {
            id: row.category_id,
            name: row.category_name,
          }
        : null,
    };
  } catch (error) {
    console.error("Error in getBadgeById:", error);
    throw error;
  }
}

export async function createBadge(
  badge: InsertBadge & { organizationId: number },
) {
  const [newBadge] = await db.insert(badges).values(badge).returning();
  return newBadge;
}

export async function updateBadge(id: number, data: Partial<Badge>) {
  const [updatedBadge] = await db
    .update(badges)
    .set(data)
    .where(eq(badges.id, id))
    .returning();
  return updatedBadge;
}

export async function deleteBadge(id: number) {
  await db.delete(badges).where(eq(badges.id, id));
  return { success: true };
}

// Badge Awarding
export async function awardBadge(awardData: InsertAwardedBadge) {
  const [newAward] = await db
    .insert(awardedBadges)
    .values(awardData)
    .returning();
  return newAward;
}

export async function getAwardedBadges(organizationId: number) {
  return db
    .select({
      id: awardedBadges.id,
      badgeId: awardedBadges.badgeId,
      userId: awardedBadges.userId,
      awardedBy: awardedBadges.awardedBy,
      awardedAt: awardedBadges.awardedAt,
      status: awardedBadges.status,
      badgeName: badges.name,
      badgeDescription: badges.description,
      badgeColor: badges.color,
      badgeImageUrl: badges.imageUrl,
      userName: users.name,
      awardedByName: sql<string>`awarded_by_user.name`,
    })
    .from(awardedBadges)
    .innerJoin(badges, eq(awardedBadges.badgeId, badges.id))
    .innerJoin(users, eq(awardedBadges.userId, users.id))
    .innerJoin(
      sql`users as awarded_by_user`,
      eq(awardedBadges.awardedBy, sql`awarded_by_user.id`),
    )
    .where(eq(badges.organizationId, organizationId))
    .orderBy(desc(awardedBadges.awardedAt));
}

export async function getUserAwardedBadges(userId: number) {
  return db
    .select({
      id: awardedBadges.id,
      badgeId: awardedBadges.badgeId,
      userId: awardedBadges.userId,
      awardedBy: awardedBadges.awardedBy,
      awardedAt: awardedBadges.awardedAt,
      status: awardedBadges.status,
      badgeName: badges.name,
      badgeDescription: badges.description,
      badgeColor: badges.color,
      badgeImageUrl: badges.imageUrl,
      awardedByName: sql<string>`awarded_by_user.name`,
    })
    .from(awardedBadges)
    .innerJoin(badges, eq(awardedBadges.badgeId, badges.id))
    .innerJoin(
      sql`users as awarded_by_user`,
      eq(awardedBadges.awardedBy, sql`awarded_by_user.id`),
    )
    .where(eq(awardedBadges.userId, userId))
    .orderBy(desc(awardedBadges.awardedAt));
}

// Badge Progress - These functions now use the updated progress/metrics model
export async function getBadgeProgress(badgeId: number, userId: number) {
  try {
    // Get metrics associated with the badge
    const badgeMetricsResult = await db
      .select({
        metricId: badgeMetrics.metricId,
      })
      .from(badgeMetrics)
      .where(eq(badgeMetrics.badgeId, badgeId));

    if (badgeMetricsResult.length === 0) {
      return null; // No metrics for this badge
    }

    const metricIds = badgeMetricsResult.map((bm) => bm.metricId);

    // Get progress for these metrics and user
    const progressItems = await db
      .select({
        id: progress.id,
        userId: progress.userId,
        metricId: progress.metricId,
        value: progress.value,
        lastUpdatedAt: progress.lastUpdatedAt,
        updatedBy: progress.updatedBy,
        metricName: metrics.name,
        metricDescription: metrics.description,
        metricType: metrics.type,
        targetValue: metrics.targetValue,
      })
      .from(progress)
      .innerJoin(metrics, eq(progress.metricId, metrics.id))
      .where(
        and(inArray(progress.metricId, metricIds), eq(progress.userId, userId)),
      );

    // Get badge details
    const badgeDetails = await getBadgeById(badgeId);

    if (!badgeDetails) {
      return null;
    }

    // Calculate overall progress percentage
    const totalMetrics = metricIds.length;
    let completedValue = 0;

    progressItems.forEach((item) => {
      if (item.metricType === "boolean" && item.value === "true") {
        completedValue += 1;
      } else if (item.metricType === "numeric") {
        const currentValue = parseInt(item.value);
        const targetValue = item.targetValue;
        if (currentValue >= targetValue) {
          completedValue += 1;
        } else {
          completedValue += currentValue / targetValue;
        }
      }
    });

    const progressPercentage =
      totalMetrics > 0 ? Math.round((completedValue / totalMetrics) * 100) : 0;

    const status = progressPercentage >= 100 ? "completed" : "in_progress";

    // Construct the response in a format compatible with the old API
    return {
      id: progressItems.length > 0 ? progressItems[0].id : 0,
      userId: userId,
      badgeId: badgeId,
      progress: progressPercentage,
      progressData: progressItems.reduce(
        (acc, item) => {
          acc[item.metricId] = {
            value: item.value,
            name: item.metricName,
            description: item.metricDescription,
            type: item.metricType,
            targetValue: item.targetValue,
          };
          return acc;
        },
        {} as Record<number, any>,
      ),
      lastUpdated:
        progressItems.length > 0 ? progressItems[0].lastUpdatedAt : new Date(),
      status: status,
      badge: badgeDetails,
      metrics: progressItems,
    };
  } catch (error) {
    console.error("Error in getBadgeProgress:", error);
    throw error;
  }
}

export async function getUserProgressForAllBadges(userId: number) {
  try {
    // Get all badges that have metrics
    const badgesWithMetrics = await db
      .select({
        badgeId: badgeMetrics.badgeId,
      })
      .from(badgeMetrics)
      .groupBy(badgeMetrics.badgeId);

    const badgeIds = badgesWithMetrics.map((b) => b.badgeId);

    // No badges with metrics
    if (badgeIds.length === 0) {
      return [];
    }

    // Get progress for all metrics for this user
    const userProgress = await db
      .select({
        id: progress.id,
        userId: progress.userId,
        metricId: progress.metricId,
        value: progress.value,
        lastUpdatedAt: progress.lastUpdatedAt,
        updatedBy: progress.updatedBy,
        metricName: metrics.name,
        metricDescription: metrics.description,
        metricType: metrics.type,
        targetValue: metrics.targetValue,
        updatedByName: sql<string>`updated_by_user.name`,
      })
      .from(progress)
      .innerJoin(metrics, eq(progress.metricId, metrics.id))
      .innerJoin(badgeMetrics, eq(metrics.id, badgeMetrics.metricId))
      .innerJoin(
        sql`users as updated_by_user`,
        eq(progress.updatedBy, sql`updated_by_user.id`),
      )
      .where(eq(progress.userId, userId));

    // Group progress by badge
    const progressByBadge: Record<number, any[]> = {};
    for (const item of userProgress) {
      // Get badge_id from badgeMetrics
      const badgeMetricItem = await db
        .select()
        .from(badgeMetrics)
        .where(eq(badgeMetrics.metricId, item.metricId))
        .limit(1);

      if (badgeMetricItem.length > 0) {
        const badgeId = badgeMetricItem[0].badgeId;
        if (!progressByBadge[badgeId]) {
          progressByBadge[badgeId] = [];
        }
        progressByBadge[badgeId].push(item);
      }
    }

    // Create combined progress objects
    const result = [];
    for (const [badgeId, items] of Object.entries(progressByBadge)) {
      const badgeDetails = await getBadgeById(parseInt(badgeId));
      if (!badgeDetails) continue;

      // Calculate overall progress
      const totalMetrics = items.length;
      let completedValue = 0;

      items.forEach((item) => {
        if (item.metricType === "boolean" && item.value === "true") {
          completedValue += 1;
        } else if (item.metricType === "numeric") {
          const currentValue = parseInt(item.value);
          const targetValue = item.targetValue;
          if (currentValue >= targetValue) {
            completedValue += 1;
          } else {
            completedValue += currentValue / targetValue;
          }
        }
      });

      const progressPercentage =
        totalMetrics > 0
          ? Math.round((completedValue / totalMetrics) * 100)
          : 0;

      const status = progressPercentage >= 100 ? "completed" : "in_progress";

      // Create a compatible response format
      result.push({
        id: items[0].id,
        badgeId: parseInt(badgeId),
        userId: userId,
        progress: progressPercentage,
        progressData: items.reduce(
          (acc, item) => {
            acc[item.metricId] = {
              value: item.value,
              name: item.metricName,
              description: item.metricDescription,
              type: item.metricType,
              targetValue: item.targetValue,
            };
            return acc;
          },
          {} as Record<number, any>,
        ),
        lastUpdated: items[0].lastUpdatedAt,
        updatedBy: items[0].updatedBy,
        status: status,
        badgeName: badgeDetails.name,
        badgeDescription: badgeDetails.description,
        badgeColor: badgeDetails.color,
        badgeImageUrl: badgeDetails.imageUrl,
        requiresProgress: true,
        criteriaSections: badgeDetails.criteriaSections,
        updatedByName: items[0].updatedByName,
      });
    }

    return result.sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );
  } catch (error) {
    console.error("Error in getUserProgressForAllBadges:", error);
    throw error;
  }
}

export async function getBadgeProgressForOrganization(organizationId: number) {
  try {
    // Get all badges in the organization that have metrics
    const badgesInOrg = await db
      .select({
        id: badges.id,
        name: badges.name,
      })
      .from(badges)
      .innerJoin(badgeMetrics, eq(badges.id, badgeMetrics.badgeId))
      .where(eq(badges.organizationId, organizationId))
      .groupBy(badges.id);

    if (badgesInOrg.length === 0) {
      return [];
    }

    const badgeIds = badgesInOrg.map((b) => b.id);

    // Get all metrics for these badges
    const badgeMetricsItems = await db
      .select({
        badgeId: badgeMetrics.badgeId,
        metricId: badgeMetrics.metricId,
      })
      .from(badgeMetrics)
      .where(inArray(badgeMetrics.badgeId, badgeIds));

    const metricIds = badgeMetricsItems.map((bm) => bm.metricId);

    // Get progress for these metrics
    const progressItems = await db
      .select({
        id: progress.id,
        userId: progress.userId,
        metricId: progress.metricId,
        value: progress.value,
        lastUpdatedAt: progress.lastUpdatedAt,
        updatedBy: progress.updatedBy,
        userName: users.name,
        updatedByName: sql<string>`updated_by_user.name`,
        metricName: metrics.name,
      })
      .from(progress)
      .innerJoin(users, eq(progress.userId, users.id))
      .innerJoin(metrics, eq(progress.metricId, metrics.id))
      .innerJoin(
        sql`users as updated_by_user`,
        eq(progress.updatedBy, sql`updated_by_user.id`),
      )
      .where(inArray(progress.metricId, metricIds))
      .orderBy(desc(progress.lastUpdatedAt));

    // Group progress by user and badge
    const groupedProgress: Record<string, any[]> = {};
    for (const item of progressItems) {
      // Find which badge this metric belongs to
      const badgeMetric = badgeMetricsItems.find(
        (bm) => bm.metricId === item.metricId,
      );
      if (!badgeMetric) continue;

      const key = `${item.userId}-${badgeMetric.badgeId}`;
      if (!groupedProgress[key]) {
        groupedProgress[key] = [];
      }
      groupedProgress[key].push({
        ...item,
        badgeId: badgeMetric.badgeId,
      });
    }

    // Format the response
    const result = [];
    for (const [_key, items] of Object.entries(groupedProgress)) {
      if (items.length === 0) continue;

      const badgeId = items[0].badgeId;
      const badgeName = badgesInOrg.find((b) => b.id === badgeId)?.name || "";

      // Get the first item for common fields
      const firstItem = items[0];

      result.push({
        id: firstItem.id,
        badgeId: badgeId,
        userId: firstItem.userId,
        lastUpdated: firstItem.lastUpdatedAt,
        updatedBy: firstItem.updatedBy,
        badgeName: badgeName,
        userName: firstItem.userName,
        updatedByName: firstItem.updatedByName,
        // These are placeholders to maintain API compatibility
        progress: 0, // Will be calculated properly in the client
        status: "in_progress",
      });
    }

    return result;
  } catch (error) {
    console.error("Error in getBadgeProgressForOrganization:", error);
    throw error;
  }
}

export async function createOrUpdateBadgeProgress(progressData: any) {
  try {
    // Start a transaction
    return await db.transaction(async (tx) => {
      // Extract badge and metric ids
      const { badgeId, userId, metrics: metricsData } = progressData;

      // Get all metrics for this badge
      const badgeMetricsItems = await tx
        .select({
          metricId: badgeMetrics.metricId,
        })
        .from(badgeMetrics)
        .where(eq(badgeMetrics.badgeId, badgeId));

      const metricIds = badgeMetricsItems.map((bm) => bm.metricId);

      // Process each metric
      const updatedProgress = [];
      for (const metricId of metricIds) {
        const metricValue =
          metricsData && metricsData[metricId]
            ? metricsData[metricId].value
            : "0";

        // Check if progress exists
        const existingProgress = await tx
          .select()
          .from(progress)
          .where(
            and(eq(progress.metricId, metricId), eq(progress.userId, userId)),
          )
          .limit(1);

        if (existingProgress.length > 0) {
          // Update existing
          const [updated] = await tx
            .update(progress)
            .set({
              value: metricValue,
              lastUpdatedAt: new Date(),
              updatedBy: progressData.updatedBy,
            })
            .where(eq(progress.id, existingProgress[0].id))
            .returning();

          updatedProgress.push(updated);
        } else {
          // Create new
          const [newProgress] = await tx
            .insert(progress)
            .values({
              userId: userId,
              metricId: metricId,
              value: metricValue,
              updatedBy: progressData.updatedBy,
              createdBy: progressData.updatedBy,
            })
            .returning();

          updatedProgress.push(newProgress);
        }
      }

      // Check if all metrics are complete and award the badge if needed
      const badgeProgress = await getBadgeProgress(badgeId, userId);
      if (badgeProgress && badgeProgress.progress >= 100) {
        await autoAwardBadgeIfComplete({
          badgeId,
          userId,
          updatedBy: progressData.updatedBy,
        });
      }

      return badgeProgress;
    });
  } catch (error) {
    console.error("Error in createOrUpdateBadgeProgress:", error);
    throw error;
  }
}

// Auto-award badge when progress reaches 100%
export async function autoAwardBadgeIfComplete(data: {
  badgeId: number;
  userId: number;
  updatedBy: number;
}) {
  // Check if the badge has already been awarded
  const existingAward = await db.query.achievements.findFirst({
    where: and(
      eq(achievements.badgeId, data.badgeId),
      eq(achievements.userId, data.userId),
    ),
  });

  if (!existingAward) {
    // Award the badge
    await db.insert(achievements).values({
      badgeId: data.badgeId,
      userId: data.userId,
      awardedBy: data.updatedBy,
      status: "completed",
      awardedAt: new Date(),
      createdBy: data.updatedBy,
    });

    return true;
  }

  return false;
}

// Statistics
export async function getOrganizationStats(organizationId: number) {
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
