/**
 * Inventory Access Middleware
 * RBAC protection for inventory/product modifications
 */

import pool from '../database/db.js';

/**
 * Require write access to inventory (products)
 * Only empresa_admin and global_admin can modify inventory
 * Employees can only READ and decrement stock via sales
 */
export async function requireInventoryWrite(req, res, next) {
    try {
        // Get fresh role from database (not from JWT)
        const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
        const user = rows[0];

        if (!user) {
            return res.status(403).json({ error: 'Usuario no encontrado' });
        }

        if (user.role !== 'empresa_admin' && user.role !== 'global_admin') {
            return res.status(403).json({
                error: 'Acceso denegado. Solo administradores pueden modificar el inventario.',
                code: 'INVENTORY_WRITE_DENIED'
            });
        }

        next();
    } catch (error) {
        console.error('requireInventoryWrite error:', error);
        return res.status(500).json({ error: 'Error al verificar permisos de inventario' });
    }
}

/**
 * Allow stock decrement only (for sales process)
 * This is the only way employees can affect inventory
 */
export function allowStockDecrement(req, res, next) {
    // This middleware is used in sales routes
    // It allows the sale to proceed and decrement stock
    // without giving full inventory write access
    next();
}

export default { requireInventoryWrite, allowStockDecrement };
