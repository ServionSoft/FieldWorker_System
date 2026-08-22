import pg from 'pg';
import { env } from '../config/env.js';

function appConnectionString() {
  if (env.APP_DATABASE_URL) return env.APP_DATABASE_URL;
  return env.DATABASE_URL;
}

/** SSL for managed Postgres (Aiven, Render, Neon, …); off for local. */
export function pgSsl(connectionString: string): undefined | { rejectUnauthorized: boolean } {
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    host = '';
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const wantsSsl =
    /sslmode=(require|verify-ca|verify-full|prefer)/i.test(connectionString) ||
    (!isLocal && Boolean(host));

  if (!wantsSsl) return undefined;
  // Managed providers often use a chain Node does not trust by default in dev.
  return { rejectUnauthorized: false };
}

/**
 * Build pg config. When we set `ssl` explicitly, strip sslmode from the URL so
 * pg-connection-string does not force verify-full and override rejectUnauthorized.
 */
export function normalizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    return url.toString();
  } catch {
    return connectionString.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
  }
}

export function pgPoolConfig(connectionString: string, extra: pg.PoolConfig = {}): pg.PoolConfig {
  const ssl = pgSsl(connectionString);
  return {
    ...extra,
    connectionString: ssl ? normalizeConnectionString(connectionString) : connectionString,
    ssl,
  };
}

export function pgClientConfig(connectionString: string): pg.ClientConfig {
  const ssl = pgSsl(connectionString);
  return {
    connectionString: ssl ? normalizeConnectionString(connectionString) : connectionString,
    ssl,
  };
}

export const pool = new pg.Pool(pgPoolConfig(appConnectionString(), { max: 20 }));

export type DbClient = pg.PoolClient | pg.Pool;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function withTenant<T>(
  companyId: string | null,
  userId: string | null,
  isSuperAdmin: boolean,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    if (isSuperAdmin) {
      await client.query(`SELECT set_config('app.is_super_admin', 'true', true)`);
    } else if (companyId) {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId]);
    }
    if (userId) {
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    }
    return fn(client);
  });
}
