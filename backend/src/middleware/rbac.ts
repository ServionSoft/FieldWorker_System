import type { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/errors.js';
import type { AppRole, AuthedRequest } from '../types.js';
import { OFFICE_ROLES, type Permission } from '../modules/rbac/permissions.js';
import type { PlanFeatureKey } from '../modules/billing/plan-features.js';

export function requireRole(...roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) return next(forbidden());
    const allowed = new Set<AppRole>();
    for (const r of roles) {
      if (r === 'admin') OFFICE_ROLES.forEach((x) => allowed.add(x));
      else allowed.add(r);
    }
    if (!allowed.has(auth.role)) return next(forbidden());
    next();
  };
}

export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  const auth = (req as AuthedRequest).auth;
  if (!auth?.companyId || auth.role === 'super_admin') {
    return next(forbidden('Tenant context required'));
  }
  next();
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) return next(forbidden());
    if (auth.role === 'super_admin') return next();
    const have = new Set(auth.permissions ?? []);
    if (perms.some((p) => have.has(p))) return next();
    return next(forbidden('Missing permission'));
  };
}

export function requireFeature(...features: PlanFeatureKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) return next(forbidden());
    const have = new Set(auth.planFeatures ?? []);
    if (features.some((f) => have.has(f))) return next();
    return next(forbidden('Upgrade required for this feature'));
  };
}
