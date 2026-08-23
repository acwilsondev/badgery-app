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

  // Without an explicit handler, Node ignores SIGTERM entirely (there's no
  // init process wrapping PID 1 in the container), so k8s pod deletes /
  // rollouts / Argo CD syncs would stall for the full
  // terminationGracePeriodSeconds and then hard-kill in-flight requests.
  // Closing the server here lets in-flight requests finish first.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      log(`received ${sig}, shutting down`);
      httpServer.close(() => process.exit(0));
    });
  }
})();
