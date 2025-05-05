import { db, pool } from "@db";
import { eq, and, desc, sql, count, asc } from "drizzle-orm";
import { 
  organizations, 
  users, 
  badges, 
  badgeCategories, 
  awardedBadges,
  badgeProgress,
  type Organization,
  type User,
  type Badge,
  type BadgeCategory,
  type AwardedBadge,
  type BadgeProgress
} from "@shared/schema";

// Organizations
export async function getOrganizations() {
  return db.query.organizations.findMany({
    orderBy: asc(organizations.name),
  });
}

export async function getOrganizationById(id: number) {
  return db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
}

export async function createOrganization(organization: Omit<Organization, "id" | "createdAt">) {
  const [newOrganization] = await db.insert(organizations)
    .values(organization)
    .returning();
  return newOrganization;
}

export async function updateOrganization(id: number, data: Partial<Organization>) {
  const [updatedOrganization] = await db.update(organizations)
    .set(data)
    .where(eq(organizations.id, id))
    .returning();
  return updatedOrganization;
}

// Users
export async function getUsers() {
  return db.query.users.findMany({
    orderBy: asc(users.name),
  });
}

export async function getUsersByOrganization(organizationId: number) {
  return db.query.users.findMany({
    where: eq(users.organizationId, organizationId),
    orderBy: asc(users.name),
  });
}

export async function getUserById(id: number) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
    with: {
      organization: true,
    },
  });
}

export async function getUserByUsername(username: string) {
  return db.query.users.findFirst({
    where: eq(users.username, username),
    with: {
      organization: true,
    },
  });
}

export async function createUser(user: Omit<User, "id" | "createdAt">) {
  const [newUser] = await db.insert(users).values(user).returning();
  return newUser;
}

export async function updateUser(id: number, data: Partial<User>) {
  const [updatedUser] = await db.update(users)
    .set(data)
    .where(eq(users.id, id))
    .returning();
  return updatedUser;
}

// Badge Categories
export async function getBadgeCategories(organizationId: number) {
  return db.query.badgeCategories.findMany({
    where: eq(badgeCategories.organizationId, organizationId),
    orderBy: asc(badgeCategories.name),
  });
}

export async function getBadgeCategoryById(id: number) {
  return db.query.badgeCategories.findFirst({
    where: eq(badgeCategories.id, id),
  });
}

export async function createBadgeCategory(category: Omit<BadgeCategory, "id" | "createdAt">) {
  const [newCategory] = await db.insert(badgeCategories)
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
    return result.rows.map(row => ({
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
      criteriaType: row.criteria_type || 'binary',
      category: row.category_id ? {
        id: row.category_id,
        name: row.category_name
      } : null
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
      criteriaType: row.criteria_type || 'binary',
      category: row.category_id ? {
        id: row.category_id,
        name: row.category_name
      } : null
    };
  } catch (error) {
    console.error("Error in getBadgeById:", error);
    throw error;
  }
}

export async function createBadge(badge: Omit<Badge, "id" | "createdAt">) {
  const [newBadge] = await db.insert(badges).values(badge).returning();
  return newBadge;
}

export async function updateBadge(id: number, data: Partial<Badge>) {
  const [updatedBadge] = await db.update(badges)
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
export async function awardBadge(awardData: Omit<AwardedBadge, "id" | "awardedAt">) {
  const [newAward] = await db.insert(awardedBadges)
    .values(awardData)
    .returning();
  return newAward;
}

export async function getAwardedBadges(organizationId: number) {
  return db.select({
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
  .innerJoin(sql`users as awarded_by_user`, eq(awardedBadges.awardedBy, sql`awarded_by_user.id`))
  .where(eq(badges.organizationId, organizationId))
  .orderBy(desc(awardedBadges.awardedAt));
}

export async function getUserAwardedBadges(userId: number) {
  return db.select({
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
  .innerJoin(sql`users as awarded_by_user`, eq(awardedBadges.awardedBy, sql`awarded_by_user.id`))
  .where(eq(awardedBadges.userId, userId))
  .orderBy(desc(awardedBadges.awardedAt));
}

// Badge Progress
export async function getBadgeProgress(badgeId: number, userId: number) {
  return db.query.badgeProgress.findFirst({
    where: and(
      eq(badgeProgress.badgeId, badgeId),
      eq(badgeProgress.userId, userId)
    ),
    with: {
      badge: true,
      user: true,
      updatedByUser: true
    }
  });
}

export async function getUserProgressForAllBadges(userId: number) {
  return db.select({
    id: badgeProgress.id,
    badgeId: badgeProgress.badgeId,
    userId: badgeProgress.userId,
    progress: badgeProgress.progress,
    progressData: badgeProgress.progressData,
    lastUpdated: badgeProgress.lastUpdated,
    updatedBy: badgeProgress.updatedBy,
    notes: badgeProgress.notes,
    status: badgeProgress.status,
    badgeName: badges.name,
    badgeDescription: badges.description,
    badgeColor: badges.color,
    badgeImageUrl: badges.imageUrl,
    requiresProgress: badges.requiresProgress,
    criteriaSections: badges.criteriaSections,
    updatedByName: sql<string>`updated_by_user.name`,
  })
  .from(badgeProgress)
  .innerJoin(badges, eq(badgeProgress.badgeId, badges.id))
  .innerJoin(sql`users as updated_by_user`, eq(badgeProgress.updatedBy, sql`updated_by_user.id`))
  .where(eq(badgeProgress.userId, userId))
  .orderBy(desc(badgeProgress.lastUpdated));
}

export async function getBadgeProgressForOrganization(organizationId: number) {
  return db.select({
    id: badgeProgress.id,
    badgeId: badgeProgress.badgeId,
    userId: badgeProgress.userId,
    progress: badgeProgress.progress,
    progressData: badgeProgress.progressData,
    lastUpdated: badgeProgress.lastUpdated,
    updatedBy: badgeProgress.updatedBy,
    notes: badgeProgress.notes,
    status: badgeProgress.status,
    badgeName: badges.name,
    userName: users.name,
    updatedByName: sql<string>`updated_by_user.name`,
  })
  .from(badgeProgress)
  .innerJoin(badges, eq(badgeProgress.badgeId, badges.id))
  .innerJoin(users, eq(badgeProgress.userId, users.id))
  .innerJoin(sql`users as updated_by_user`, eq(badgeProgress.updatedBy, sql`updated_by_user.id`))
  .where(eq(badges.organizationId, organizationId))
  .orderBy(desc(badgeProgress.lastUpdated));
}

export async function createOrUpdateBadgeProgress(progressData: Omit<BadgeProgress, "id" | "lastUpdated">) {
  // Check if progress record exists
  const existingProgress = await db.query.badgeProgress.findFirst({
    where: and(
      eq(badgeProgress.badgeId, progressData.badgeId),
      eq(badgeProgress.userId, progressData.userId)
    )
  });

  if (existingProgress) {
    // Update existing progress
    const [updatedProgress] = await db.update(badgeProgress)
      .set({
        ...progressData,
        lastUpdated: new Date(),
      })
      .where(eq(badgeProgress.id, existingProgress.id))
      .returning();
    return updatedProgress;
  } else {
    // Create new progress
    const [newProgress] = await db.insert(badgeProgress)
      .values(progressData)
      .returning();
    return newProgress;
  }
}

// Auto-award badge when progress reaches 100%
export async function autoAwardBadgeIfComplete(progressData: BadgeProgress) {
  // Check if the progress is at 100% and status is 'in_progress'
  if (Number(progressData.progress) === 100 && progressData.status === 'in_progress') {
    // Check if the badge has already been awarded
    const existingAward = await db.query.awardedBadges.findFirst({
      where: and(
        eq(awardedBadges.badgeId, progressData.badgeId),
        eq(awardedBadges.userId, progressData.userId)
      )
    });

    if (!existingAward) {
      // Award the badge
      await db.insert(awardedBadges).values({
        badgeId: progressData.badgeId,
        userId: progressData.userId,
        awardedBy: progressData.updatedBy,
        status: 'completed'
      });

      // Update the progress status
      await db.update(badgeProgress)
        .set({ status: 'completed' })
        .where(eq(badgeProgress.id, progressData.id));

      return true;
    }
  }
  return false;
}

// Statistics
export async function getOrganizationStats(organizationId: number) {
  const badgeCount = await db
    .select({ count: count() })
    .from(badges)
    .where(eq(badges.organizationId, organizationId));

  const userCount = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.organizationId, organizationId));

  const awardCount = await db
    .select({ count: count() })
    .from(awardedBadges)
    .innerJoin(badges, eq(awardedBadges.badgeId, badges.id))
    .where(eq(badges.organizationId, organizationId));

  const inProgressCount = await db
    .select({ count: count() })
    .from(badgeProgress)
    .innerJoin(badges, eq(badgeProgress.badgeId, badges.id))
    .where(and(
      eq(badges.organizationId, organizationId),
      eq(badgeProgress.status, 'in_progress')
    ));

  return {
    totalBadges: badgeCount[0]?.count || 0,
    totalUsers: userCount[0]?.count || 0,
    totalAwarded: awardCount[0]?.count || 0,
    inProgress: inProgressCount[0]?.count || 0,
  };
}
