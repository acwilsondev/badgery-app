import type { Express } from "express";
import { createServer, type Server } from "http";
import * as storage from "./storage";
import * as z from "zod";
import { eq } from "drizzle-orm";
import { db } from "@db";
import {
  isAuthenticated,
  hasOrganizationAccess,
  isAdminOrManager,
} from "./middleware";
import {
  users,
  organizations,
  badges,
  badgeCategories,
  awardedBadges,
  badgeProgress,
  insertUserSchema,
  organizationsInsertSchema,
  badgesInsertSchema,
  badgeCategoriesInsertSchema,
  awardedBadgesInsertSchema,
  badgeProgressInsertSchema,
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // API version prefix
  const apiPrefix = "/api/v1";

  // Authentication endpoints
  app.post(`${apiPrefix}/auth/login`, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // In a real-world application, you would use a proper authentication system with hashed passwords
      req.session.userId = user.id;
      if (user.organizationId) {
        req.session.organizationId = user.organizationId;
      }

      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || null,
      });
    } catch (error) {
      console.error("Error during login:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(`${apiPrefix}/auth/register`, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(userData.username);

      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const newUser = await storage.createUser(userData);

      return res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        organizationId: newUser.organizationId || null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error during registration:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(`${apiPrefix}/auth/me`, async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || null,
      });
    } catch (error) {
      console.error("Error fetching current user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(`${apiPrefix}/auth/logout`, (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ message: "Logged out successfully" });
    });
  });

  // Organization endpoints
  app.get(`${apiPrefix}/organizations`, isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;

      // If we have a userId, get only organizations the user belongs to
      if (userId) {
        const user = await storage.getUserById(userId);
        if (user && user.role === "admin") {
          // Admins can see all organizations
          const organizations = await storage.getOrganizations();
          return res.status(200).json(organizations);
        } else if (user) {
          // Regular users only see organizations they belong to
          return res.status(200).json(user.organizations || []);
        }
      }

      return res.status(401).json({ message: "Not authenticated" });
    } catch (error) {
      console.error("Error fetching organizations:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(
    `${apiPrefix}/organizations/:id`,
    isAuthenticated,
    hasOrganizationAccess,
    async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const organization = await storage.getOrganizationById(id);

        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        return res.status(200).json(organization);
      } catch (error) {
        console.error("Error fetching organization:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    `${apiPrefix}/organizations`,
    isAuthenticated,
    isAdminOrManager,
    async (req, res) => {
      try {
        const organizationData = organizationsInsertSchema.parse(req.body);
        const newOrganization = await storage.createOrganization({
          ...organizationData,
          createdBy: req.session.userId || null,
        });

        return res.status(201).json(newOrganization);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ errors: error.errors });
        }
        console.error("Error creating organization:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    `${apiPrefix}/organizations/:id`,
    isAuthenticated,
    hasOrganizationAccess,
    isAdminOrManager,
    async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const updateData = {
          ...req.body,
          updatedBy: req.session.userId || null,
        };

        const updatedOrganization = await storage.updateOrganization(
          id,
          updateData,
        );

        if (!updatedOrganization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        return res.status(200).json(updatedOrganization);
      } catch (error) {
        console.error("Error updating organization:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Badge Category endpoints
  app.get(
    `${apiPrefix}/organizations/:orgId/categories`,
    isAuthenticated,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const categories = await storage.getBadgeCategories(orgId);

        return res.status(200).json(categories);
      } catch (error) {
        console.error("Error fetching badge categories:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    `${apiPrefix}/organizations/:orgId/categories`,
    isAuthenticated,
    isAdminOrManager,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const categoryData = badgeCategoriesInsertSchema.parse(req.body);

        const newCategory = await storage.createBadgeCategory({
          ...categoryData,
          organizationId: orgId,
          createdBy: req.session.userId || null,
        });

        return res.status(201).json(newCategory);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ errors: error.errors });
        }
        console.error("Error creating badge category:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Badge endpoints
  app.get(
    `${apiPrefix}/organizations/:orgId/badges`,
    isAuthenticated,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);
        const categoryId = req.query.categoryId
          ? parseInt(req.query.categoryId as string)
          : undefined;

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const badges = await storage.getBadges(orgId, categoryId);

        return res.status(200).json(badges);
      } catch (error) {
        console.error("Error fetching badges:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(`${apiPrefix}/badges/:id`, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const badge = await storage.getBadgeById(id);

      if (!badge) {
        return res.status(404).json({ message: "Badge not found" });
      }

      // Verify organization access
      const userId = req.session.userId;
      const user = await storage.getUserById(userId);

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const hasAccess =
        user.role === "admin" ||
        (user.organizations &&
          user.organizations.some(
            (org: any) => org.id === badge.organizationId,
          ));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "No access to this badge's organization" });
      }

      return res.status(200).json(badge);
    } catch (error) {
      console.error("Error fetching badge:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    `${apiPrefix}/organizations/:orgId/badges`,
    isAuthenticated,
    isAdminOrManager,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const badgeData = badgesInsertSchema.parse(req.body);

        const newBadge = await storage.createBadge({
          ...badgeData,
          organizationId: orgId,
          createdBy: req.session.userId || null,
        });

        return res.status(201).json(newBadge);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ errors: error.errors });
        }
        console.error("Error creating badge:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    isAdminOrManager,
    async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify badge exists
        const existingBadge = await storage.getBadgeById(id);
        if (!existingBadge) {
          return res.status(404).json({ message: "Badge not found" });
        }

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some(
              (org: any) => org.id === existingBadge.organizationId,
            ));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this badge's organization" });
        }

        const updateData = {
          ...req.body,
          updatedBy: req.session.userId || null,
        };

        const updatedBadge = await storage.updateBadge(id, updateData);

        if (!updatedBadge) {
          return res.status(404).json({ message: "Badge not found" });
        }

        return res.status(200).json(updatedBadge);
      } catch (error) {
        console.error("Error updating badge:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    `${apiPrefix}/badges/:id`,
    isAuthenticated,
    isAdminOrManager,
    async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify badge exists
        const existingBadge = await storage.getBadgeById(id);
        if (!existingBadge) {
          return res.status(404).json({ message: "Badge not found" });
        }

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some(
              (org: any) => org.id === existingBadge.organizationId,
            ));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this badge's organization" });
        }

        await storage.deleteBadge(id);

        return res.status(200).json({ message: "Badge deleted successfully" });
      } catch (error) {
        console.error("Error deleting badge:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // User endpoints
  app.get(
    `${apiPrefix}/organizations/:orgId/users`,
    isAuthenticated,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = req.session.userId;
        const currentUser = await storage.getUserById(userId);

        if (!currentUser) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          currentUser.role === "admin" ||
          (currentUser.organizations &&
            currentUser.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const users = await storage.getUsersByOrganization(orgId);

        return res.status(200).json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(`${apiPrefix}/users/:id`, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUserById(id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // If requesting another user, verify they're in the same organization
      const requesterId = req.session.userId;

      if (id !== requesterId) {
        const requester = await storage.getUserById(requesterId);

        if (!requester) {
          return res.status(401).json({ message: "Requester not found" });
        }

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
            return res.status(403).json({ message: "No access to this user" });
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
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Badge Awarding endpoints
  app.post(
    `${apiPrefix}/badges/:badgeId/award`,
    isAuthenticated,
    isAdminOrManager,
    async (req, res) => {
      try {
        const badgeId = parseInt(req.params.badgeId);
        const { userId } = req.body;

        // Get the badge to check organization access
        const badge = await storage.getBadgeById(badgeId);
        if (!badge) {
          return res.status(404).json({ message: "Badge not found" });
        }

        // Verify organization access
        const currentUserId = req.session.userId;
        const currentUser = await storage.getUserById(currentUserId);

        if (!currentUser) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          currentUser.role === "admin" ||
          (currentUser.organizations &&
            currentUser.organizations.some(
              (org: any) => org.id === badge.organizationId,
            ));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this badge's organization" });
        }

        // Verify the user to award the badge to is in same organization
        const targetUser = await storage.getUserById(userId);
        if (!targetUser) {
          return res.status(404).json({ message: "Target user not found" });
        }

        const targetUserHasAccess =
          targetUser.organizations &&
          targetUser.organizations.some(
            (org: any) => org.id === badge.organizationId,
          );

        if (!targetUserHasAccess) {
          return res
            .status(403)
            .json({ message: "Target user not in this badge's organization" });
        }

        const awardData = awardedBadgesInsertSchema.parse({
          badgeId,
          userId,
          awardedBy: req.session.userId,
          status: "awarded",
        });

        const newAward = await storage.awardBadge(awardData);

        return res.status(201).json(newAward);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ errors: error.errors });
        }
        console.error("Error awarding badge:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/awarded-badges`,
    isAuthenticated,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const awardedBadges = await storage.getAwardedBadges(orgId);

        return res.status(200).json(awardedBadges);
      } catch (error) {
        console.error("Error fetching awarded badges:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    `${apiPrefix}/users/:userId/awarded-badges`,
    isAuthenticated,
    async (req, res) => {
      try {
        const targetUserId = parseInt(req.params.userId);
        const requesterId = req.session.userId;

        // If the user is requesting their own data, allow it
        if (targetUserId === requesterId) {
          const awardedBadges =
            await storage.getUserAwardedBadges(targetUserId);
          return res.status(200).json(awardedBadges);
        }

        // If requesting another user's data, check permissions
        const requester = await storage.getUserById(requesterId);
        const targetUser = await storage.getUserById(targetUserId);

        if (!requester || !targetUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Admin can view any user's badges
        if (requester.role === "admin") {
          const awardedBadges =
            await storage.getUserAwardedBadges(targetUserId);
          return res.status(200).json(awardedBadges);
        }

        // Check if they share any organization (can only see each other if in same org)
        const requesterOrgIds = requester.organizations
          ? requester.organizations.map((org: any) => org.id)
          : [];
        const targetUserOrgIds = targetUser.organizations
          ? targetUser.organizations.map((org: any) => org.id)
          : [];

        // Find common organizations
        const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
          targetUserOrgIds.includes(orgId),
        );

        if (sharedOrgs.length === 0) {
          return res.status(403).json({ message: "No access to this user" });
        }

        const awardedBadges = await storage.getUserAwardedBadges(targetUserId);

        return res.status(200).json(awardedBadges);
      } catch (error) {
        console.error("Error fetching user awarded badges:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Badge Progress tracking endpoints
  app.get(
    `${apiPrefix}/badges/:badgeId/progress/:userId`,
    isAuthenticated,
    async (req, res) => {
      try {
        const badgeId = parseInt(req.params.badgeId);
        const targetUserId = parseInt(req.params.userId);
        const requesterId = req.session.userId;

        // Get the badge to check organization access
        const badge = await storage.getBadgeById(badgeId);
        if (!badge) {
          return res.status(404).json({ message: "Badge not found" });
        }

        // Verify organization access to badge
        const requester = await storage.getUserById(requesterId);

        if (!requester) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccessToBadge =
          requester.role === "admin" ||
          (requester.organizations &&
            requester.organizations.some(
              (org: any) => org.id === badge.organizationId,
            ));

        if (!hasAccessToBadge) {
          return res
            .status(403)
            .json({ message: "No access to this badge's organization" });
        }

        // If requesting another user's progress, verify they're in the same organization
        if (targetUserId !== requesterId) {
          // Admin can view any user's progress
          if (requester.role !== "admin") {
            const targetUser = await storage.getUserById(targetUserId);

            if (!targetUser) {
              return res.status(404).json({ message: "Target user not found" });
            }

            // Check if target user has access to the badge's organization
            const targetUserAccessToBadge =
              targetUser.organizations &&
              targetUser.organizations.some(
                (org: any) => org.id === badge.organizationId,
              );

            if (!targetUserAccessToBadge) {
              return res
                .status(403)
                .json({
                  message: "Target user not in this badge's organization",
                });
            }
          }
        }

        const progress = await storage.getBadgeProgress(badgeId, targetUserId);

        if (!progress) {
          return res.status(404).json({ message: "Progress not found" });
        }

        return res.status(200).json(progress);
      } catch (error) {
        console.error("Error fetching badge progress:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    `${apiPrefix}/users/:userId/progress`,
    isAuthenticated,
    async (req, res) => {
      try {
        const targetUserId = parseInt(req.params.userId);
        const requesterId = req.session.userId;

        // If the user is requesting their own data, allow it
        if (targetUserId === requesterId) {
          const progress =
            await storage.getUserProgressForAllBadges(targetUserId);
          return res.status(200).json(progress);
        }

        // If requesting another user's data, check permissions
        const requester = await storage.getUserById(requesterId);
        const targetUser = await storage.getUserById(targetUserId);

        if (!requester || !targetUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Admin can view any user's progress
        if (requester.role === "admin") {
          const progress =
            await storage.getUserProgressForAllBadges(targetUserId);
          return res.status(200).json(progress);
        }

        // Check if they share any organization (can only see each other if in same org)
        const requesterOrgIds = requester.organizations
          ? requester.organizations.map((org: any) => org.id)
          : [];
        const targetUserOrgIds = targetUser.organizations
          ? targetUser.organizations.map((org: any) => org.id)
          : [];

        // Find common organizations
        const sharedOrgs = requesterOrgIds.filter((orgId: number) =>
          targetUserOrgIds.includes(orgId),
        );

        if (sharedOrgs.length === 0) {
          return res.status(403).json({ message: "No access to this user" });
        }

        const progress =
          await storage.getUserProgressForAllBadges(targetUserId);

        return res.status(200).json(progress);
      } catch (error) {
        console.error("Error fetching user progress:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    `${apiPrefix}/organizations/:orgId/progress`,
    isAuthenticated,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const progress = await storage.getBadgeProgressForOrganization(orgId);

        return res.status(200).json(progress);
      } catch (error) {
        console.error("Error fetching organization progress:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    `${apiPrefix}/badges/:badgeId/progress/:userId`,
    isAuthenticated,
    isAdminOrManager,
    async (req, res) => {
      try {
        const badgeId = parseInt(req.params.badgeId);
        const targetUserId = parseInt(req.params.userId);

        // Get the badge to check organization access
        const badge = await storage.getBadgeById(badgeId);
        if (!badge) {
          return res.status(404).json({ message: "Badge not found" });
        }

        // Verify organization access
        const requesterId = req.session.userId;
        const requester = await storage.getUserById(requesterId);

        if (!requester) {
          return res.status(401).json({ message: "User not found" });
        }

        // Check if requester has access to the badge's organization
        const hasAccess =
          requester.role === "admin" ||
          (requester.organizations &&
            requester.organizations.some(
              (org: any) => org.id === badge.organizationId,
            ));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this badge's organization" });
        }

        // Verify the target user is in same organization as the badge
        const targetUser = await storage.getUserById(targetUserId);
        if (!targetUser) {
          return res.status(404).json({ message: "Target user not found" });
        }

        const targetUserHasAccess =
          targetUser.organizations &&
          targetUser.organizations.some(
            (org: any) => org.id === badge.organizationId,
          );

        if (!targetUserHasAccess) {
          return res
            .status(403)
            .json({ message: "Target user not in this badge's organization" });
        }

        const progressData = {
          badgeId,
          userId: targetUserId,
          updatedBy: req.session.userId,
          progress: req.body.progress,
          progressData: req.body.progressData,
          notes: req.body.notes,
          status: req.body.status || "in_progress",
        };

        const updatedProgress =
          await storage.createOrUpdateBadgeProgress(progressData);

        // Check if badge should be auto-awarded based on progress
        if (updatedProgress && Number(updatedProgress.progress) === 100) {
          await storage.autoAwardBadgeIfComplete({
            badgeId,
            userId: targetUserId,
            updatedBy: req.session.userId,
          });
        }

        return res.status(200).json(updatedProgress);
      } catch (error) {
        console.error("Error updating badge progress:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Stats endpoints
  app.get(
    `${apiPrefix}/organizations/:orgId/stats`,
    isAuthenticated,
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);

        // Verify organization access
        const userId = req.session.userId;
        const user = await storage.getUserById(userId);

        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        const hasAccess =
          user.role === "admin" ||
          (user.organizations &&
            user.organizations.some((org: any) => org.id === orgId));

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "No access to this organization" });
        }

        const stats = await storage.getOrganizationStats(orgId);

        return res.status(200).json(stats);
      } catch (error) {
        console.error("Error fetching organization stats:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  const httpServer = createServer(app);
  return httpServer;
}
