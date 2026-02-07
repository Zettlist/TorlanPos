import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and manager role
router.use(authenticateToken);
router.use(validateEmpresaActive);

// Middleware to check for manager/admin role
const requireManager = (req, res, next) => {
    if (req.user.role !== 'empresa_admin' && req.user.role !== 'global_admin') {
        return res.status(403).json({ error: 'Acceso denegado. Solo gerentes pueden ver reportes.' });
    }
    next();
};

router.use(requireManager);

/**
 * GET /api/reports/daily
 * Get daily sales aggregations
 */
router.get('/daily', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { startDate, endDate, month } = req.query;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Determine date range
        let dateFilter = '';
        let params = [empresaId];

        if (month) {
            // Format: YYYY-MM
            const [year, monthNum] = month.split('-');
            const startOfMonth = `${year}-${monthNum.padStart(2, '0')}-01`;
            const endOfMonth = new Date(year, parseInt(monthNum), 0).getDate();
            const endOfMonthStr = `${year}-${monthNum.padStart(2, '0')}-${endOfMonth}`;
            dateFilter = 'AND DATE(CONVERT_TZ(s.created_at, "+00:00", "-06:00")) >= ? AND DATE(CONVERT_TZ(s.created_at, "+00:00", "-06:00")) <= ?';
            params.push(startOfMonth, endOfMonthStr);
        } else if (startDate && endDate) {
            dateFilter = 'AND DATE(CONVERT_TZ(s.created_at, "+00:00", "-06:00")) >= ? AND DATE(CONVERT_TZ(s.created_at, "+00:00", "-06:00")) <= ?';
            params.push(startDate, endDate);
        } else {
            // Default to current month
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const startOfMonth = `${year}-${month}-01`;
            dateFilter = 'AND DATE(CONVERT_TZ(s.created_at, "+00:00", "-06:00")) >= ?';
            params.push(startOfMonth);
        }

        const [dailyData] = await pool.query(`
            SELECT 
                DATE_FORMAT(DATE_SUB(s.created_at, INTERVAL 6 HOUR), '%Y-%m-%d') as date,
                COALESCE(SUM(s.total), 0) as totalSales,
                COUNT(s.id) as transactionCount,
                COALESCE(AVG(s.total), 0) as averageTicket,
                COUNT(DISTINCT s.cash_session_id) as cashSessionsCount
            FROM sales s
            WHERE s.empresa_id = ? ${dateFilter.replace(/CONVERT_TZ\(s.created_at, "\+00:00", "-06:00"\)/g, 'DATE_SUB(s.created_at, INTERVAL 6 HOUR)')}
            GROUP BY DATE_FORMAT(DATE_SUB(s.created_at, INTERVAL 6 HOUR), '%Y-%m-%d')
            ORDER BY date DESC
        `, params);

        res.json({ data: dailyData });
    } catch (error) {
        console.error('Get daily reports error:', error);
        res.status(500).json({ error: 'Error al obtener reportes diarios' });
    }
});

/**
 * GET /api/reports/monthly
 * Get monthly sales aggregations
 */
router.get('/monthly', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { year } = req.query;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Default to current year
        const targetYear = year || new Date().getFullYear();

        const [monthlyData] = await pool.query(`
            SELECT 
                DATE_FORMAT(CONVERT_TZ(s.created_at, '+00:00', '-06:00'), '%Y-%m') as month,
                COALESCE(SUM(s.total), 0) as totalSales,
                COUNT(s.id) as transactionCount
            FROM sales s
            WHERE s.empresa_id = ? 
              AND YEAR(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) = ?
            GROUP BY DATE_FORMAT(CONVERT_TZ(s.created_at, '+00:00', '-06:00'), '%Y-%m')
            ORDER BY month DESC
        `, [empresaId, String(targetYear)]);

        // Get goal (once, not per month)
        const [goalRows] = await pool.query(`
            SELECT setting_value FROM business_settings
            WHERE empresa_id = ? AND setting_key = 'monthly_sales_goal'
        `, [empresaId]);

        const goal = goalRows[0] ? parseFloat(goalRows[0].setting_value) : 0;

        // Enrich data with goal information
        const enrichedData = monthlyData.map(row => {
            const goalPercentage = goal > 0 ? (row.totalSales / goal) * 100 : 0;

            return {
                ...row,
                goal,
                goalPercentage,
                goalAchieved: goalPercentage >= 100
            };
        });

        res.json({ data: enrichedData });
    } catch (error) {
        console.error('Get monthly reports error:', error);
        res.status(500).json({ error: 'Error al obtener reportes mensuales' });
    }
});

/**
 * GET /api/reports/detailed-daily/:date
 * Get detailed report for a specific day (YYYY-MM-DD)
 */
router.get('/detailed-daily/:date', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { date } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // 1. Metrics
        const [metricsRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(s.total), 0) as totalSales,
                COUNT(s.id) as transactionCount,
                COALESCE(AVG(s.total), 0) as averageTicket
            FROM sales s
            WHERE s.empresa_id = ? AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) = ?
        `, [empresaId, date]);

        const metrics = metricsRows[0];

        // Calculate profit/loss
        const [profitRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(si.quantity * si.price), 0) as revenue,
                COALESCE(SUM(si.quantity * p.cost_price), 0) as cost
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) = ?
        `, [empresaId, date]);

        const profitData = profitRows[0];
        const profit = profitData.revenue - profitData.cost;
        const profitMargin = profitData.revenue > 0 ? (profit / profitData.revenue) * 100 : 0;

        metrics.totalCost = profitData.cost;
        metrics.profit = profit;
        metrics.profitMargin = profitMargin;

        // 1.1 Supplier Debt for this specific day
        const [supplierDebtRows] = await pool.query(`
            SELECT COALESCE(SUM(si.quantity * si.supplier_price_at_sale), 0) as totalDebt
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE s.empresa_id = ? AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) = ?
        `, [empresaId, date]);
        metrics.totalSupplierDebt = supplierDebtRows[0]?.totalDebt || 0;

        //  2. Team Performance
        const [teamPerformance] = await pool.query(`
            SELECT 
                u.id as userId,
                u.username,
                COUNT(s.id) as salesCount,
                COALESCE(SUM(s.total), 0) as salesTotal
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.empresa_id = ? AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) = ?
            GROUP BY u.id, u.username
            ORDER BY salesTotal DESC
        `, [empresaId, date]);

        // 3. Cash Sessions
        const [cashSessions] = await pool.query(`
            SELECT 
                cs.id,
                u.username,
                cs.opened_at,
                cs.closed_at,
                cs.opening_amount,
                cs.expected_amount,
                cs.declared_amount,
                cs.difference,
                cs.auto_closed,
                cs.status
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.empresa_id = ? 
              AND DATE(DATE_SUB(cs.opened_at, INTERVAL 6 HOUR)) = ?
            ORDER BY cs.opened_at ASC
        `, [empresaId, date]);

        // 4. Top Products
        const [topProducts] = await pool.query(`
            SELECT 
                p.id as productId,
                p.name as productName,
                SUM(si.quantity) as quantitySold,
                SUM(si.quantity * si.price) as revenue
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) = ?
            GROUP BY p.id, p.name
            ORDER BY quantitySold DESC
            LIMIT 10
        `, [empresaId, date]);

        // 5. Stock Alerts (products that went to 0)
        const [stockAlerts] = await pool.query(`
            SELECT DISTINCT
                p.id as productId,
                p.name as productName,
                p.stock as currentStock,
                MAX(s.created_at) as lastSoldAt
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? 
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) = ?
              AND p.stock = 0
            GROUP BY p.id, p.name, p.stock
        `, [empresaId, date]);

        // 6. Payment Breakdown
        const [paymentBreakdown] = await pool.query(`
            SELECT 
                payment_method,
                COALESCE(SUM(total), 0) as total
            FROM sales
            WHERE empresa_id = ? AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) = ?
            GROUP BY payment_method
        `, [empresaId, date]);

        const payments = {
            cash: paymentBreakdown.find(p => p.payment_method === 'cash')?.total || 0,
            card: paymentBreakdown.find(p => p.payment_method === 'card')?.total || 0
        };

        res.json({
            date,
            metrics,
            teamPerformance,
            cashSessions,
            topProducts,
            stockAlerts,
            paymentBreakdown: payments
        });
    } catch (error) {
        console.error('Get detailed daily report error:', error);
        res.status(500).json({ error: 'Error al obtener reporte detallado' });
    }
});

/**
 * GET /api/reports/detailed-weekly/:weekStart
 * Get detailed report for a specific week (YYYY-MM-DD of Monday)
 */
router.get('/detailed-weekly/:weekStart', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { weekStart } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Calculate week boundaries (Monday to Sunday)
        const start = new Date(weekStart + 'T00:00:00');
        const end = new Date(start);
        end.setDate(end.getDate() + 6); // Sunday

        const startDate = weekStart;
        const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

        // 1. Metrics
        const [metricsRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(s.total), 0) as totalSales,
                COUNT(s.id) as transactionCount,
                COALESCE(AVG(s.total), 0) as averageTicket
            FROM sales s
            WHERE s.empresa_id = ? 
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) <= ?
        `, [empresaId, startDate, endDate]);

        const metrics = metricsRows[0];

        const [profitRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(si.quantity * si.price), 0) as revenue,
                COALESCE(SUM(si.quantity * p.cost_price), 0) as cost
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? 
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) <= ?
        `, [empresaId, startDate, endDate]);

        const profitData = profitRows[0];
        const profit = profitData.revenue - profitData.cost;
        const profitMargin = profitData.revenue > 0 ? (profit / profitData.revenue) * 100 : 0;

        metrics.totalCost = profitData.cost;
        metrics.profit = profit;
        metrics.profitMargin = profitMargin;

        // 1.1 Supplier Debt for this specific week
        const [supplierDebtRows] = await pool.query(`
            SELECT COALESCE(SUM(si.quantity * si.supplier_price_at_sale), 0) as totalDebt
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE s.empresa_id = ? 
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) <= ?
        `, [empresaId, startDate, endDate]);
        metrics.totalSupplierDebt = supplierDebtRows[0]?.totalDebt || 0;

        //  2. Team Performance
        const [teamPerformance] = await pool.query(`
            SELECT 
                u.id as userId,
                u.username,
                COUNT(s.id) as salesCount,
                COALESCE(SUM(s.total), 0) as salesTotal
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.empresa_id = ? 
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) <= ?
            GROUP BY u.id, u.username
            ORDER BY salesTotal DESC
        `, [empresaId, startDate, endDate]);

        // 3. Cash Sessions
        const [cashSessions] = await pool.query(`
            SELECT 
                cs.id,
                u.username,
                cs.opened_at,
                cs.closed_at,
                cs.opening_amount,
                cs.expected_amount,
                cs.declared_amount,
                cs.difference,
                cs.auto_closed,
                cs.status
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.empresa_id = ? 
              AND DATE(DATE_SUB(cs.opened_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(cs.opened_at, INTERVAL 6 HOUR)) <= ?
            ORDER BY cs.opened_at ASC
        `, [empresaId, startDate, endDate]);

        // 4. Top Products
        const [topProducts] = await pool.query(`
            SELECT 
                p.id as productId,
                p.name as productName,
                SUM(si.quantity) as quantitySold,
                SUM(si.quantity * si.price) as revenue
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? 
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) <= ?
            GROUP BY p.id, p.name
            ORDER BY quantitySold DESC
            LIMIT 10
        `, [empresaId, startDate, endDate]);

        // 5. Stock Alerts
        const [stockAlerts] = await pool.query(`
            SELECT DISTINCT
                p.id as productId,
                p.name as productName,
                p.stock as currentStock,
                MAX(s.created_at) as lastSoldAt
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? 
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(s.created_at, INTERVAL 6 HOUR)) <= ?
              AND p.stock = 0
            GROUP BY p.id, p.name, p.stock
        `, [empresaId, startDate, endDate]);

        // 6. Payment Breakdown
        const [paymentBreakdown] = await pool.query(`
            SELECT 
                payment_method,
                COALESCE(SUM(total), 0) as total
            FROM sales
            WHERE empresa_id = ? 
              AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) >= ?
              AND DATE(DATE_SUB(created_at, INTERVAL 6 HOUR)) <= ?
            GROUP BY payment_method
        `, [empresaId, startDate, endDate]);

        const payments = {
            cash: paymentBreakdown.find(p => p.payment_method === 'cash')?.total || 0,
            card: paymentBreakdown.find(p => p.payment_method === 'card')?.total || 0
        };

        res.json({
            weekStart,
            weekEnd: endDate,
            metrics,
            teamPerformance,
            cashSessions,
            topProducts,
            stockAlerts,
            paymentBreakdown: payments
        });
    } catch (error) {
        console.error('Get detailed weekly report error:', error);
        res.status(500).json({ error: 'Error al obtener reporte semanal detallado' });
    }
});

/**
 * GET /api/reports/detailed-monthly/:month
 * Get detailed report for a specific month (YYYY-MM)
 */
router.get('/detailed-monthly/:month', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { month } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Calculate month boundaries
        const [year, monthNum] = month.split('-');
        const startDate = `${year}-${monthNum.padStart(2, '0')}-01`;
        const endDay = new Date(year, parseInt(monthNum), 0).getDate();
        const endDate = `${year}-${monthNum.padStart(2, '0')}-${endDay}`;

        // Use similar queries as daily but with date range
        const [metricsRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(s.total), 0) as totalSales,
                COUNT(s.id) as transactionCount,
                COALESCE(AVG(s.total), 0) as averageTicket
            FROM sales s
            WHERE s.empresa_id = ? 
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) <= ?
        `, [empresaId, startDate, endDate]);

        const metrics = metricsRows[0];

        const [profitRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(si.quantity * si.price), 0) as revenue,
                COALESCE(SUM(si.quantity * p.cost_price), 0) as cost
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? 
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) <= ?
        `, [empresaId, startDate, endDate]);

        const profitData = profitRows[0];
        const profit = profitData.revenue - profitData.cost;
        const profitMargin = profitData.revenue > 0 ? (profit / profitData.revenue) * 100 : 0;

        metrics.totalCost = profitData.cost;
        metrics.profit = profit;
        metrics.profitMargin = profitMargin;

        // 1.1 Supplier Debt for this specific month
        const [supplierDebtRows] = await pool.query(`
            SELECT COALESCE(SUM(si.quantity * si.supplier_price_at_sale), 0) as totalDebt
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE s.empresa_id = ? 
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) <= ?
        `, [empresaId, startDate, endDate]);
        metrics.totalSupplierDebt = supplierDebtRows[0]?.totalDebt || 0;

        const [teamPerformance] = await pool.query(`
            SELECT 
                u.id as userId,
                u.username,
                COUNT(s.id) as salesCount,
                COALESCE(SUM(s.total), 0) as salesTotal
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.empresa_id = ? 
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) <= ?
            GROUP BY u.id, u.username
            ORDER BY salesTotal DESC
        `, [empresaId, startDate, endDate]);

        const [cashSessions] = await pool.query(`
            SELECT 
                cs.id,
                u.username,
                cs.opened_at,
                cs.closed_at,
                cs.opening_amount,
                cs.expected_amount,
                cs.declared_amount,
                cs.difference,
                cs.auto_closed,
                cs.status
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.empresa_id = ? 
              AND DATE(CONVERT_TZ(cs.opened_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(cs.opened_at, '+00:00', '-06:00')) <= ?
            ORDER BY cs.opened_at ASC
        `, [empresaId, startDate, endDate]);

        const [topProducts] = await pool.query(`
            SELECT 
                p.id as productId,
                p.name as productName,
                SUM(si.quantity) as quantitySold,
                SUM(si.quantity * si.price) as revenue
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? 
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) <= ?
            GROUP BY p.id, p.name
            ORDER BY quantitySold DESC
            LIMIT 10
        `, [empresaId, startDate, endDate]);

        const [stockAlerts] = await pool.query(`
            SELECT DISTINCT
                p.id as productId,
                p.name as productName,
                p.stock as currentStock,
                MAX(s.created_at) as lastSoldAt
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.empresa_id = ? 
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(s.created_at, '+00:00', '-06:00')) <= ?
              AND p.stock = 0
            GROUP BY p.id, p.name, p.stock
        `, [empresaId, startDate, endDate]);

        const [paymentBreakdown] = await pool.query(`
            SELECT 
                payment_method,
                COALESCE(SUM(total), 0) as total
            FROM sales
            WHERE empresa_id = ? 
              AND DATE(CONVERT_TZ(created_at, '+00:00', '-06:00')) >= ?
              AND DATE(CONVERT_TZ(created_at, '+00:00', '-06:00')) <= ?
            GROUP BY payment_method
        `, [empresaId, startDate, endDate]);

        const payments = {
            cash: paymentBreakdown.find(p => p.payment_method === 'cash')?.total || 0,
            card: paymentBreakdown.find(p => p.payment_method === 'card')?.total || 0
        };

        // Get goal
        const [goalRows] = await pool.query(`
            SELECT setting_value FROM business_settings
            WHERE empresa_id = ? AND setting_key = 'monthly_sales_goal'
        `, [empresaId]);

        const goal = goalRows[0] ? parseFloat(goalRows[0].setting_value) : 0;

        res.json({
            month,
            metrics,
            goal,
            teamPerformance,
            cashSessions,
            topProducts,
            stockAlerts,
            paymentBreakdown: payments
        });
    } catch (error) {
        console.error('Get detailed monthly report error:', error);
        res.status(500).json({ error: 'Error al obtener reporte mensual detallado' });
    }
});

export default router;
