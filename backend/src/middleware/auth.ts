import type { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../utils/crypto.js';
import { unauthorized } from '../utils/errors.js';
import type { AuthedRequest } from '../types.js';
import { pool } from '../db/pool.js';
import { loadEffectivePermissions, PERMISSIONS } from '../modules/rbac/permissions.js';
import { loadPlanFeatures } from '../modules/billing/plan-features.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const auth = verifyAccess(token);
    auth.permissions = [];
    auth.planFeatures = [];
    if (auth.role === 'super_admin') {
      auth.permissions = [...PERMISSIONS];
    }
    if (auth.memberId || auth.companyId) {
      const client = await pool.connect();
      try {
        if (auth.role !== 'super_admin' && auth.memberId) {
          auth.permissions = await loadEffectivePermissions(client, auth.memberId, auth.role);
        }
        if (auth.companyId) {
          auth.planFeatures = await loadPlanFeatures(client, auth.companyId);
        }
      } finally {
        client.release();
      }
    }
    (req as AuthedRequest).auth = auth;
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}
