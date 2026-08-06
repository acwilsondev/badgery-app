import { config } from "./config";
import express, { type Request, Response, NextFunction } from "express";
import "./types"; // Import session type extensions
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
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

  const httpServer = await registerRoutes(app);

  // NOTE (pre-existing, not touched by Phase 2): this rethrows `err` after
  // already sending a response, which is dead code today only because every
  // route handler has its own try/catch — it only fires for errors Express
  // itself raises (e.g. malformed JSON bodies). Revisit in Phase 3; do not
  // write a test that intentionally hits this path, it can crash the process.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  return { app, httpServer };
}
