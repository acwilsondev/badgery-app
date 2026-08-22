import { createApp } from "./app";
import { config } from "./config";
import { serveStatic } from "./static";
import { log } from "./logger";

(async () => {
  const { app, httpServer } = await createApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }

  // Serves both the API and the client on one port. Defaults to 5000
  // (config.port) — override with PORT if you need a different one.
  const port = config.port;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
