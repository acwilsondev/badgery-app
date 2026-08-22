import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./db/migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // connect-pg-simple owns this table at runtime (server/app.ts,
  // createTableIfMissing: true) — it's deliberately not declared in
  // shared/schema.ts, and without this exclusion `db:push --force`
  // treats it as an orphaned table and drops it on every push.
  tablesFilter: ["!session"],
  verbose: true,
});
