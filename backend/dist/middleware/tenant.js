import { withTenant } from '../db/pool.js';
import { forbidden } from '../utils/errors.js';
import { pool } from '../db/pool.js';
/** Hold HTTP body until the surrounding DB transaction commits (avoids follow-up 404s). */
function deferUntilCommit(res) {
    const origJson = res.json;
    const origSend = res.send;
    const origSendFile = res.sendFile;
    let flush;
    res.json = function jsonDeferred(body) {
        flush = () => origJson.call(res, body);
        return res;
    };
    res.send = function sendDeferred(body) {
        flush = () => origSend.call(res, body);
        return res;
    };
    res.sendFile = function sendFileDeferred(...args) {
        flush = () => origSendFile.apply(res, args);
        return res;
    };
    const restore = () => {
        res.json = origJson;
        res.send = origSend;
        res.sendFile = origSendFile;
    };
    return {
        restore,
        flush() {
            if (res.headersSent)
                return;
            restore();
            flush?.();
        },
    };
}
export function tenantRoute(handler) {
    return async (req, res, next) => {
        const auth = req.auth;
        try {
            if (auth.role !== 'super_admin' && auth.companyId) {
                const { rows } = await pool.query(`SELECT status, trial_ends_at FROM companies WHERE id = $1 AND deleted_at IS NULL`, [auth.companyId]);
                const company = rows[0];
                if (!company)
                    return next(forbidden('Company not found'));
                if (company.status === 'suspended')
                    return next(forbidden('Company is suspended'));
                if (company.status === 'trial' && company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
                    return next(forbidden('Trial expired'));
                }
                // past_due: allow access; UI shows a billing banner
            }
            const held = deferUntilCommit(res);
            try {
                await withTenant(auth.companyId, auth.userId, auth.role === 'super_admin', (client) => handler(req, res, client));
                held.flush();
            }
            catch (err) {
                held.restore();
                throw err;
            }
        }
        catch (err) {
            next(err);
        }
    };
}
export function platformRoute(handler) {
    return async (req, res, next) => {
        const auth = req.auth;
        try {
            const held = deferUntilCommit(res);
            try {
                await withTenant(null, auth.userId, true, (client) => handler(req, res, client));
                held.flush();
            }
            catch (err) {
                held.restore();
                throw err;
            }
        }
        catch (err) {
            next(err);
        }
    };
}
//# sourceMappingURL=tenant.js.map