import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';
export function errorHandler(err, _req, res, _next) {
    if (err instanceof AppError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: { code: 'VALIDATION', message: err.issues.map((i) => i.message).join('; ') },
        });
    }
    const anyErr = err;
    if (anyErr?.name === 'MulterError' && anyErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds 25 MB limit' } });
    }
    if (anyErr?.code === '23505' || anyErr?.code === '23503') {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Already exists or is still referenced' } });
    }
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
//# sourceMappingURL=error.js.map