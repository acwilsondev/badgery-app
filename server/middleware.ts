import { Request, Response, NextFunction } from "express";
import * as storage from "./storage";

/**
 * Middleware to check if a user is authenticated
 */
export async function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

/**
 * Middleware to check if a user has access to an organization
 * This will check if the user is a member of the requested organization
 */
export async function hasOrganizationAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // First ensure user is authenticated
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Get the requested organizationId from the request (route params, query, or body)
  const organizationId =
    parseInt(req.params.organizationId) ||
    parseInt(req.query.organizationId as string) ||
    (req.body && req.body.organizationId
      ? parseInt(req.body.organizationId)
      : null);

  // If no organization specified, continue (other middleware can handle this)
  if (!organizationId) {
    return next();
  }

  try {
    // Get the user with their organization relationships
    const user = await storage.getUserById(req.session.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if the user has access to the organization
    // This works because getUserById returns organizations array
    const hasAccess =
      user.organizations &&
      user.organizations.some((org: any) => org.id === organizationId);

    // Admin users can access any organization
    if (user.role === "admin" || hasAccess) {
      next();
    } else {
      return res
        .status(403)
        .json({ message: "No access to this organization" });
    }
  } catch (error) {
    console.error("Error checking organization access:", error);
    return res
      .status(500)
      .json({ message: "Error checking organization access" });
  }
}

/**
 * Middleware to check if a user has admin or manager role
 */
export async function isAdminOrManager(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const user = await storage.getUserById(req.session.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.role === "admin" || user.role === "manager") {
      next();
    } else {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
  } catch (error) {
    console.error("Error checking user role:", error);
    return res.status(500).json({ message: "Error checking user role" });
  }
}

/**
 * Narrow req.session.userId to number. Only call in handlers behind
 * isAuthenticated, which guarantees the session has a userId.
 */
export function requireSessionUserId(req: Request): number {
  const userId = req.session.userId;
  if (userId === undefined) {
    throw new Error("Session userId missing — route must be behind isAuthenticated");
  }
  return userId;
}
