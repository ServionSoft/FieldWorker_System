import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, badRequest, unauthorized } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { signDownload, verifyDownload } from '../../utils/crypto.js';
import { parsePage, pageResult } from '../../utils/helpers.js';
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });
function authOrSigned(kind) {
    return (req, res, next) => {
        const q = req.query.token;
        if (typeof q === 'string') {
            try {
                const p = verifyDownload(q);
                if (kind === 'document' && p.documentId && p.documentId !== req.params.id) {
                    return next(notFound('Document'));
                }
                if (kind === 'file' && p.fileId && p.fileId !== req.params.id) {
                    return next(notFound('File'));
                }
                req.auth = {
                    userId: p.userId, companyId: p.companyId, role: 'field_worker', memberId: null,
                };
                return next();
            }
            catch {
                return next(unauthorized('Invalid download token'));
            }
        }
        return requireAuth(req, res, next);
    };
}
export const filesRouter = Router();
filesRouter.use((req, res, next) => {
    if (req.path.endsWith('/download') && typeof req.query.token === 'string') {
        return authOrSigned('file')(req, res, next);
    }
    return requireAuth(req, res, next);
}, requireTenant);
filesRouter.post('/', requireRole('admin', 'field_worker'), upload.single('file'), tenantRoute(async (req, res, client) => {
    if (!req.file)
        throw badRequest('file is required');
    const companyId = req.auth.companyId;
    const destDir = path.join(uploadDir, companyId);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, req.file.filename);
    fs.renameSync(req.file.path, dest);
    const storageKey = `${companyId}/${req.file.filename}`;
    const created = await client.query(`INSERT INTO files (company_id, storage_key, mime_type, size_bytes, original_name, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [companyId, storageKey, req.file.mimetype, req.file.size, req.file.originalname, req.auth.userId]);
    res.status(201).json({
        id: created.rows[0].id,
        name: created.rows[0].original_name,
        mimeType: created.rows[0].mime_type,
        size: created.rows[0].size_bytes,
    });
}));
filesRouter.get('/:id/download', tenantRoute(async (req, res, client) => {
    const { rows } = await client.query(`SELECT storage_key, original_name, mime_type FROM files WHERE company_id = $1 AND id = $2`, [req.auth.companyId, req.params.id]);
    if (!rows[0])
        throw notFound('File');
    const full = path.resolve(uploadDir, rows[0].storage_key);
    if (!full.startsWith(path.resolve(uploadDir)))
        throw notFound('File');
    res.setHeader('Content-Type', rows[0].mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].original_name}"`);
    res.sendFile(full);
}));
filesRouter.post('/:id/signed-url', requireRole('admin', 'field_worker'), tenantRoute(async (req, res, client) => {
    const file = await client.query(`SELECT id FROM files WHERE company_id = $1 AND id = $2`, [req.auth.companyId, req.params.id]);
    if (!file.rowCount)
        throw notFound('File');
    const token = signDownload({ companyId: req.auth.companyId, userId: req.auth.userId, fileId: req.params.id });
    res.json({ url: `/api/files/${req.params.id}/download?token=${token}`, token });
}));
export const documentsRouter = Router();
documentsRouter.use((req, res, next) => {
    if (String(req.path).includes('/download') && typeof req.query.token === 'string') {
        return authOrSigned('document')(req, res, next);
    }
    return requireAuth(req, res, next);
}, requireTenant, requireRole('admin', 'field_worker'));
documentsRouter.get('/', tenantRoute(async (req, res, client) => {
    const jobIdRaw = typeof req.query.jobId === 'string' ? req.query.jobId : '';
    const jobId = /^[0-9a-f-]{36}$/i.test(jobIdRaw) ? jobIdRaw : null;
    const { rows } = await client.query(`SELECT d.id, d.job_id, d.created_at, f.original_name, f.mime_type, f.size_bytes, u.name AS uploaded_by
     FROM documents d
     JOIN files f ON f.id = d.file_id
     JOIN users u ON u.id = d.uploaded_by
     WHERE d.company_id = $1
       AND ($2::uuid IS NULL OR d.job_id = $2)
     ORDER BY d.created_at DESC`, [req.auth.companyId, jobId]);
    const mapped = rows.map((r) => ({
        id: r.id,
        name: r.original_name,
        type: r.mime_type?.includes('pdf') ? 'PDF' : (r.mime_type ?? 'FILE'),
        size: `${(Number(r.size_bytes) / (1024 * 1024)).toFixed(1)} MB`,
        jobId: r.job_id,
        companyId: req.auth.companyId,
        uploadedAt: r.created_at.toISOString().slice(0, 10),
        uploadedBy: r.uploaded_by,
    }));
    const { page, pageSize } = parsePage(req.query);
    res.json(pageResult(mapped, page, pageSize));
}));
documentsRouter.post('/', tenantRoute(async (req, res, client) => {
    const fileId = req.body.fileId;
    const jobId = req.body.jobId || null;
    if (!fileId)
        throw badRequest('fileId is required');
    const file = await client.query(`SELECT id FROM files WHERE company_id = $1 AND id = $2`, [req.auth.companyId, fileId]);
    if (!file.rowCount)
        throw notFound('File');
    const created = await client.query(`INSERT INTO documents (company_id, file_id, job_id, uploaded_by) VALUES ($1,$2,$3,$4) RETURNING id`, [req.auth.companyId, fileId, jobId, req.auth.userId]);
    res.status(201).json({ id: created.rows[0].id });
}));
documentsRouter.post('/:id/signed-url', tenantRoute(async (req, res) => {
    const token = signDownload({
        companyId: req.auth.companyId, userId: req.auth.userId, documentId: req.params.id,
    });
    res.json({ url: `/api/documents/${req.params.id}/download?token=${token}`, token });
}));
documentsRouter.get('/:id/download', tenantRoute(async (req, res, client) => {
    const { rows } = await client.query(`SELECT f.storage_key, f.original_name, f.mime_type
     FROM documents d JOIN files f ON f.id = d.file_id
     WHERE d.company_id = $1 AND d.id = $2`, [req.auth.companyId, req.params.id]);
    if (!rows[0])
        throw notFound('Document');
    const full = path.resolve(uploadDir, rows[0].storage_key);
    if (!full.startsWith(path.resolve(uploadDir)))
        throw notFound('Document');
    res.setHeader('Content-Type', rows[0].mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${rows[0].original_name}"`);
    res.sendFile(full);
}));
documentsRouter.delete('/:id', requireRole('admin'), tenantRoute(async (req, res, client) => {
    const r = await client.query(`DELETE FROM documents WHERE company_id = $1 AND id = $2 RETURNING id`, [req.auth.companyId, req.params.id]);
    if (!r.rowCount)
        throw notFound('Document');
    await audit(client, {
        actorUserId: req.auth.userId, companyId: req.auth.companyId, action: 'document.delete',
        entityType: 'document', entityId: req.params.id,
    });
    res.json({ ok: true });
}));
export const jobImagesRouter = Router({ mergeParams: true });
jobImagesRouter.use(requireAuth, requireTenant, requireRole('admin', 'field_worker'));
jobImagesRouter.post('/', tenantRoute(async (req, res, client) => {
    const fileId = req.body.fileId;
    if (!fileId)
        throw badRequest('fileId is required');
    if (req.auth.role === 'field_worker') {
        const ok = await client.query(`SELECT 1 FROM job_assignees WHERE job_id = $1 AND member_id = $2`, [req.params.id, req.auth.memberId]);
        if (!ok.rowCount)
            throw notFound('Job');
    }
    const job = await client.query(`SELECT id FROM jobs WHERE company_id = $1 AND id = $2`, [req.auth.companyId, req.params.id]);
    if (!job.rowCount)
        throw notFound('Job');
    await client.query(`INSERT INTO job_images (company_id, job_id, file_id) VALUES ($1,$2,$3)`, [req.auth.companyId, req.params.id, fileId]);
    res.status(201).json({ ok: true });
}));
//# sourceMappingURL=files.routes.js.map