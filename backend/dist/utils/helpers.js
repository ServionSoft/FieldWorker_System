import { emitToUser } from '../realtime/bus.js';
import { loadEffectivePermissions } from '../modules/rbac/permissions.js';
import { sendPlatformEmail } from '../services/email.js';
export function parsePage(query) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    return { page, pageSize, offset: (page - 1) * pageSize };
}
export function pageResult(all, page, pageSize) {
    return {
        items: all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
        page,
        pageSize,
        total: all.length,
    };
}
export async function nextNumber(client, companyId, kind) {
    const year = new Date().getFullYear();
    const prefix = kind === 'invoice' ? 'INV' : 'EST';
    const table = kind === 'invoice' ? 'invoices' : 'estimates';
    const col = kind === 'invoice' ? 'invoice_number' : 'estimate_number';
    for (;;) {
        const { rows } = await client.query(`INSERT INTO document_counters (company_id, kind, year, last_value)
       VALUES ($1,$2,$3,1)
       ON CONFLICT (company_id, kind, year)
       DO UPDATE SET last_value = document_counters.last_value + 1
       RETURNING last_value`, [companyId, kind, year]);
        const number = `${prefix}-${year}-${String(rows[0].last_value).padStart(4, '0')}`;
        const taken = await client.query(`SELECT 1 FROM ${table} WHERE company_id = $1 AND ${col} = $2`, [companyId, number]);
        if (!taken.rowCount)
            return number;
    }
}
export async function notify(client, opts) {
    const { rows } = await client.query(`INSERT INTO notifications (company_id, user_id, title, message, type, entity_type, entity_id, event_key, link_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, created_at`, [
        opts.companyId,
        opts.userId,
        opts.title,
        opts.message,
        opts.type ?? 'info',
        opts.entityType ?? null,
        opts.entityId ?? null,
        opts.eventKey ?? null,
        opts.linkPath ?? null,
    ]);
    const row = rows[0];
    const payload = {
        id: row.id,
        userId: opts.userId,
        title: opts.title,
        message: opts.message,
        type: opts.type ?? 'info',
        read: false,
        timestamp: row.created_at.toISOString(),
        eventKey: opts.eventKey ?? null,
        linkPath: opts.linkPath ?? null,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
    };
    emitToUser(opts.userId, 'notification:new', payload);
    if (opts.email) {
        const user = await client.query(`SELECT email FROM users WHERE id = $1`, [opts.userId]);
        if (user.rows[0]?.email) {
            let companyName = '';
            if (opts.companyId) {
                const c = await client.query(`SELECT name FROM companies WHERE id = $1`, [opts.companyId]);
                companyName = c.rows[0]?.name || '';
            }
            const templateType = opts.eventKey === 'billing.payment_failed' ? 'payment_failed'
                : opts.eventKey === 'billing.started' ? 'subscription_started'
                    : 'system_notification';
            await sendPlatformEmail({
                to: user.rows[0].email,
                templateType,
                vars: { title: opts.title, message: opts.message, companyName },
                subject: opts.title,
                text: opts.message,
            });
        }
    }
}
export async function notifyByPermission(client, companyId, permission, opts) {
    const { rows } = await client.query(`SELECT id, user_id, role, notify_email_assignments, notify_email_invoices, notify_email_billing
     FROM company_members
     WHERE company_id = $1 AND status = 'active'`, [companyId]);
    for (const m of rows) {
        const perms = await loadEffectivePermissions(client, m.id, m.role);
        if (!perms.includes(permission))
            continue;
        if (opts.excludeRoles?.includes(m.role))
            continue;
        const email = opts.emailAlways
            || (opts.emailPref === 'assignments' ? !!m.notify_email_assignments
                : opts.emailPref === 'invoices' ? !!m.notify_email_invoices
                    : opts.emailPref === 'billing' ? !!m.notify_email_billing
                        : false);
        await notify(client, {
            companyId,
            userId: m.user_id,
            title: opts.title,
            message: opts.message,
            type: opts.type,
            entityType: opts.entityType,
            entityId: opts.entityId,
            eventKey: opts.eventKey,
            linkPath: opts.linkPath,
            email,
        });
    }
}
export async function notifyCompanyAdmins(client, companyId, title, message, type = 'info', extra) {
    await notifyByPermission(client, companyId, 'jobs.read', {
        title, message, type, excludeRoles: ['field_worker'], ...extra,
    });
}
export async function notifyPlatformAdmins(client, title, message, extra) {
    const { rows } = await client.query(`SELECT id FROM users WHERE is_platform_admin = true`);
    await client.query(`SELECT set_config('app.is_super_admin', 'true', true)`);
    try {
        for (const u of rows) {
            await notify(client, {
                companyId: null,
                userId: u.id,
                title,
                message,
                type: 'info',
                eventKey: extra?.eventKey,
                linkPath: extra?.linkPath,
                email: true,
            });
        }
    }
    finally {
        await client.query(`SELECT set_config('app.is_super_admin', 'false', true)`);
    }
}
export function formatAddress(a) {
    if (!a)
        return '';
    const line1 = [a.street, a.unit].filter(Boolean).join(' ');
    const line2 = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [line1, line2].filter(Boolean).join(', ');
}
export async function assertPlanLimits(client, companyId, kind, opts) {
    const { rows } = await client.query(`SELECT p.max_workers, p.max_jobs
     FROM companies c JOIN subscription_plans p ON p.id = c.plan_id
     WHERE c.id = $1`, [companyId]);
    const plan = rows[0];
    if (!plan)
        return;
    if (kind === 'workers' && plan.max_workers >= 0) {
        const count = await client.query(`SELECT count(*)::int AS n FROM company_members WHERE company_id = $1 AND role = 'field_worker' AND status = 'active'`, [companyId]);
        let n = count.rows[0].n;
        if (opts?.includePendingInvites) {
            const pending = await client.query(`SELECT count(*)::int AS n FROM invitations
         WHERE company_id = $1 AND role = 'field_worker' AND accepted_at IS NULL AND expires_at > now()`, [companyId]);
            n += pending.rows[0].n;
        }
        if (n >= plan.max_workers) {
            const { badRequest } = await import('./errors.js');
            throw badRequest('Worker limit reached for this plan');
        }
    }
    if (kind === 'jobs' && plan.max_jobs >= 0) {
        const count = await client.query(`SELECT count(*)::int AS n FROM jobs
       WHERE company_id = $1 AND created_at >= date_trunc('month', now())`, [companyId]);
        if (count.rows[0].n >= plan.max_jobs) {
            const { badRequest } = await import('./errors.js');
            throw badRequest('Monthly job limit reached for this plan');
        }
    }
}
//# sourceMappingURL=helpers.js.map