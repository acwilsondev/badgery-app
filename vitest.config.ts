import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@db": path.resolve(import.meta.dirname, "db"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/globalSetup.ts"],
    // All test files share one Postgres instance and unique-per-test
    // fixture data (not per-file isolation) — run files one at a time to
    // avoid connection-pool pressure and keep failures easy to read.
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 20000,
  },
});
