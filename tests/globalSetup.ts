import pg from "pg";
import { execSync } from "node:child_process";

const TEST_DATABASE_URL = process.env.DATABASE_URL;

// Safety guard: this does a destructive DROP SCHEMA CASCADE below. Refuse to
// run against anything that doesn't look like the dedicated test database,
// so a misconfigured DATABASE_URL can never wipe dev or production data.
if (!TEST_DATABASE_URL || !TEST_DATABASE_URL.includes("badgery_test")) {
  throw new Error(
    `Refusing to run test globalSetup: DATABASE_URL does not look like a ` +
      `test database (got "${TEST_DATABASE_URL}"). Expected it to contain ` +
      `"badgery_test". Check the "test" script in package.json.`,
  );
}

export default async function setup() {
  const targetUrl = new URL(TEST_DATABASE_URL!);
  const dbName = targetUrl.pathname.slice(1);

  const maintenanceUrl = new URL(TEST_DATABASE_URL!);
  maintenanceUrl.pathname = "/postgres";

  const maintenanceClient = new pg.Client({
    connectionString: maintenanceUrl.toString(),
  });
  await maintenanceClient.connect();
  const existing = await maintenanceClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );
  if (existing.rowCount === 0) {
    await maintenanceClient.query(`CREATE DATABASE "${dbName}"`);
  }
  await maintenanceClient.end();

  const testDbClient = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await testDbClient.connect();
  await testDbClient.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await testDbClient.end();

  execSync("npm run db:push", { stdio: "inherit" });
}
