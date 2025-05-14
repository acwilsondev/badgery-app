import { pool } from "./index";
import fs from "fs";
import path from "path";

async function runMigration(fileName: string) {
  console.log(`Running migration: ${fileName}`);

  try {
    const filePath = path.join(__dirname, "migrations", fileName);
    const sql = fs.readFileSync(filePath, "utf8");

    await pool.query("BEGIN");
    await pool.query(sql);
    await pool.query("COMMIT");

    console.log(`Migration ${fileName} completed successfully`);
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(`Migration ${fileName} failed:`, error);
    throw error;
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.error("Usage: npm run db:migrate <filename.sql>");
    process.exit(1);
  }

  const fileName = process.argv[2];

  try {
    await runMigration(fileName);
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
