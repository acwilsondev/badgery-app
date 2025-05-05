import { db } from "@db";
import { eq, and, desc, sql, count, asc } from "drizzle-orm";
import { 
  organizations, 
  users, 
  badges, 
  badgeCategories, 
  awardedBadges,
  type Organization,
  type User,
  type Badge,
  type BadgeCategory,
  type AwardedBadge
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
  const query = categoryId 
    ? and(eq(badges.organizationId, organizationId), eq(badges.categoryId, categoryId))
    : eq(badges.organizationId, organizationId);
  
  return db.query.badges.findMany({
    where: query,
    with: {
      category: true,
    },
    orderBy: asc(badges.name),
  });
}

export async function getBadgeById(id: number) {
  return db.query.badges.findFirst({
    where: eq(badges.id, id),
    with: {
      category: true,
    },
  });
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

  return {
    totalBadges: badgeCount[0]?.count || 0,
    totalUsers: userCount[0]?.count || 0,
    totalAwarded: awardCount[0]?.count || 0,
  };
}
