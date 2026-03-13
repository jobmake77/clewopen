import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'clewopen',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Migration tracking table
const createMigrationsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
};

// Get executed migrations
const getExecutedMigrations = async () => {
  const result = await pool.query('SELECT name FROM migrations ORDER BY id');
  return result.rows.map(row => row.name);
};

// Mark migration as executed
const markMigrationExecuted = async (name) => {
  await pool.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
};

// Get all migration files
const getMigrationFiles = () => {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  return files;
};

// Execute migration
const executeMigration = async (filename) => {
  const filePath = path.join(__dirname, '../migrations', filename);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`Executing migration: ${filename}`);

  try {
    await pool.query(sql);
    await markMigrationExecuted(filename);
    console.log(`✓ Migration ${filename} executed successfully`);
  } catch (error) {
    console.error(`✗ Migration ${filename} failed:`, error.message);
    throw error;
  }
};

// Run migrations
const runMigrations = async () => {
  try {
    console.log('Starting database migrations...\n');

    // Create migrations tracking table
    await createMigrationsTable();

    // Get executed and pending migrations
    const executedMigrations = await getExecutedMigrations();
    const allMigrations = getMigrationFiles();
    const pendingMigrations = allMigrations.filter(
      file => !executedMigrations.includes(file)
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);

    // Execute pending migrations
    for (const migration of pendingMigrations) {
      await executeMigration(migration);
    }

    console.log('\n✓ All migrations completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Reset database (drop all tables)
const resetDatabase = async () => {
  try {
    console.log('Resetting database...\n');

    const dropTablesQuery = `
      DROP TABLE IF EXISTS resource_visits CASCADE;
      DROP TABLE IF EXISTS trial_session_messages CASCADE;
      DROP TABLE IF EXISTS trial_sessions CASCADE;
      DROP TABLE IF EXISTS agent_trials CASCADE;
      DROP TABLE IF EXISTS llm_configs CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS custom_orders CASCADE;
      DROP TABLE IF EXISTS downloads CASCADE;
      DROP TABLE IF EXISTS reviews CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS mcps CASCADE;
      DROP TABLE IF EXISTS skills CASCADE;
      DROP TABLE IF EXISTS agents CASCADE;
      DROP TABLE IF EXISTS categories CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS migrations CASCADE;
    `;

    await pool.query(dropTablesQuery);
    console.log('✓ Database reset successfully!');
  } catch (error) {
    console.error('✗ Database reset failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// CLI
const command = process.argv[2];

if (command === 'migrate') {
  runMigrations();
} else if (command === 'reset') {
  resetDatabase();
} else {
  console.log('Usage:');
  console.log('  node migrate.js migrate  - Run pending migrations');
  console.log('  node migrate.js reset    - Reset database (drop all tables)');
  process.exit(1);
}
