import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId, requireEmpresaAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and active empresa
router.use(authenticateToken);
router.use(validateEmpresaActive);

// Get sales for current user (filtered by empresa_id)
router.get('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [sales] = await pool.query(`
            SELECT s.id, s.user_id, s.total, s.payment_method, s.created_at
            FROM sales s
            WHERE s.empresa_id = ? AND s.user_id = ?
            ORDER BY s.created_at DESC
            LIMIT 50
        `, [empresaId, req.user.id]);

        res.json(sales);
    } catch (error) {
        console.error('Get sales error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get sales goals (MUST be before /:id to avoid conflict)
router.get('/goals', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Helper to get current date in Mexico City
        const getMexicoCityDateInfo = () => {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('es-MX', {
                timeZone: 'America/Mexico_City',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false
            });

            const parts = formatter.formatToParts(now);
            const getPart = (type) => parts.find(p => p.type === type)?.value;

            return {
                year: parseInt(getPart('year')),
                month: parseInt(getPart('month')) - 1, // 0-indexed
                day: parseInt(getPart('day')),
                hour: parseInt(getPart('hour'))
            };
        };

        const mxDate = getMexicoCityDateInfo();

        // Calculate Week Start (Last Monday)
        const weekStart = new Date(mxDate.year, mxDate.month, mxDate.day);
        const day = weekStart.getDay(); // 0 (Sun) to 6 (Sat)
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
        weekStart.setHours(0, 0, 0, 0);

        // Calculate Month Start (1st of current month)
        const monthStart = new Date(mxDate.year, mxDate.month, 1);
        monthStart.setHours(0, 0, 0, 0);

        const weekStartStr = weekStart.getFullYear() + '-' + String(weekStart.getMonth() + 1).padStart(2, '0') + '-' + String(weekStart.getDate()).padStart(2, '0');
        const monthStartStr = monthStart.getFullYear() + '-' + String(monthStart.getMonth() + 1).padStart(2, '0') + '-' + String(monthStart.getDate()).padStart(2, '0');

        // 1 & 2. Run all 4 queries in parallel (goals settings + actual sales)
        const [
            [weeklySettings],
            [monthlySettings],
            [weeklySalesResult],
            [monthlySalesResult]
        ] = await Promise.all([
            pool.query(
                "SELECT setting_value FROM business_settings WHERE empresa_id = ? AND setting_key = 'weekly_sales_goal'",
                [empresaId]
            ),
            pool.query(
                "SELECT setting_value FROM business_settings WHERE empresa_id = ? AND setting_key = 'monthly_sales_goal'",
                [empresaId]
            ),
            pool.query(`
                SELECT COALESCE(SUM(total), 0) as total FROM sales 
                WHERE empresa_id = ? AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) >= ?
            `, [empresaId, weekStartStr]),
            pool.query(`
                SELECT COALESCE(SUM(total), 0) as total FROM sales 
                WHERE empresa_id = ? AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) >= ?
            `, [empresaId, monthStartStr])
        ]);

        const weeklyTarget = weeklySettings[0]?.setting_value ? parseFloat(weeklySettings[0].setting_value) : 0;
        const monthlyTarget = monthlySettings[0]?.setting_value ? parseFloat(monthlySettings[0].setting_value) : 0;

        // 3. Return combined data
        res.json({
            weekly: {
                type: 'weekly',
                target: weeklyTarget,
                current: weeklySalesResult[0]?.total || 0,
                period_start: weekStartStr
            },
            monthly: {
                type: 'monthly',
                target: monthlyTarget,
                current: monthlySalesResult[0]?.total || 0,
                period_start: monthStartStr
            }
        });
    } catch (error) {
        console.error('Get goals error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get sales statistics (COLLECTIVE for empresa_id) - MUST be before /:id
router.get('/statistics', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Use the same timezone helper as /goals for consistency
        const getMexicoCityDateInfo = () => {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('es-MX', {
                timeZone: 'America/Mexico_City',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false
            });

            const parts = formatter.formatToParts(now);
            const getPart = (type) => parts.find(p => p.type === type)?.value;

            return {
                year: parseInt(getPart('year')),
                month: parseInt(getPart('month')) - 1, // 0-indexed
                day: parseInt(getPart('day')),
                hour: parseInt(getPart('hour'))
            };
        };

        const mxDate = getMexicoCityDateInfo();

        // Today's date string
        const todayStr = `${mxDate.year}-${String(mxDate.month + 1).padStart(2, '0')}-${String(mxDate.day).padStart(2, '0')}`;

        // Calculate Week Start (MONDAY)
        const weekStart = new Date(mxDate.year, mxDate.month, mxDate.day);
        const dayOfWeek = weekStart.getDay();
        const daysFromMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        weekStart.setDate(weekStart.getDate() + daysFromMonday);
        weekStart.setHours(0, 0, 0, 0);
        const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

        // Calculate Previous Week Start
        const prevWeekStart = new Date(weekStart);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekStartStr = `${prevWeekStart.getFullYear()}-${String(prevWeekStart.getMonth() + 1).padStart(2, '0')}-${String(prevWeekStart.getDate()).padStart(2, '0')}`;

        // Calculate Month Start
        const monthStart = new Date(mxDate.year, mxDate.month, 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthStartStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`;

        // UNIFIED LOGIC: Use DATE_SUB for -6 hours offset (Mexico City timezone)
        // Run all 6 queries in parallel for maximum performance
        const [
            [todaySalesResult],
            [weekSalesResult],
            [prevWeekSalesResult],
            [monthSalesResult],
            [paymentBreakdown],
            [supplierDebtResult]
        ] = await Promise.all([
            pool.query(`
                SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
                FROM sales 
                WHERE empresa_id = ? AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) = ?
            `, [empresaId, todayStr]),
            pool.query(`
                SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
                FROM sales 
                WHERE empresa_id = ? AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) >= ?
            `, [empresaId, weekStartStr]),
            pool.query(`
                SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
                FROM sales 
                WHERE empresa_id = ? 
                  AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) >= ?
                  AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) < ?
            `, [empresaId, prevWeekStartStr, weekStartStr]),
            pool.query(`
                SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
                FROM sales 
                WHERE empresa_id = ? AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) >= ?
            `, [empresaId, monthStartStr]),
            pool.query(`
                SELECT payment_method, COALESCE(SUM(total), 0) as total, COUNT(*) as count
                FROM sales 
                WHERE empresa_id = ? AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) >= ?
                GROUP BY payment_method
            `, [empresaId, monthStartStr]),
            pool.query(`
                SELECT COALESCE(SUM(si.quantity * si.supplier_price_at_sale), 0) as totalDebt
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                WHERE s.empresa_id = ? AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) = ?
            `, [empresaId, todayStr])
        ]);

        res.json({
            today: todaySalesResult[0] || { total: 0, count: 0 },
            week: weekSalesResult[0] || { total: 0, count: 0 },
            previousWeek: prevWeekSalesResult[0] || { total: 0, count: 0 },
            month: monthSalesResult[0] || { total: 0, count: 0 },
            paymentBreakdown: paymentBreakdown || [],
            totalSupplierDebt: supplierDebtResult[0]?.totalDebt || 0
        });
    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get single sale details
router.get('/:id', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [saleRows] = await pool.query(`
            SELECT s.*, u.username as cashier
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ? AND s.empresa_id = ?
        `, [id, empresaId]);

        if (saleRows.length === 0) {
            return res.status(404).json({ error: 'Venta no encontrada' });
        }

        const sale = saleRows[0];

        const [items] = await pool.query(`
            SELECT si.quantity, si.price, p.name, p.sbin_code
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = ?
        `, [id]);

        res.json({
            ...sale,
            items
        });
    } catch (error) {
        console.error('Get sale details error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create sale
router.post('/', async (req, res) => {
    try {
        const { items, payment_method, discount, surcharge } = req.body;
        const userId = req.user.id;
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // STRICT CASH SESSION CHECK
        const [openSessions] = await pool.query(`
            SELECT id FROM cash_sessions
            WHERE empresa_id = ? AND user_id = ? AND status = 'open'
            LIMIT 1
        `, [empresaId, userId]);

        if (openSessions.length === 0) {
            return res.status(403).json({
                error: 'No tienes una caja abierta. Debes abrir caja antes de realizar ventas.',
                code: 'NO_CASH_SESSION',
                requiresCashSession: true
            });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Se requieren items para la venta' });
        }

        if (!['cash', 'card'].includes(payment_method)) {
            return res.status(400).json({ error: 'Método de pago inválido' });
        }

        // Verify all products belong to user's empresa — single query for all items
        const productIds = items.map(i => i.product_id);
        const placeholders = productIds.map(() => '?').join(',');
        const [productRows] = await pool.query(
            `SELECT id, supplier_price FROM products WHERE empresa_id = ? AND id IN (${placeholders})`,
            [empresaId, ...productIds]
        );

        if (productRows.length !== items.length) {
            const foundIds = new Set(productRows.map(p => p.id));
            const missingId = productIds.find(id => !foundIds.has(id));
            return res.status(400).json({ error: `Producto ${missingId} no encontrado` });
        }

        // Build a map for quick supplier_price lookup
        const productMap = new Map(productRows.map(p => [p.id, p]));

        // Calculate subtotal from items
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Get discount and surcharge (default to 0 if not provided)
        const discountAmount = parseFloat(discount) || 0;
        const surchargeAmount = parseFloat(surcharge) || 0;

        // Validate discount doesn't exceed subtotal
        if (discountAmount > subtotal) {
            return res.status(400).json({ error: 'El descuento no puede ser mayor al subtotal' });
        }

        // Validate amounts are non-negative
        if (discountAmount < 0 || surchargeAmount < 0) {
            return res.status(400).json({ error: 'Descuento y aumento deben ser valores positivos' });
        }

        // Calculate final total: subtotal - discount + surcharge
        const total = subtotal - discountAmount + surchargeAmount;

        const cashSessionId = openSessions[0].id;

        // Create sale with discount and surcharge
        const [saleResult] = await pool.query(
            'INSERT INTO sales (empresa_id, user_id, subtotal, discount, surcharge, total, payment_method, cash_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [empresaId, userId, subtotal, discountAmount, surchargeAmount, total, payment_method, cashSessionId]
        );

        // Batch insert all sale_items in a single query
        const saleItemValues = items.map(item => {
            const supplierPrice = productMap.get(item.product_id)?.supplier_price || null;
            return [saleResult.insertId, item.product_id, item.quantity, item.price, supplierPrice];
        });
        await pool.query(
            'INSERT INTO sale_items (sale_id, product_id, quantity, price, supplier_price_at_sale) VALUES ?',
            [saleItemValues]
        );

        // Batch update stock using CASE WHEN for all products at once
        const stockCases = items.map(() => 'WHEN id = ? THEN stock - ?').join(' ');
        const stockValues = items.flatMap(item => [item.product_id, item.quantity]);
        await pool.query(
            `UPDATE products SET stock = (CASE ${stockCases} ELSE stock END) WHERE id IN (${placeholders}) AND empresa_id = ?`,
            [...stockValues, ...productIds, empresaId]
        );

        res.json({
            message: 'Venta registrada correctamente',
            id: saleResult.insertId,
            subtotal: subtotal,
            discount: discountAmount,
            surcharge: surchargeAmount,
            total: total
        });
    } catch (error) {
        console.error('Create sale error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Set/update sales goals
router.put('/goals', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { weekly_target, monthly_target } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Helper to upsert setting
        const upsertSetting = async (key, value) => {
            const [existing] = await pool.query(
                "SELECT id FROM business_settings WHERE empresa_id = ? AND setting_key = ?",
                [empresaId, key]
            );

            if (existing.length > 0) {
                await pool.query(
                    "UPDATE business_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [String(value), existing[0].id]
                );
            } else {
                await pool.query(
                    "INSERT INTO business_settings (empresa_id, setting_key, setting_value) VALUES (?, ?, ?)",
                    [empresaId, key, String(value)]
                );
            }
        };

        if (weekly_target !== undefined) await upsertSetting('weekly_sales_goal', weekly_target);
        if (monthly_target !== undefined) await upsertSetting('monthly_sales_goal', monthly_target);

        res.json({ message: 'Metas actualizadas correctamente (Configuración Global)' });
    } catch (error) {
        console.error('Update goals error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get user stats for empresa admin (individual user dashboard)
router.get('/user-stats/:userId', requireEmpresaAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { userId } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Verify user belongs to same empresa
        const [userRows] = await pool.query(
            'SELECT id FROM users WHERE id = ? AND empresa_id = ?',
            [userId, empresaId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const today = new Date();
        const todayStart = today.toISOString().split('T')[0];

        // Total sales
        const [totalStats] = await pool.query(`
            SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as totalTransactions
            FROM sales WHERE empresa_id = ? AND user_id = ?
        `, [empresaId, userId]);

        // Today's sales
        const [todayStats] = await pool.query(`
            SELECT COALESCE(SUM(total), 0) as todaySales
            FROM sales WHERE empresa_id = ? AND user_id = ? AND DATE(created_at) = DATE(?)
        `, [empresaId, userId, todayStart]);

        // Average ticket
        const avgTicket = totalStats[0].totalTransactions > 0
            ? totalStats[0].totalSales / totalStats[0].totalTransactions
            : 0;

        res.json({
            totalSales: totalStats[0]?.totalSales || 0,
            totalTransactions: totalStats[0]?.totalTransactions || 0,
            todaySales: todayStats[0]?.todaySales || 0,
            averageTicket: avgTicket
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get all empresa sales (for empresa_admin only)
router.get('/empresa', requireEmpresaAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [sales] = await pool.query(`
            SELECT s.id, s.user_id, u.username, s.total, s.payment_method, s.created_at
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.empresa_id = ?
            ORDER BY s.created_at DESC
            LIMIT 100
        `, [empresaId]);

        res.json(sales);
    } catch (error) {
        console.error('Get empresa sales error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get empresa statistics (for empresa_admin only)
router.get('/empresa/statistics', requireEmpresaAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const today = new Date();
        const todayStart = today.toISOString().split('T')[0];

        // Today's sales
        const [todaySales] = await pool.query(`
            SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales WHERE empresa_id = ? AND DATE(created_at) = DATE(?)
        `, [empresaId, todayStart]);

        // This week's sales
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const [weekSales] = await pool.query(`
            SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales WHERE empresa_id = ? AND created_at >= ?
        `, [empresaId, weekStart.toISOString()]);

        // This month's sales
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const [monthSales] = await pool.query(`
            SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales WHERE empresa_id = ? AND created_at >= ?
        `, [empresaId, monthStart.toISOString()]);

        // Sales by user
        const [salesByUser] = await pool.query(`
            SELECT u.username, COALESCE(SUM(s.total), 0) as total, COUNT(*) as count
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.empresa_id = ? AND s.created_at >= ?
            GROUP BY s.user_id
        `, [empresaId, monthStart.toISOString()]);

        res.json({
            today: todaySales[0] || { total: 0, count: 0 },
            week: weekSales[0] || { total: 0, count: 0 },
            month: monthSales[0] || { total: 0, count: 0 },
            byUser: salesByUser || []
        });
    } catch (error) {
        console.error('Get empresa statistics error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
