import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requireFeature, requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, conflict } from '../../utils/errors.js';
import { notifyCompanyAdmins, parsePage, pageResult } from '../../utils/helpers.js';
export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('inventory.read'), requireFeature('inventory'));
function mapItem(r) {
    return {
        id: r.id,
        name: r.name,
        sku: r.sku,
        category: r.category,
        quantity: r.quantity,
        minStock: r.min_stock,
        unitPrice: Number(r.unit_price),
        companyId: r.company_id,
    };
}
inventoryRouter.get('/', tenantRoute(async (req, res, client) => {
    const { rows } = await client.query(`SELECT * FROM inventory_items WHERE company_id = $1 ORDER BY name`, [req.auth.companyId]);
    const { page, pageSize } = parsePage(req.query);
    res.json(pageResult(rows.map(mapItem), page, pageSize));
}));
inventoryRouter.post('/', tenantRoute(async (req, res, client) => {
    const body = z.object({
        name: z.string().min(1),
        sku: z.string().min(1),
        category: z.string().optional().default(''),
        quantity: z.number().int().optional().default(0),
        minStock: z.number().int().optional().default(0),
        unitPrice: z.number().optional().default(0),
    }).parse(req.body);
    const companyId = req.auth.companyId;
    try {
        const created = await client.query(`INSERT INTO inventory_items (company_id, name, sku, category, quantity, min_stock, unit_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [companyId, body.name, body.sku, body.category, body.quantity, body.minStock, body.unitPrice]);
        if (body.quantity) {
            await client.query(`INSERT INTO inventory_movements (company_id, item_id, type, quantity_delta, created_by)
         VALUES ($1,$2,'receive',$3,$4)`, [companyId, created.rows[0].id, body.quantity, req.auth.userId]);
        }
        res.status(201).json(mapItem(created.rows[0]));
    }
    catch (err) {
        if (typeof err === 'object' && err && 'code' in err && err.code === '23505') {
            throw conflict('SKU already exists for this company');
        }
        throw err;
    }
}));
inventoryRouter.patch('/:id', tenantRoute(async (req, res, client) => {
    const body = z.object({
        name: z.string().optional(),
        sku: z.string().optional(),
        category: z.string().optional(),
        quantity: z.number().int().optional(),
        minStock: z.number().int().optional(),
        unitPrice: z.number().optional(),
    }).parse(req.body);
    const companyId = req.auth.companyId;
    const existing = await client.query(`SELECT * FROM inventory_items WHERE company_id = $1 AND id = $2`, [companyId, req.params.id]);
    if (!existing.rowCount)
        throw notFound('Item');
    const prev = existing.rows[0];
    const updated = await client.query(`UPDATE inventory_items SET
       name = coalesce($3, name), sku = coalesce($4, sku), category = coalesce($5, category),
       quantity = coalesce($6, quantity), min_stock = coalesce($7, min_stock), unit_price = coalesce($8, unit_price)
     WHERE company_id = $1 AND id = $2 RETURNING *`, [companyId, req.params.id, body.name ?? null, body.sku ?? null, body.category ?? null, body.quantity ?? null, body.minStock ?? null, body.unitPrice ?? null]);
    if (body.quantity !== undefined && body.quantity !== prev.quantity) {
        await client.query(`INSERT INTO inventory_movements (company_id, item_id, type, quantity_delta, created_by)
       VALUES ($1,$2,'adjust',$3,$4)`, [companyId, req.params.id, body.quantity - prev.quantity, req.auth.userId]);
    }
    const item = updated.rows[0];
    if (item.quantity < item.min_stock) {
        await notifyCompanyAdmins(client, companyId, 'Low Stock Alert', `${item.name} is below minimum stock level (${item.quantity}/${item.min_stock})`, 'warning', { eventKey: 'inventory.low_stock', entityType: 'inventory', entityId: req.params.id, linkPath: '/admin/inventory' });
    }
    res.json(mapItem(item));
}));
inventoryRouter.delete('/:id', tenantRoute(async (req, res, client) => {
    await client.query(`DELETE FROM inventory_movements WHERE company_id = $1 AND item_id = $2`, [req.auth.companyId, req.params.id]);
    const r = await client.query(`DELETE FROM inventory_items WHERE company_id = $1 AND id = $2 RETURNING id`, [req.auth.companyId, req.params.id]);
    if (!r.rowCount)
        throw notFound('Item');
    res.json({ ok: true });
}));
//# sourceMappingURL=inventory.routes.js.map