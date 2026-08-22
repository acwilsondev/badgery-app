import { db } from "@db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  achievements,
  badges,
  users,
  progress,
  metrics,
  badgeMetrics,
  type InsertAchievement,
} from "@shared/schema";
import { getBadgeById } from "../badges/service";
import type {
  OrgAwardedBadge,
  UserAwardedBadge,
  BadgeProgressDetail,
  UserBadgeProgressSummary,
  OrgBadgeProgressSummary,
} from "@shared/api-types";

export async function awardBadge(awardData: InsertAchievement) {
  const [newAward] = await db
    .insert(achievements)
    .values(awardData)
    .returning();
  return newAward;
}

export async function getAwardedBadges(
  organizationId: number,
): Promise<OrgAwardedBadge[]> {
  return db
    .select({
      id: achievements.id,
      badgeId: achievements.badgeId,
      userId: achievements.userId,
      awardedBy: achievements.awardedBy,
      awardedAt: achievements.awardedAt,
      status: achievements.status,
      badgeName: badges.name,
      badgeDescription: badges.description,
      badgeColor: badges.color,
      badgeImageUrl: badges.imageUrl,
      userName: users.name,
      awardedByName: sql<string>`awarded_by_user.name`,
    })
    .from(achievements)
    .innerJoin(badges, eq(achievements.badgeId, badges.id))
    .innerJoin(users, eq(achievements.userId, users.id))
    .innerJoin(
      sql`users as awarded_by_user`,
      eq(achievements.awardedBy, sql`awarded_by_user.id`),
    )
    .where(eq(badges.organizationId, organizationId))
    .orderBy(desc(achievements.awardedAt));
}

export async function getUserAwardedBadges(
  userId: number,
): Promise<UserAwardedBadge[]> {
  return db
    .select({
      id: achievements.id,
      badgeId: achievements.badgeId,
      userId: achievements.userId,
      awardedBy: achievements.awardedBy,
      awardedAt: achievements.awardedAt,
      status: achievements.status,
      badgeName: badges.name,
      badgeDescription: badges.description,
      badgeColor: badges.color,
      badgeImageUrl: badges.imageUrl,
      awardedByName: sql<string>`awarded_by_user.name`,
    })
    .from(achievements)
    .innerJoin(badges, eq(achievements.badgeId, badges.id))
    .innerJoin(
      sql`users as awarded_by_user`,
      eq(achievements.awardedBy, sql`awarded_by_user.id`),
    )
    .where(eq(achievements.userId, userId))
    .orderBy(desc(achievements.awardedAt));
}

// Badge Progress - These functions use the metrics/progress model
export async function getBadgeProgress(
  badgeId: number,
  userId: number,
): Promise<BadgeProgressDetail | null> {
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

export async function getUserProgressForAllBadges(
  userId: number,
): Promise<UserBadgeProgressSummary[]> {
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
    const result: UserBadgeProgressSummary[] = [];
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

export async function getBadgeProgressForOrganization(
  organizationId: number,
): Promise<OrgBadgeProgressSummary[]> {
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
    for (const [, items] of Object.entries(groupedProgress)) {
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

export async function createOrUpdateBadgeProgress(
  progressData: any,
): Promise<BadgeProgressDetail | null> {
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
      status: "achieved",
      awardedAt: new Date(),
      createdBy: data.updatedBy,
    });

    return true;
  }

  return false;
}
