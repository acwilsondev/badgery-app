import type { Express } from "express";
import * as z from "zod";
import { achievementsInsertSchema } from "@shared/schema";
import { asyncHandler } from "../../middleware/asyncHandler";
import {
  isAuthenticated,
  isAdminOrManager,
  requireSessionUserId,
} from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import { getRequesterOrThrow, getUserById } from "../users/service";
import { getBadgeById } from "../badges/service";
import {
  awardBadge,
  getAwardedBadges,
  getUserAwardedBadges,
  getBadgeProgress,
  getUserProgressForAllBadges,
  getBadgeProgressForOrganization,
  createOrUpdateBadgeProgress,
  autoAwardBadgeIfComplete,
} from "./service";

export function registerProgressRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.post(
    `${apiPrefix}/badges/:badgeId/award`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const badgeId = parseInt(req.params.badgeId);
      const { userId } = z
        .object({ userId: z.coerce.number().int().positive() })
        .parse(req.body);

      const badge = await getBadgeById(badgeId);
      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const currentUserId = requireSessionUserId(req);
      const currentUser = await getRequesterOrThrow(currentUserId);

      const hasAccess =
        currentUser.role === "admin" ||
        (currentUser.organizations &&
          currentUser.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      const targetUser = await getUserById(userId);
      if (!targetUser) {
        throw new NotFoundError("Target user not found");
      }

      const targetUserHasAccess =
        targetUser.organizations &&
        targetUser.organizations.some(
          (org: any) => org.id === badge.organizationId,
        );

      if (!targetUserHasAccess) {
        throw new ForbiddenError("Target user not in this badge's organization");
      }

      const awardData = achievementsInsertSchema.parse({
        badgeId,
        userId,
        awardedBy: req.session.userId,
        status: "achieved",
      });

      const newAward = await awardBadge(awardData);

      return res.status(201).json(newAward);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/awarded-badges`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const awardedBadges = await getAwardedBadges(orgId);

      return res.status(200).json(awardedBadges);
    }),
  );

  app.get(
    `${apiPrefix}/users/:userId/awarded-badges`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const targetUserId = parseInt(req.params.userId);
      const requesterId = requireSessionUserId(req);

      // If the user is requesting their own data, allow it
      if (targetUserId === requesterId) {
        const awardedBadges = await getUserAwardedBadges(targetUserId);
        return res.status(200).json(awardedBadges);
      }

      // If requesting another user's data, check permissions
      const requester = await getRequesterOrThrow(requesterId);
      const targetUser = await getUserById(targetUserId);

      if (!targetUser) {
        throw new NotFoundError("User not found");
      }

      // Admin can view any user's badges
      if (requester.role === "admin") {
        const awardedBadges = await getUserAwardedBadges(targetUserId);
        return res.status(200).json(awardedBadges);
      }

      // Check if they share any organization (can only see each other if in same org)
      const requesterOrgIds = requester.organizations
        ? requester.organizations.map((org: any) => org.id)
        : [];
      const targetUserOrgIds = targetUser.organizations
        ? targetUser.organizations.map((org: any) => org.id)
        : [];

      const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
        targetUserOrgIds.includes(orgId),
      );

      if (sharedOrgs.length === 0) {
        throw new ForbiddenError("No access to this user");
      }

      const awardedBadges = await getUserAwardedBadges(targetUserId);

      return res.status(200).json(awardedBadges);
    }),
  );

  app.get(
    `${apiPrefix}/badges/:badgeId/progress/:userId`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const badgeId = parseInt(req.params.badgeId);
      const targetUserId = parseInt(req.params.userId);
      const requesterId = requireSessionUserId(req);

      const badge = await getBadgeById(badgeId);
      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const requester = await getRequesterOrThrow(requesterId);

      const hasAccessToBadge =
        requester.role === "admin" ||
        (requester.organizations &&
          requester.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccessToBadge) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      if (targetUserId !== requesterId) {
        if (requester.role !== "admin") {
          const targetUser = await getUserById(targetUserId);

          if (!targetUser) {
            throw new NotFoundError("Target user not found");
          }

          const targetUserAccessToBadge =
            targetUser.organizations &&
            targetUser.organizations.some(
              (org: any) => org.id === badge.organizationId,
            );

          if (!targetUserAccessToBadge) {
            throw new ForbiddenError(
              "Target user not in this badge's organization",
            );
          }
        }
      }

      const progress = await getBadgeProgress(badgeId, targetUserId);

      if (!progress) {
        throw new NotFoundError("Progress not found");
      }

      return res.status(200).json(progress);
    }),
  );

  app.get(
    `${apiPrefix}/users/:userId/progress`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const targetUserId = parseInt(req.params.userId);
      const requesterId = requireSessionUserId(req);

      if (targetUserId === requesterId) {
        const progress = await getUserProgressForAllBadges(targetUserId);
        return res.status(200).json(progress);
      }

      const requester = await getRequesterOrThrow(requesterId);
      const targetUser = await getUserById(targetUserId);

      if (!targetUser) {
        throw new NotFoundError("User not found");
      }

      if (requester.role === "admin") {
        const progress = await getUserProgressForAllBadges(targetUserId);
        return res.status(200).json(progress);
      }

      const requesterOrgIds = requester.organizations
        ? requester.organizations.map((org: any) => org.id)
        : [];
      const targetUserOrgIds = targetUser.organizations
        ? targetUser.organizations.map((org: any) => org.id)
        : [];

      const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
        targetUserOrgIds.includes(orgId),
      );

      if (sharedOrgs.length === 0) {
        throw new ForbiddenError("No access to this user");
      }

      const progress = await getUserProgressForAllBadges(targetUserId);

      return res.status(200).json(progress);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/progress`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const progress = await getBadgeProgressForOrganization(orgId);

      return res.status(200).json(progress);
    }),
  );

  app.post(
    `${apiPrefix}/badges/:badgeId/progress/:userId`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const badgeId = parseInt(req.params.badgeId);
      const targetUserId = parseInt(req.params.userId);

      const badge = await getBadgeById(badgeId);
      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const requesterId = requireSessionUserId(req);
      const requester = await getRequesterOrThrow(requesterId);

      const hasAccess =
        requester.role === "admin" ||
        (requester.organizations &&
          requester.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        throw new NotFoundError("Target user not found");
      }

      const targetUserHasAccess =
        targetUser.organizations &&
        targetUser.organizations.some(
          (org: any) => org.id === badge.organizationId,
        );

      if (!targetUserHasAccess) {
        throw new ForbiddenError("Target user not in this badge's organization");
      }

      const body = z
        .object({
          progress: z.coerce.number().min(0).max(100).optional(),
          progressData: z.unknown().optional(),
          notes: z.string().optional(),
          status: z.string().optional(),
        })
        .parse(req.body);

      const progressData = {
        badgeId,
        userId: targetUserId,
        updatedBy: req.session.userId,
        progress: body.progress,
        progressData: body.progressData,
        notes: body.notes,
        status: body.status || "in_progress",
      };

      const updatedProgress = await createOrUpdateBadgeProgress(progressData);

      // Check if badge should be auto-awarded based on progress
      if (updatedProgress && Number(updatedProgress.progress) === 100) {
        await autoAwardBadgeIfComplete({
          badgeId,
          userId: targetUserId,
          updatedBy: requireSessionUserId(req),
        });
      }

      return res.status(200).json(updatedProgress);
    }),
  );
}
