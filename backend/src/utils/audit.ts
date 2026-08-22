import type { PoolClient } from 'pg';

export async function audit(
  client: PoolClient,
  opts: {
    actorUserId?: string | null;
    companyId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string | null;
    metadata?: unknown;
    ip?: string | null;
  },
) {
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, company_id, action, entity_type, entity_id, metadata, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      opts.actorUserId ?? null,
      opts.companyId ?? null,
      opts.action,
      opts.entityType ?? null,
      opts.entityId ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      opts.ip ?? null,
    ],
  );
}
