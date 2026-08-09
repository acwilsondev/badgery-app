import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, registerUserSchema } from "@shared/schema";
import { asyncHandler } from "../../middleware/asyncHandler";
import { verifyCredentials, registerUser } from "./service";
import { getUserById } from "../users/service";

export function registerAuthRoutes(app: Express) {
  const apiPrefix = "/api/v1";

  // In-memory rate limiting: per-process, resets on restart. Fine for a
  // single-instance deployment; revisit if the app ever scales out.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many login attempts, please try again later" },
  });

  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many accounts created, please try again later" },
  });

  app.post(
    `${apiPrefix}/auth/login`,
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { username, password } = loginSchema.parse(req.body);
      const user = await verifyCredentials(username, password);

      // Prevent session fixation: issue a fresh session id on login
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve())),
      );

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
    }),
  );

  app.post(
    `${apiPrefix}/auth/register`,
    registerLimiter,
    asyncHandler(async (req, res) => {
      const userData = registerUserSchema.parse(req.body);
      const newUser = await registerUser(userData);

      return res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        organizationId: newUser.organizationId || null,
      });
    }),
  );

  app.get(
    `${apiPrefix}/auth/me`,
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await getUserById(req.session.userId);
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
    }),
  );

  app.post(`${apiPrefix}/auth/logout`, (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ message: "Logged out successfully" });
    });
  });
}
