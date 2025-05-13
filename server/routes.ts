import type { Express } from "express";
import { createServer, type Server } from "http";
import * as storage from "./storage";
import * as z from "zod";
import { eq } from "drizzle-orm";
import { db } from "@db";
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
  const apiPrefix = '/api/v1';
  
  // Authentication endpoints
  app.post(`${apiPrefix}/auth/login`, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // In a real-world application, you would use a proper authentication system with hashed passwords
      req.session.userId = user.id;
      req.session.organizationId = user.organizationId;
      
      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      });
    } catch (error) {
      console.error('Error during login:', error);
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
        organizationId: newUser.organizationId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error('Error during registration:', error);
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
        organizationId: user.organizationId,
      });
    } catch (error) {
      console.error('Error fetching current user:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(`${apiPrefix}/auth/logout`, (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ message: "Logged out successfully" });
    });
  });

  // Organization endpoints
  app.get(`${apiPrefix}/organizations`, async (req, res) => {
    try {
      const organizations = await storage.getOrganizations();
      return res.status(200).json(organizations);
    } catch (error) {
      console.error('Error fetching organizations:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/organizations/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const organization = await storage.getOrganizationById(id);
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      return res.status(200).json(organization);
    } catch (error) {
      console.error('Error fetching organization:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/organizations', async (req, res) => {
    try {
      const organizationData = organizationsInsertSchema.parse(req.body);
      const newOrganization = await storage.createOrganization(organizationData);
      
      return res.status(201).json(newOrganization);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error('Error creating organization:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put('/api/organizations/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = req.body;
      
      const updatedOrganization = await storage.updateOrganization(id, updateData);
      
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      return res.status(200).json(updatedOrganization);
    } catch (error) {
      console.error('Error updating organization:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Badge Category endpoints
  app.get('/api/organizations/:orgId/categories', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const categories = await storage.getBadgeCategories(orgId);
      
      return res.status(200).json(categories);
    } catch (error) {
      console.error('Error fetching badge categories:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/organizations/:orgId/categories', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const categoryData = badgeCategoriesInsertSchema.parse(req.body);
      
      const newCategory = await storage.createBadgeCategory({
        ...categoryData,
        organizationId: orgId,
      });
      
      return res.status(201).json(newCategory);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error('Error creating badge category:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Badge endpoints
  app.get('/api/organizations/:orgId/badges', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
      
      const badges = await storage.getBadges(orgId, categoryId);
      
      return res.status(200).json(badges);
    } catch (error) {
      console.error('Error fetching badges:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/badges/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const badge = await storage.getBadgeById(id);
      
      if (!badge) {
        return res.status(404).json({ message: "Badge not found" });
      }
      
      return res.status(200).json(badge);
    } catch (error) {
      console.error('Error fetching badge:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/organizations/:orgId/badges', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const badgeData = badgesInsertSchema.parse(req.body);
      
      const newBadge = await storage.createBadge({
        ...badgeData,
        organizationId: orgId,
      });
      
      return res.status(201).json(newBadge);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error('Error creating badge:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put('/api/badges/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = req.body;
      
      const updatedBadge = await storage.updateBadge(id, updateData);
      
      if (!updatedBadge) {
        return res.status(404).json({ message: "Badge not found" });
      }
      
      return res.status(200).json(updatedBadge);
    } catch (error) {
      console.error('Error updating badge:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete('/api/badges/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteBadge(id);
      
      return res.status(200).json({ message: "Badge deleted successfully" });
    } catch (error) {
      console.error('Error deleting badge:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // User endpoints
  app.get('/api/organizations/:orgId/users', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const users = await storage.getUsersByOrganization(orgId);
      
      return res.status(200).json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/users/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUserById(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Badge Awarding endpoints
  app.post('/api/badges/:badgeId/award', async (req, res) => {
    try {
      const badgeId = parseInt(req.params.badgeId);
      const { userId } = req.body;
      
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const awardData = awardedBadgesInsertSchema.parse({
        badgeId,
        userId,
        awardedBy: req.session.userId,
      });
      
      const newAward = await storage.awardBadge(awardData);
      
      return res.status(201).json(newAward);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error('Error awarding badge:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/organizations/:orgId/awarded-badges', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const awardedBadges = await storage.getAwardedBadges(orgId);
      
      return res.status(200).json(awardedBadges);
    } catch (error) {
      console.error('Error fetching awarded badges:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/users/:userId/awarded-badges', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const awardedBadges = await storage.getUserAwardedBadges(userId);
      
      return res.status(200).json(awardedBadges);
    } catch (error) {
      console.error('Error fetching user awarded badges:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Badge Progress tracking endpoints
  app.get('/api/badges/:badgeId/progress/:userId', async (req, res) => {
    try {
      const badgeId = parseInt(req.params.badgeId);
      const userId = parseInt(req.params.userId);
      
      const progress = await storage.getBadgeProgress(badgeId, userId);
      
      if (!progress) {
        return res.status(404).json({ message: "Progress not found" });
      }
      
      return res.status(200).json(progress);
    } catch (error) {
      console.error('Error fetching badge progress:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/users/:userId/progress', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const progress = await storage.getUserProgressForAllBadges(userId);
      
      return res.status(200).json(progress);
    } catch (error) {
      console.error('Error fetching user progress:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/organizations/:orgId/progress', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const progress = await storage.getBadgeProgressForOrganization(orgId);
      
      return res.status(200).json(progress);
    } catch (error) {
      console.error('Error fetching organization progress:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/badges/:badgeId/progress/:userId', async (req, res) => {
    try {
      const badgeId = parseInt(req.params.badgeId);
      const userId = parseInt(req.params.userId);
      
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Only admins or managers can update progress
      const currentUser = await storage.getUserById(req.session.userId);
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
        return res.status(403).json({ message: "Unauthorized to update progress" });
      }
      
      const progressData = {
        badgeId,
        userId,
        updatedBy: req.session.userId,
        progress: req.body.progress,
        progressData: req.body.progressData,
        notes: req.body.notes,
        status: req.body.status || 'in_progress',
      };
      
      const updatedProgress = await storage.createOrUpdateBadgeProgress(progressData);
      
      // Check if badge should be auto-awarded based on progress
      if (Number(updatedProgress.progress) === 100) {
        await storage.autoAwardBadgeIfComplete(updatedProgress);
      }
      
      return res.status(200).json(updatedProgress);
    } catch (error) {
      console.error('Error updating badge progress:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Stats endpoints
  app.get('/api/organizations/:orgId/stats', async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const stats = await storage.getOrganizationStats(orgId);
      
      return res.status(200).json(stats);
    } catch (error) {
      console.error('Error fetching organization stats:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
