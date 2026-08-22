import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { withTenant } from '../db/pool.js';
import { forbidden } from '../utils/errors.js';
import { pool } from '../db/pool.js';
import type { AuthedRequest } from '../types.js';

export type TenantHandler = (req: AuthedRequest, res: Response, client: PoolClient) => Promise<void>;

/** Hold HTTP body until the surrounding DB transaction commits (avoids follow-up 404s). */
function deferUntilCommit(res: Response) {
  const origJson = res.json;
  const origSend = res.send;
  const origSendFile = res.sendFile;
  let flush: (() => unknown) | undefined;
  res.json = function jsonDeferred(body?: unknown) {
    flush = () => origJson.call(res, body);
    return res;
  } as Response['json'];
  res.send = function sendDeferred(body?: unknown) {
    flush = () => origSend.call(res, body);
    return res;
  } as Response['send'];
  res.sendFile = function sendFileDeferred(...args: Parameters<Response['sendFile']>) {
    flush = () => origSendFile.apply(res, args);
    return res;
  } as Response['sendFile'];
  const restore = () => {
    res.json = origJson;
    res.send = origSend;
    res.sendFile = origSendFile;
  };
  return {
    restore,
    flush() {
      if (res.headersSent) return;
      restore();
      flush?.();
    },
  };
}

export function tenantRoute(handler: TenantHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthedRequest).auth;
    try {
      if (auth.role !== 'super_admin' && auth.companyId) {
        const { rows } = await pool.query(
          `SELECT status, trial_ends_at FROM companies WHERE id = $1 AND deleted_at IS NULL`,
          [auth.companyId],
        );
        const company = rows[0];
        if (!company) return next(forbidden('Company not found'));
        if (company.status === 'suspended') return next(forbidden('Company is suspended'));
        if (company.status === 'trial' && company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
          return next(forbidden('Trial expired'));
        }
        // past_due: allow access; UI shows a billing banner
      }
      const held = deferUntilCommit(res);
      try {
        await withTenant(auth.companyId, auth.userId, auth.role === 'super_admin', (client) =>
          handler(req as AuthedRequest, res, client),
        );
        held.flush();
      } catch (err) {
        held.restore();
        throw err;
      }
    } catch (err) {
      next(err);
    }
  };
}

export function platformRoute(handler: TenantHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthedRequest).auth;
    try {
      const held = deferUntilCommit(res);
      try {
        await withTenant(null, auth.userId, true, (client) =>
          handler(req as AuthedRequest, res, client),
        );
        held.flush();
      } catch (err) {
        held.restore();
        throw err;
      }
    } catch (err) {
      next(err);
    }
  };
}
