import { pool } from './index';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('Starting schema alignment migration...');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Read and execute the SQL file
    const sqlPath = path.join(__dirname, 'align-schema-with-doc.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing migration SQL...');
    await client.query(sql);
    
    await client.query('COMMIT');
    console.log('Schema alignment migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during schema alignment migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration process finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });