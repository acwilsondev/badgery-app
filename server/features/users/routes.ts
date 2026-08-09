import type { Express } from "express";
import * as z from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { isAuthenticated, requireSessionUserId } from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import {
  getUsersByOrganization,
  getUserById,
  getRequesterOrThrow,
} from "./service";

export function registerUsersRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.get(
    `${apiPrefix}/organizations/:orgId/users`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const orgId = z.coerce.number().int().positive().parse(req.params.orgId);

      const userId = requireSessionUserId(req);
      const currentUser = await getRequesterOrThrow(userId);

      const hasAccess =
        currentUser.role === "admin" ||
        (currentUser.organizations &&
          currentUser.organizations.some((org: any) => org.id === orgId));

      if (!hasAccess) {
        throw new ForbiddenError("No access to this organization");
      }

      const users = await getUsersByOrganization(orgId);

      return res.status(200).json(users);
    }),
  );

  app.get(
    `${apiPrefix}/users/:id`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const user = await getUserById(id);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // If requesting another user, verify they're in the same organization
      const requesterId = requireSessionUserId(req);

      if (id !== requesterId) {
        const requester = await getRequesterOrThrow(requesterId);

        // Admin can view any user
        if (requester.role !== "admin") {
          // Check if the requested user and requester share any organization
          const requesterOrgIds = requester.organizations
            ? requester.organizations.map((org: any) => org.id)
            : [];
          const userOrgIds = user.organizations
            ? user.organizations.map((org: any) => org.id)
            : [];

          // Find common organizations
          const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
            userOrgIds.includes(orgId),
          );

          if (sharedOrgs.length === 0) {
            throw new ForbiddenError("No access to this user");
          }
        }
      }

      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizations: user.organizations || [],
      });
    }),
  );
}
