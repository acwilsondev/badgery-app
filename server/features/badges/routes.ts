import type { Express } from "express";
import { badgesInsertSchema } from "@shared/schema";
import { asyncHandler } from "../../middleware/asyncHandler";
import {
  isAuthenticated,
  isAdminOrManager,
  requireSessionUserId,
} from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import { getRequesterOrThrow } from "../users/service";
import type {
  BadgeWriteResponse,
  DeleteBadgeResponse,
} from "@shared/api-types";
import {
  getBadges,
  getBadgeById,
  createBadge,
  updateBadge,
  deleteBadge,
} from "./service";

export function registerBadgesRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.get(
    `${apiPrefix}/organizations/:orgId/badges`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = parseInt(req.params.orgId);
      const categoryId = req.query.categoryId
        ? parseInt(req.query.categoryId as string)
        : undefined;

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const badges = await getBadges(orgId, categoryId);

      return res.status(200).json(badges);
    }),
  );

  app.get(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const badge = await getBadgeById(id);

      if (!badge) {
        throw new NotFoundError("Badge not found");
      }

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      return res.status(200).json(badge);
    }),
  );

  app.post(
    `${apiPrefix}/organizations/:orgId/badges`,
    isAuthenticated,
    isAdminOrManager,
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

      const badgeData = badgesInsertSchema.parse(req.body);

      const newBadge = await createBadge({
        ...badgeData,
        organizationId: orgId,
        createdBy: req.session.userId || null,
      });

      const response: BadgeWriteResponse = newBadge;
      return res.status(201).json(response);
    }),
  );

  app.put(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const existingBadge = await getBadgeById(id);

      if (!existingBadge) {
        throw new NotFoundError("Badge not found");
      }

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some(
            (org: any) => org.id === existingBadge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      const updateData = {
        // organizationId is the tenant boundary and createdBy is an audit
        // field — neither is client-assignable via this update endpoint
        ...badgesInsertSchema
          .omit({ organizationId: true, createdBy: true })
          .partial()
          .parse(req.body),
        updatedBy: req.session.userId || null,
      };

      const updatedBadge = await updateBadge(id, updateData);

      if (!updatedBadge) {
        throw new NotFoundError("Badge not found");
      }

      const response: BadgeWriteResponse = updatedBadge;
      return res.status(200).json(response);
    }),
  );

  app.delete(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const existingBadge = await getBadgeById(id);

      if (!existingBadge) {
        throw new NotFoundError("Badge not found");
      }

      const userId = requireSessionUserId(req);
      const user = await getRequesterOrThrow(userId);

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some(
            (org: any) => org.id === existingBadge.organizationId,
          ));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this badge's organization");
      }

      await deleteBadge(id);

      const response: DeleteBadgeResponse = {
        message: "Badge deleted successfully",
      };
      return res.status(200).json(response);
    }),
  );
}
