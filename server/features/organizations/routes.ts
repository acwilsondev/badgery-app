import type { Express } from "express";
import {
  organizationsInsertSchema,
  badgeCategoriesInsertSchema,
} from "@shared/schema";
import type { OrganizationRef } from "@shared/api-types";
import { asyncHandler } from "../../middleware/asyncHandler";
import {
  isAuthenticated,
  hasOrganizationAccess,
  isAdminOrManager,
  requireSessionUserId,
} from "../../middleware/auth";
import { ForbiddenError, NotFoundError } from "../../middleware/errors";
import { getRequesterOrThrow } from "../users/service";
import {
  getOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  getBadgeCategories,
  createBadgeCategory,
  getOrganizationStats,
} from "./service";

export function registerOrganizationsRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  app.get(
    `${apiPrefix}/organizations`,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const userId = req.session.userId;

      // If we have a userId, get only organizations the user belongs to
      if (userId) {
        const user = await getRequesterOrThrow(userId);
        if (user.role === "admin") {
          // Admins can see all organizations
          const organizations = await getOrganizations();
          return res.status(200).json(organizations);
        } else {
          // Regular users only see organizations they belong to
          const response: OrganizationRef[] = user.organizations;
          return res.status(200).json(response);
        }
      }

      return res.status(401).json({ message: "Not authenticated" });
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:id`,
    isAuthenticated,
    hasOrganizationAccess,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const organization = await getOrganizationById(id);

      if (!organization) {
        throw new NotFoundError("Organization not found");
      }

      return res.status(200).json(organization);
    }),
  );

  app.post(
    `${apiPrefix}/organizations`,
    isAuthenticated,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const organizationData = organizationsInsertSchema.parse(req.body);
      const newOrganization = await createOrganization({
        ...organizationData,
        createdBy: req.session.userId || null,
      });

      return res.status(201).json(newOrganization);
    }),
  );

  app.put(
    `${apiPrefix}/organizations/:id`,
    isAuthenticated,
    hasOrganizationAccess,
    isAdminOrManager,
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      const updateData = {
        // createdBy is an audit field, never client-assignable
        ...organizationsInsertSchema
          .omit({ createdBy: true })
          .partial()
          .parse(req.body),
        updatedBy: req.session.userId || null,
      };

      const updatedOrganization = await updateOrganization(id, updateData);

      if (!updatedOrganization) {
        throw new NotFoundError("Organization not found");
      }

      return res.status(200).json(updatedOrganization);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/categories`,
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

      const categories = await getBadgeCategories(orgId);

      return res.status(200).json(categories);
    }),
  );

  app.post(
    `${apiPrefix}/organizations/:orgId/categories`,
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

      const categoryData = badgeCategoriesInsertSchema.parse(req.body);

      const newCategory = await createBadgeCategory({
        ...categoryData,
        organizationId: orgId,
        createdBy: req.session.userId || null,
      });

      return res.status(201).json(newCategory);
    }),
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/stats`,
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

      const stats = await getOrganizationStats(orgId);

      return res.status(200).json(stats);
    }),
  );
}
