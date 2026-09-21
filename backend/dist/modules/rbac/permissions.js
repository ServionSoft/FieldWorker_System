export const PERMISSIONS = [
    'customers.read',
    'customers.write',
    'jobs.read',
    'jobs.write',
    'estimates.read',
    'estimates.write',
    'invoices.read',
    'invoices.write',
    'inventory.read',
    'inventory.write',
    'workers.manage',
    'dispatch.access',
    'communications.access',
    'documents.access',
    'agreements.access',
    'templates.manage',
    'reports.view',
    'settings.company',
    'settings.users',
    'settings.smtp',
    'billing.manage',
    'chat.access',
];
export const OFFICE_ROLES = ['owner', 'admin', 'dispatcher', 'office'];
export const TENANT_ROLES = [...OFFICE_ROLES, 'field_worker'];
const ALL = [...PERMISSIONS];
const ADMIN_DEFAULT = PERMISSIONS.filter((p) => p !== 'billing.manage' && p !== 'settings.smtp');
export const ROLE_DEFAULTS = {
    owner: ALL,
    admin: ADMIN_DEFAULT,
    dispatcher: [
        'customers.read', 'customers.write',
        'jobs.read', 'jobs.write',
        'dispatch.access',
        'chat.access',
        'communications.access',
        'documents.access',
    ],
    office: [
        'customers.read', 'customers.write',
        'estimates.read', 'estimates.write',
        'invoices.read', 'invoices.write',
        'reports.view',
        'documents.access',
        'agreements.access',
    ],
    field_worker: [
        'jobs.read',
        'chat.access',
        'communications.access',
        'documents.access',
    ],
};
export function effectivePermissions(role, overrides) {
    if (role === 'super_admin')
        return ALL;
    const base = new Set(ROLE_DEFAULTS[role] ?? []);
    for (const o of overrides) {
        if (!PERMISSIONS.includes(o.permission))
            continue;
        if (o.allowed)
            base.add(o.permission);
        else
            base.delete(o.permission);
    }
    return PERMISSIONS.filter((p) => base.has(p));
}
export async function loadEffectivePermissions(client, memberId, role) {
    const { rows } = await client.query(`SELECT permission, allowed FROM company_member_permissions WHERE member_id = $1`, [memberId]);
    return effectivePermissions(role, rows);
}
export const PERMISSION_LABELS = {
    'customers.read': 'View customers',
    'customers.write': 'Edit customers',
    'jobs.read': 'View jobs',
    'jobs.write': 'Create and edit jobs',
    'estimates.read': 'View estimates',
    'estimates.write': 'Create and edit estimates',
    'invoices.read': 'View invoices',
    'invoices.write': 'Create and edit invoices',
    'inventory.read': 'View inventory',
    'inventory.write': 'Edit inventory',
    'workers.manage': 'Manage field workers',
    'dispatch.access': 'Dispatch and calendar',
    'communications.access': 'Calls and SMS',
    'documents.access': 'Documents',
    'agreements.access': 'Service agreements',
    'templates.manage': 'Email templates',
    'reports.view': 'Reports',
    'settings.company': 'Company profile',
    'settings.users': 'User management',
    'settings.smtp': 'Email / SMTP',
    'billing.manage': 'Subscription billing',
    'chat.access': 'Team chat',
};
//# sourceMappingURL=permissions.js.map