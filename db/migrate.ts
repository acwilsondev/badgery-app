import { pool } from "./index";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ES modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log("Starting schema migration...");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Read and execute the SQL file
    const sqlPath = path.join(
      __dirname,
      "migrations/0000_gigantic_natasha_romanoff.sql",
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log("Executing migration SQL...");
    await client.query(sql);

    await client.query("COMMIT");
    console.log("Schema migration completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error during schema migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log("Migration process finished.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
