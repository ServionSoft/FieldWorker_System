import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';
import { pgClientConfig } from './pool.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dir, 'migrations');

function quoteIdent(name: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid database name: ${name}`);
  }
  return `"${name}"`;
}

async function main() {
  const url = new URL(env.DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '').split('?')[0];
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';

  // CREATE DATABASE is only available / meaningful on self-hosted local Postgres.
  if (isLocal) {
    const adminUrl = new URL(env.DATABASE_URL);
    adminUrl.pathname = '/postgres';
    const admin = new pg.Client(pgClientConfig(adminUrl.toString()));
    await admin.connect();
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
      console.log(`Created database ${dbName}`);
    }
    await admin.end();
  }

  const client = new pg.Client(pgClientConfig(env.DATABASE_URL));
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const id = file;
    const exists = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
    if (exists.rowCount) {
      console.log(`skip ${id}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`apply ${id}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
  await client.end();
  console.log('Migrations complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
