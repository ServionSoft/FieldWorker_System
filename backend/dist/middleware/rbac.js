import { forbidden } from '../utils/errors.js';
import { OFFICE_ROLES } from '../modules/rbac/permissions.js';
export function requireRole(...roles) {
    return (req, _res, next) => {
        const auth = req.auth;
        if (!auth)
            return next(forbidden());
        const allowed = new Set();
        for (const r of roles) {
            if (r === 'admin')
                OFFICE_ROLES.forEach((x) => allowed.add(x));
            else
                allowed.add(r);
        }
        if (!allowed.has(auth.role))
            return next(forbidden());
        next();
    };
}
export function requireTenant(req, _res, next) {
    const auth = req.auth;
    if (!auth?.companyId || auth.role === 'super_admin') {
        return next(forbidden('Tenant context required'));
    }
    next();
}
export function requirePermission(...perms) {
    return (req, _res, next) => {
        const auth = req.auth;
        if (!auth)
            return next(forbidden());
        if (auth.role === 'super_admin')
            return next();
        const have = new Set(auth.permissions ?? []);
        if (perms.some((p) => have.has(p)))
            return next();
        return next(forbidden('Missing permission'));
    };
}
export function requireFeature(...features) {
    return (req, _res, next) => {
        const auth = req.auth;
        if (!auth)
            return next(forbidden());
        const have = new Set(auth.planFeatures ?? []);
        if (features.some((f) => have.has(f)))
            return next();
        return next(forbidden('Upgrade required for this feature'));
    };
}
//# sourceMappingURL=rbac.js.map