import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import { authenticateToken, requireGlobalAdmin, validateEmpresaActive } from '../middleware/auth.js';
import { logEmpresaCreated, logEmpresaSuspended, logEmpresaDeleted, logUserCreated } from '../services/auditLogger.js';

const router = express.Router();

// All routes require global_admin role
router.use(authenticateToken);
router.use(requireGlobalAdmin);

// Get all empresas
router.get('/', async (req, res) => {
    try {
        const { estado, plan } = req.query;
        console.log('[DEBUG] GET /empresas request:', { estado, plan, user: req.user.username });

        let query = `
            SELECT e.*, 
                   (SELECT COUNT(*) FROM users WHERE empresa_id = e.id) as total_usuarios,
                   (SELECT COUNT(*) FROM products WHERE empresa_id = e.id) as total_productos
            FROM empresas e
            WHERE 1=1
        `;
        const params = [];

        if (estado) {
            query += ' AND e.estado = ?';
            params.push(estado);
        }

        if (plan) {
            query += ' AND e.plan_contratado = ?';
            params.push(plan);
        }

        query += ' ORDER BY e.fecha_registro DESC';

        console.log('[DEBUG] Executing query:', query, 'Params:', params);

        const [empresas] = await pool.query(query, params);
        console.log(`[DEBUG] Found ${empresas.length} empresas`);

        res.json(empresas);
    } catch (error) {
        console.error('Get empresas error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get single empresa
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [empresaRows] = await pool.query(`
            SELECT e.*, 
                   (SELECT COUNT(*) FROM users WHERE empresa_id = e.id) as total_usuarios,
                   (SELECT COUNT(*) FROM products WHERE empresa_id = e.id) as total_productos,
                   (SELECT COUNT(*) FROM sales WHERE empresa_id = e.id) as total_ventas
            FROM empresas e
            WHERE e.id = ?
        `, [id]);

        const empresa = empresaRows[0];

        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Get empresa admins (no operational data, just management info)
        const [admins] = await pool.query(`
            SELECT id, username, role, created_at 
            FROM users 
            WHERE empresa_id = ? AND role = 'empresa_admin'
        `, [id]);

        res.json({ ...empresa, admins });
    } catch (error) {
        console.error('Get empresa error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create new empresa
router.post('/', async (req, res) => {
    try {
        const { nombre_empresa, plan_contratado, max_usuarios, max_productos, notas, billing_cycle_date } = req.body;

        if (!nombre_empresa) {
            return res.status(400).json({ error: 'Nombre de empresa es requerido' });
        }

        const plan = plan_contratado || 'Basico';

        // Validate plan
        if (!['Prueba', 'Basico', 'Premium', 'Empresarial'].includes(plan)) {
            return res.status(400).json({ error: 'Plan inválido' });
        }

        const [result] = await pool.query(`
            INSERT INTO empresas (nombre_empresa, plan_contratado, estado, max_usuarios, max_productos, notas, billing_cycle_date)
            VALUES (?, ?, 'Activo', ?, ?, ?, ?)
        `, [
            nombre_empresa,
            plan,
            max_usuarios || 5,
            max_productos || 100,
            notas || null,
            billing_cycle_date || null
        ]);

        // Audit log
        logEmpresaCreated(result.insertId, nombre_empresa, plan, req.user.id);

        res.status(201).json({
            message: 'Empresa creada correctamente',
            id: result.insertId
        });
    } catch (error) {
        console.error('Create empresa error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Update empresa
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_empresa, plan_contratado, max_usuarios, max_productos, notas, billing_cycle_date } = req.body;

        const [empresaRows] = await pool.query('SELECT id FROM empresas WHERE id = ?', [id]);
        if (empresaRows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (plan_contratado && !['Basico', 'Premium', 'Empresarial'].includes(plan_contratado)) {
            return res.status(400).json({ error: 'Plan inválido' });
        }

        await pool.query(`
            UPDATE empresas 
            SET nombre_empresa = COALESCE(?, nombre_empresa),
                plan_contratado = COALESCE(?, plan_contratado),
                max_usuarios = COALESCE(?, max_usuarios),
                max_productos = COALESCE(?, max_productos),
                notas = COALESCE(?, notas),
                billing_cycle_date = COALESCE(?, billing_cycle_date)
            WHERE id = ?
        `, [nombre_empresa, plan_contratado, max_usuarios, max_productos, notas, billing_cycle_date, id]);

        res.json({ message: 'Empresa actualizada correctamente' });
    } catch (error) {
        console.error('Update empresa error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Suspend empresa (for non-payment)
router.post('/:id/suspend', async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;

        const [empresaRows] = await pool.query('SELECT id, estado FROM empresas WHERE id = ?', [id]);
        const empresa = empresaRows[0];

        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (empresa.estado === 'Suspendido') {
            return res.status(400).json({ error: 'La empresa ya está suspendida' });
        }

        const motivoText = `Suspendido: ${motivo || 'Falta de pago'}`;
        await pool.query(`
            UPDATE empresas 
            SET estado = 'Suspendido', 
                fecha_suspension = CURRENT_TIMESTAMP,
                notas = CASE 
                    WHEN notas IS NULL THEN ? 
                    ELSE CONCAT(notas, ' | ', ?)
                END
            WHERE id = ?
        `, [motivoText, motivoText, id]);

        // Audit log
        const [empresaData] = await pool.query('SELECT nombre_empresa FROM empresas WHERE id = ?', [id]);
        logEmpresaSuspended(id, empresaData[0]?.nombre_empresa || `ID:${id}`, motivo, req.user.id);

        res.json({ message: 'Empresa suspendida correctamente' });
    } catch (error) {
        console.error('Suspend empresa error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Reactivate empresa
router.post('/:id/activate', async (req, res) => {
    try {
        const { id } = req.params;

        const [empresaRows] = await pool.query('SELECT id, estado FROM empresas WHERE id = ?', [id]);
        const empresa = empresaRows[0];

        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (empresa.estado === 'Activo') {
            return res.status(400).json({ error: 'La empresa ya está activa' });
        }

        if (empresa.estado === 'Baja') {
            return res.status(400).json({ error: 'No se puede reactivar una empresa dada de baja' });
        }

        await pool.query(`
            UPDATE empresas 
            SET estado = 'Activo', 
                fecha_suspension = NULL,
                notas = CASE 
                    WHEN notas IS NULL THEN 'Reactivada'
                    ELSE CONCAT(notas, ' | Reactivada')
                END
            WHERE id = ?
        `, [id]);

        res.json({ message: 'Empresa reactivada correctamente' });
    } catch (error) {
        console.error('Activate empresa error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete empresa (mark as Baja - soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [empresaRows] = await pool.query('SELECT id, nombre_empresa FROM empresas WHERE id = ?', [id]);
        const empresa = empresaRows[0];

        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // We don't actually delete - just mark as Baja
        await pool.query(`
            UPDATE empresas 
            SET estado = 'Baja',
                notas = CASE 
                    WHEN notas IS NULL THEN 'Dada de baja'
                    ELSE CONCAT(notas, ' | Dada de baja')
                END
            WHERE id = ?
        `, [id]);

        // Audit log
        logEmpresaDeleted(id, empresa.nombre_empresa, req.user.id);

        res.json({ message: 'Empresa dada de baja correctamente' });
    } catch (error) {
        console.error('Delete empresa error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// PHYSICAL CASCADE DELETE - Permanently removes empresa and all related data
// USE WITH CAUTION - This is irreversible!
router.delete('/:id/purge', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { id } = req.params;
        const { confirmName } = req.body;

        const [empresaRows] = await connection.query('SELECT id, nombre_empresa FROM empresas WHERE id = ?', [id]);
        const empresa = empresaRows[0];

        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Require name confirmation for safety
        if (!confirmName || confirmName !== empresa.nombre_empresa) {
            return res.status(400).json({
                error: 'Debe confirmar el nombre de la empresa para eliminar permanentemente',
                required: empresa.nombre_empresa
            });
        }

        await connection.beginTransaction();

        // --- HISTORY SNAPSHOT BEFORE DELETION ---
        const [users] = await connection.query('SELECT id, username, role, is_admin FROM users WHERE empresa_id = ?', [id]);
        const [productCount] = await connection.query('SELECT COUNT(*) as count FROM products WHERE empresa_id = ?', [id]);
        const [productSample] = await connection.query('SELECT name, price FROM products WHERE empresa_id = ? LIMIT 5', [id]);
        const [salesCount] = await connection.query('SELECT COUNT(*) as count FROM sales WHERE empresa_id = ?', [id]);
        const [salesTotal] = await connection.query('SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE empresa_id = ?', [id]);

        const historySnapshot = {
            empresa: empresa,
            deleted_at: new Date().toISOString(),
            data_snapshot: {
                users: users,
                products_summary: {
                    count: productCount[0].count,
                    sample: productSample
                },
                sales_summary: {
                    count: salesCount[0].count,
                    total_revenue: salesTotal[0].total
                }
            }
        };

        // Log history report
        await connection.query(`
            INSERT INTO global_changes_log (empresa_id, event_type, description, metadata, user_id)
            VALUES (?, ?, ?, ?, ?)
        `, [
            id,
            'EMPRESA_PURGED_HISTORY',
            `Reporte histórico pre-eliminación de "${empresa.nombre_empresa}"`,
            JSON.stringify(historySnapshot),
            req.user.id
        ]);

        // --- MANUAL CASCADE DELETION START ---
        // 1. Remove Sales Data
        await connection.query('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE empresa_id = ?)', [id]);
        await connection.query('DELETE FROM sales_goals WHERE empresa_id = ?', [id]);
        await connection.query('DELETE FROM sales WHERE empresa_id = ?', [id]);

        // 2. Remove User Data
        await connection.query('DELETE FROM cash_sessions WHERE user_id IN (SELECT id FROM users WHERE empresa_id = ?)', [id]);
        await connection.query('DELETE FROM user_features WHERE user_id IN (SELECT id FROM users WHERE empresa_id = ?)', [id]);
        await connection.query('DELETE FROM users WHERE empresa_id = ?', [id]);

        // 3. Remove Product Data
        await connection.query('DELETE FROM products WHERE empresa_id = ?', [id]);

        // 4. Remove Settings
        await connection.query('DELETE FROM business_settings WHERE empresa_id = ?', [id]);

        // 5. Finally, remove the Empresa
        await connection.query('DELETE FROM empresas WHERE id = ?', [id]);

        await connection.commit();

        res.json({
            message: `Empresa "${empresa.nombre_empresa}" y todos sus datos eliminados permanentemente`,
            deleted: {
                empresa: empresa.nombre_empresa,
                history_saved: true
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Purge empresa error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        connection.release();
    }
});

// Create admin user for empresa
router.post('/:id/admin', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        const [empresaRows] = await pool.query('SELECT id, max_usuarios FROM empresas WHERE id = ?', [id]);
        const empresa = empresaRows[0];

        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Check username uniqueness (only within this company)
        // Note: Global uniqueness is no longer enforced to allow multi-tenancy
        const [existingUsers] = await pool.query('SELECT id FROM users WHERE username = ? AND empresa_id = ?', [username, id]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario ya existe en esta empresa' });
        }

        // Check user limit
        const [userCountRows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE empresa_id = ?', [id]);
        if (userCountRows[0].count >= empresa.max_usuarios) {
            return res.status(400).json({
                error: `Límite de usuarios alcanzado (${empresa.max_usuarios}). Actualice el plan para más usuarios.`
            });
        }

        // Generate random 5-digit employee number
        let employee_number = null;
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 10) {
            const pin = Math.floor(10000 + Math.random() * 90000).toString();
            const [existing] = await pool.query('SELECT id FROM users WHERE employee_number = ?', [pin]);
            if (existing.length === 0) {
                employee_number = pin;
                isUnique = true;
            }
            attempts++;
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const [result] = await pool.query(`
            INSERT INTO users (username, password_hash, empresa_id, role, is_admin, first_login, has_setup_complete, employee_number)
            VALUES (?, ?, ?, 'empresa_admin', 1, 1, 0, ?)
        `, [username, hashedPassword, id, employee_number]);

        // Assign all features to the new admin
        const [features] = await pool.query('SELECT id FROM features');
        for (const feature of features) {
            await pool.query(
                'INSERT IGNORE INTO user_features (user_id, feature_id, is_enabled) VALUES (?, ?, 1)',
                [result.insertId, feature.id]
            );
        }

        // AUDIT LOG - Includes credentials for test phase
        logUserCreated(parseInt(id), username, password, req.user.id);

        res.status(201).json({
            message: 'Administrador de empresa creado correctamente',
            userId: result.insertId
        });
    } catch (error) {
        console.error('Create empresa admin error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get empresa statistics (aggregated, no operational details)
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;

        const [empresaRows] = await pool.query('SELECT id FROM empresas WHERE id = ?', [id]);
        if (empresaRows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        const [usuariosCount] = await pool.query('SELECT COUNT(*) as count FROM users WHERE empresa_id = ?', [id]);
        const [productosCount] = await pool.query('SELECT COUNT(*) as count FROM products WHERE empresa_id = ?', [id]);
        const [ventasCount] = await pool.query('SELECT COUNT(*) as count FROM sales WHERE empresa_id = ?', [id]);
        const [ingresosTotal] = await pool.query('SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE empresa_id = ?', [id]);

        const stats = {
            usuarios: usuariosCount[0].count,
            productos: productosCount[0].count,
            ventas_totales: ventasCount[0].count,
            ingresos_totales: ingresosTotal[0].total
        };

        res.json(stats);
    } catch (error) {
        console.error('Get empresa stats error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get global audit logs (all empresas)
router.get('/logs/global', async (req, res) => {
    try {
        const { limit = 50, offset = 0, event_type, empresa_id } = req.query;

        let query = `
            SELECT l.*, e.nombre_empresa, u.username as triggered_by_username
            FROM global_changes_log l
            LEFT JOIN empresas e ON l.empresa_id = e.id
            LEFT JOIN users u ON l.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (event_type) {
            query += ' AND l.event_type = ?';
            params.push(event_type);
        }

        if (empresa_id) {
            query += ' AND l.empresa_id = ?';
            params.push(empresa_id);
        }

        query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [logs] = await pool.query(query, params);

        // Parse metadata JSON for each log
        const parsedLogs = logs.map(log => ({
            ...log,
            metadata: log.metadata ? JSON.parse(log.metadata) : null
        }));

        res.json(parsedLogs);
    } catch (error) {
        console.error('Get global logs error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get logs for specific empresa
router.get('/:id/logs', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 50 } = req.query;

        const [logs] = await pool.query(`
            SELECT l.*, u.username as triggered_by_username
            FROM global_changes_log l
            LEFT JOIN users u ON l.user_id = u.id
            WHERE l.empresa_id = ?
            ORDER BY l.created_at DESC
            LIMIT ?
        `, [id, parseInt(limit)]);

        // Parse metadata JSON for each log
        const parsedLogs = logs.map(log => ({
            ...log,
            metadata: log.metadata ? JSON.parse(log.metadata) : null
        }));

        res.json(parsedLogs);
    } catch (error) {
        console.error('Get empresa logs error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
