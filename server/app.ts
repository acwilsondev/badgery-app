import { config } from "./config";
import express from "express";
import "./types"; // Import session type extensions
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { registerUsersRoutes } from "./features/users/routes";
import { registerAuthRoutes } from "./features/auth/routes";
import { registerOrganizationsRoutes } from "./features/organizations/routes";
import { registerBadgesRoutes } from "./features/badges/routes";
import { registerProgressRoutes } from "./features/progress/routes";
import { errorHandler } from "./middleware/errors";
import { pool } from "@db";
import { log } from "./logger";

export async function createApp() {
  const app = express();

  // Behind the reverse proxy in production so secure cookies and client IPs work
  if (config.isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Add session middleware
  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        secure: config.isProduction,
        httpOnly: true,
        sameSite: "lax",
      },
    }),
  );

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  registerUsersRoutes(app);
  registerAuthRoutes(app);
  registerOrganizationsRoutes(app);
  registerBadgesRoutes(app);
  registerProgressRoutes(app);
  const httpServer = await registerRoutes(app);

  app.use(errorHandler);

  return { app, httpServer };
}
