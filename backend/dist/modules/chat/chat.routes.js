import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound } from '../../utils/errors.js';
import { parsePage, pageResult } from '../../utils/helpers.js';
import { OFFICE_ROLES } from '../rbac/permissions.js';
export const chatRouter = Router();
chatRouter.use(requireAuth, requireTenant, requireRole('admin', 'field_worker'), requirePermission('chat.access'));
const OFFICE_SQL = OFFICE_ROLES.map((r) => `'${r}'`).join(', ');
async function officeUserIds(client, companyId) {
    const { rows } = await client.query(`SELECT user_id FROM company_members
     WHERE company_id = $1 AND status = 'active' AND role IN (${OFFICE_SQL})
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'dispatcher' THEN 2 ELSE 3 END`, [companyId]);
    return rows.map((r) => r.user_id);
}
async function ensureWorkerOfficeThread(client, companyId, workerUserId) {
    const existing = await client.query(`SELECT t.id FROM chat_threads t
     JOIN chat_thread_participants w ON w.thread_id = t.id AND w.user_id = $2
     WHERE t.company_id = $1
       AND EXISTS (
         SELECT 1 FROM chat_thread_participants p
         JOIN company_members m ON m.user_id = p.user_id AND m.company_id = t.company_id
         WHERE p.thread_id = t.id AND m.role IN (${OFFICE_SQL})
       )
       AND NOT EXISTS (
         SELECT 1 FROM chat_thread_participants p
         JOIN company_members m ON m.user_id = p.user_id AND m.company_id = t.company_id
         WHERE p.thread_id = t.id AND m.role = 'field_worker' AND p.user_id <> $2
       )
     LIMIT 1`, [companyId, workerUserId]);
    let threadId = existing.rows[0]?.id;
    if (!threadId) {
        const created = await client.query(`INSERT INTO chat_threads (company_id) VALUES ($1) RETURNING id`, [companyId]);
        threadId = created.rows[0].id;
        await client.query(`INSERT INTO chat_thread_participants (company_id, thread_id, user_id) VALUES ($1,$2,$3)`, [companyId, threadId, workerUserId]);
    }
    const officeIds = await officeUserIds(client, companyId);
    for (const uid of officeIds) {
        if (uid === workerUserId)
            continue;
        await client.query(`INSERT INTO chat_thread_participants (company_id, thread_id, user_id) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`, [companyId, threadId, uid]);
    }
    return threadId;
}
async function ensureDirectThread(client, companyId, userA, userB) {
    if (userA === userB)
        throw notFound('User');
    const existing = await client.query(`SELECT t.id FROM chat_threads t
     WHERE t.company_id = $1
       AND EXISTS (SELECT 1 FROM chat_thread_participants p WHERE p.thread_id = t.id AND p.user_id = $2)
       AND EXISTS (SELECT 1 FROM chat_thread_participants p WHERE p.thread_id = t.id AND p.user_id = $3)
     LIMIT 1`, [companyId, userA, userB]);
    if (existing.rows[0])
        return existing.rows[0].id;
    const t = await client.query(`INSERT INTO chat_threads (company_id) VALUES ($1) RETURNING id`, [companyId]);
    await client.query(`INSERT INTO chat_thread_participants (company_id, thread_id, user_id) VALUES ($1,$2,$3), ($1,$2,$4)`, [companyId, t.rows[0].id, userA, userB]);
    return t.rows[0].id;
}
async function assertParticipant(client, threadId, userId) {
    const { rows } = await client.query(`SELECT 1 FROM chat_thread_participants WHERE thread_id = $1 AND user_id = $2`, [threadId, userId]);
    if (!rows[0])
        throw notFound('Thread');
}
chatRouter.get('/threads', tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const { rows } = await client.query(`SELECT t.id, t.created_at
     FROM chat_threads t
     JOIN chat_thread_participants p ON p.thread_id = t.id
     WHERE t.company_id = $1 AND p.user_id = $2
     ORDER BY t.created_at DESC`, [companyId, req.auth.userId]);
    const items = [];
    for (const t of rows) {
        const parts = await client.query(`SELECT p.user_id, u.name FROM chat_thread_participants p JOIN users u ON u.id = p.user_id WHERE p.thread_id = $1`, [t.id]);
        const last = await client.query(`SELECT id, sender_id, body, created_at FROM chat_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 1`, [t.id]);
        const unread = await client.query(`SELECT count(*)::int AS n FROM chat_messages m
       WHERE m.thread_id = $1 AND m.sender_id <> $2
         AND NOT EXISTS (SELECT 1 FROM chat_message_reads r WHERE r.message_id = m.id AND r.user_id = $2)`, [t.id, req.auth.userId]);
        items.push({
            id: t.id,
            participants: parts.rows.map((p) => ({ id: p.user_id, name: p.name })),
            lastMessage: last.rows[0]
                ? {
                    id: last.rows[0].id,
                    senderId: last.rows[0].sender_id,
                    message: last.rows[0].body,
                    timestamp: last.rows[0].created_at.toISOString(),
                }
                : null,
            unread: unread.rows[0].n,
        });
    }
    const { page, pageSize } = parsePage(req.query);
    res.json(pageResult(items, page, pageSize));
}));
chatRouter.post('/threads', tenantRoute(async (req, res, client) => {
    const body = z.object({
        userId: z.string().uuid().optional(),
        withAdmin: z.boolean().optional(),
    }).parse(req.body);
    const companyId = req.auth.companyId;
    if (body.withAdmin || req.auth.role === 'field_worker') {
        const id = await ensureWorkerOfficeThread(client, companyId, req.auth.userId);
        res.status(201).json({ id });
        return;
    }
    if (!body.userId)
        throw notFound('User');
    const other = await client.query(`SELECT user_id, role FROM company_members WHERE company_id = $1 AND user_id = $2 AND status = 'active'`, [companyId, body.userId]);
    if (!other.rowCount)
        throw notFound('User');
    const otherRole = other.rows[0].role;
    const id = otherRole === 'field_worker'
        ? await ensureWorkerOfficeThread(client, companyId, body.userId)
        : await ensureDirectThread(client, companyId, req.auth.userId, body.userId);
    res.status(201).json({ id });
}));
chatRouter.get('/threads/:id/messages', tenantRoute(async (req, res, client) => {
    await assertParticipant(client, req.params.id, req.auth.userId);
    const { rows } = await client.query(`SELECT m.id, m.sender_id, u.name AS sender_name, m.body, m.created_at,
            EXISTS (SELECT 1 FROM chat_message_reads r WHERE r.message_id = m.id AND r.user_id = $2) AS read_by_me
     FROM chat_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.thread_id = $1 ORDER BY m.created_at ASC`, [req.params.id, req.auth.userId]);
    res.json({
        items: rows.map((m) => ({
            id: m.id,
            senderId: m.sender_id,
            senderName: m.sender_name,
            receiverId: req.auth.userId,
            message: m.body,
            timestamp: m.created_at.toISOString(),
            read: m.read_by_me,
        })),
    });
}));
chatRouter.post('/threads/:id/messages', tenantRoute(async (req, res, client) => {
    const body = z.object({ message: z.string().min(1).max(4000) }).parse(req.body);
    await assertParticipant(client, req.params.id, req.auth.userId);
    const created = await client.query(`INSERT INTO chat_messages (company_id, thread_id, sender_id, body) VALUES ($1,$2,$3,$4) RETURNING *`, [req.auth.companyId, req.params.id, req.auth.userId, body.message.trim()]);
    await client.query(`INSERT INTO chat_message_reads (message_id, user_id) VALUES ($1,$2)`, [created.rows[0].id, req.auth.userId]);
    const payload = {
        id: created.rows[0].id,
        threadId: req.params.id,
        senderId: req.auth.userId,
        message: body.message.trim(),
        timestamp: created.rows[0].created_at.toISOString(),
    };
    const io = req.app.get('io');
    io?.to(`company:${req.auth.companyId}:thread:${req.params.id}`).emit('chat:message', payload);
    const parts = await client.query(`SELECT user_id FROM chat_thread_participants WHERE thread_id = $1 AND user_id <> $2`, [req.params.id, req.auth.userId]);
    for (const p of parts.rows) {
        io?.to(`user:${p.user_id}`).emit('chat:message', payload);
    }
    res.status(201).json({ ...payload, read: true });
}));
chatRouter.post('/threads/:id/read', tenantRoute(async (req, res, client) => {
    await assertParticipant(client, req.params.id, req.auth.userId);
    await client.query(`INSERT INTO chat_message_reads (message_id, user_id)
     SELECT m.id, $2 FROM chat_messages m
     WHERE m.thread_id = $1 AND m.sender_id <> $2
     ON CONFLICT DO NOTHING`, [req.params.id, req.auth.userId]);
    res.json({ ok: true });
}));
//# sourceMappingURL=chat.routes.js.map