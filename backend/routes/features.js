import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import {
    authenticateToken,
    requireAdmin,
    requireEmpresaAdmin,
    requireGlobalAdmin,
    getEmpresaId,
    validateEmpresaActive
} from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get features for current user
router.get('/', async (req, res) => {
    try {
        const [features] = await pool.query(`
            SELECT f.id, f.name, f.display_name, f.description, f.icon, 
                   COALESCE(uf.is_enabled, 0) as is_enabled
            FROM features f
            LEFT JOIN user_features uf ON f.id = uf.feature_id AND uf.user_id = ?
        `, [req.user.id]);

        res.json(features);
    } catch (error) {
        console.error('Get features error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get all users with their features (empresa_admin or global_admin)
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        let users;

        // Global admin sees all non-global users
        if (req.user.role === 'global_admin') {
            const [allUsers] = await pool.query(`
                SELECT u.id, u.username, u.employee_number, u.is_admin, u.first_login, u.has_setup_complete, 
                       u.created_at, u.empresa_id, u.role, e.nombre_empresa
                FROM users u
                LEFT JOIN empresas e ON u.empresa_id = e.id
                WHERE u.role != 'global_admin'
                ORDER BY e.nombre_empresa, u.id ASC
            `);
            users = allUsers;
        } else {
            // Empresa admin sees only users from their empresa
            const [empresaUsers] = await pool.query(`
                SELECT u.id, u.username, u.employee_number, u.is_admin, u.first_login, u.has_setup_complete, 
                       u.created_at, u.empresa_id, u.role
                FROM users u
                WHERE u.empresa_id = ?
                ORDER BY u.id ASC
            `, [empresaId]);
            users = empresaUsers;
        }

        // Eager Backfill: Ensure all users have employee_number
        for (const u of users) {
            if (!u.employee_number) {
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
                if (employee_number) {
                    await pool.query('UPDATE users SET employee_number = ? WHERE id = ?', [employee_number, u.id]);
                    u.employee_number = employee_number;
                }
            }
        }

        console.log('Users found:', users.length, users.map(u => u.username));

        const [features] = await pool.query('SELECT id, name, display_name, description, icon FROM features');

        // Get features for each user
        const usersWithFeaturesPromises = users.map(async user => {
            const [userFeatures] = await pool.query(`
                SELECT f.id, f.name, COALESCE(uf.is_enabled, 0) as is_enabled
                FROM features f
                LEFT JOIN user_features uf ON f.id = uf.feature_id AND uf.user_id = ?
            `, [user.id]);

            return {
                ...user,
                is_admin: Boolean(user.is_admin),
                first_login: Boolean(user.first_login),
                has_setup_complete: Boolean(user.has_setup_complete),
                features: userFeatures.reduce((acc, f) => {
                    acc[f.name] = Boolean(f.is_enabled);
                    return acc;
                }, {})
            };
        });

        const usersWithFeatures = await Promise.all(usersWithFeaturesPromises);

        res.json({ users: usersWithFeatures, availableFeatures: features });
    } catch (error) {
        console.error('Get users features error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Toggle feature for a user (GLOBAL ADMIN ONLY)
router.put('/toggle/:userId/:featureId', requireGlobalAdmin, async (req, res) => {
    try {
        const { userId, featureId } = req.params;
        const { enabled } = req.body;



        // Check if user_feature exists
        const [existing] = await pool.query(
            'SELECT id, is_enabled FROM user_features WHERE user_id = ? AND feature_id = ?',
            [userId, featureId]
        );

        if (existing.length > 0) {
            await pool.query('UPDATE user_features SET is_enabled = ? WHERE id = ?',
                [enabled ? 1 : 0, existing[0].id]);
        } else {
            await pool.query('INSERT INTO user_features (user_id, feature_id, is_enabled) VALUES (?, ?, ?)',
                [userId, featureId, enabled ? 1 : 0]);
        }

        res.json({ message: 'Feature actualizada correctamente' });
    } catch (error) {
        console.error('Toggle feature error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create new user (empresa_admin for their empresa, global_admin for any)
router.post('/users', requireAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { username, password, role, target_empresa_id } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        // Determine which empresa_id to use
        let userEmpresaId = empresaId;

        // Global admin can specify target empresa
        if (req.user.role === 'global_admin' && target_empresa_id) {
            const [targetEmpresaRows] = await pool.query('SELECT id FROM empresas WHERE id = ?', [target_empresa_id]);
            if (targetEmpresaRows.length === 0) {
                return res.status(400).json({ error: 'Empresa destino no encontrada' });
            }
            userEmpresaId = target_empresa_id;
        } else if (req.user.role !== 'global_admin' && !empresaId) {
            return res.status(403).json({ error: 'Usuario sin empresa asignada' });
        }

        // Check user limit for empresa
        if (userEmpresaId) {
            const [empresaRows] = await pool.query('SELECT max_usuarios FROM empresas WHERE id = ?', [userEmpresaId]);
            const empresa = empresaRows[0];
            const [userCountRows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE empresa_id = ?', [userEmpresaId]);
            const userCount = userCountRows[0];

            if (userCount.count >= empresa.max_usuarios) {
                return res.status(400).json({
                    error: `Límite de usuarios alcanzado (${empresa.max_usuarios}). Actualice el plan para más usuarios.`
                });
            }
        }

        // Check if username already exists within the target empresa
        let checkUserQuery = 'SELECT id FROM users WHERE username = ? AND empresa_id = ?';
        let checkUserParams = [username, userEmpresaId];

        if (!userEmpresaId) {
            checkUserQuery = 'SELECT id FROM users WHERE username = ? AND empresa_id IS NULL';
            checkUserParams = [username];
        }

        const [existingUserRows] = await pool.query(checkUserQuery, checkUserParams);
        if (existingUserRows.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario ya existe en esta empresa' });
        }

        // Check if employee_number is provided and unique
        let { employee_number } = req.body;

        if (employee_number) {
            // Validate provided number GLOBALLY
            const [existingNumRows] = await pool.query('SELECT id FROM users WHERE employee_number = ?', [employee_number]);
            if (existingNumRows.length > 0) {
                return res.status(400).json({ error: 'El número de empleado ya existe en el sistema' });
            }
        } else {
            // Auto-generate random 5-digit PIN (Globally Unique)
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
            if (!isUnique) throw new Error('Could not generate unique PIN');
        }

        // Validate role
        const userRole = role || 'employee';
        if (!['empresa_admin', 'employee'].includes(userRole)) {
            return res.status(400).json({ error: 'Rol inválido' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, empresa_id, role, is_admin, first_login, employee_number) VALUES (?, ?, ?, ?, ?, 1, ?)',
            [username, hashedPassword, userEmpresaId, userRole, userRole === 'empresa_admin' ? 1 : 0, employee_number || null]
        );

        const newUserId = result.insertId;
        console.log('Created user with ID:', newUserId);

        // Assign features (enabled for admins, disabled for employees)
        try {
            const [features] = await pool.query('SELECT id FROM features');
            for (const feature of features) {
                await pool.query('INSERT IGNORE INTO user_features (user_id, feature_id, is_enabled) VALUES (?, ?, ?)',
                    [newUserId, feature.id, userRole === 'empresa_admin' ? 1 : 0]);
            }
        } catch (featureError) {
            console.error('Error assigning features (non-critical):', featureError);
        }

        res.json({
            message: 'Usuario creado correctamente',
            userId: newUserId
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete user - Hierarchical deletion rules
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;

        // Prevent deleting yourself
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
        }

        // Check if user exists
        const [targetUserRows] = await pool.query('SELECT id, username, empresa_id, role FROM users WHERE id = ?', [id]);
        const targetUser = targetUserRows[0];

        if (!targetUser) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // HIERARCHY ENFORCEMENT
        if (targetUser.role === 'global_admin') {
            return res.status(403).json({
                error: 'Acceso denegado. No se puede eliminar al Administrador Global.'
            });
        }

        if (req.user.role === 'global_admin') {
            // Allowed - proceed to deletion
        } else if (req.user.role === 'empresa_admin') {
            if (targetUser.empresa_id !== empresaId) {
                return res.status(403).json({
                    error: 'No tiene permisos para eliminar usuarios de otra empresa'
                });
            }
            if (targetUser.role === 'empresa_admin') {
                return res.status(403).json({
                    error: 'Solo el Administrador Global puede eliminar a un Gerente de Empresa'
                });
            }
            if (targetUser.role !== 'employee') {
                return res.status(403).json({
                    error: 'Solo puede eliminar usuarios con rol de Empleado'
                });
            }
        } else {
            return res.status(403).json({
                error: 'No tiene permisos para eliminar usuarios'
            });
        }

        // CHECK FOR HISTORY (Sales or Cash Sessions) to prevent 500 error
        const [salesCount] = await pool.query('SELECT COUNT(*) as count FROM sales WHERE user_id = ?', [id]);
        const [sessionsCount] = await pool.query('SELECT COUNT(*) as count FROM cash_sessions WHERE user_id = ?', [id]);

        if (salesCount[0].count > 0 || sessionsCount[0].count > 0) {
            return res.status(400).json({
                error: `No se puede eliminar al usuario porque tiene ${salesCount[0].count} ventas y ${sessionsCount[0].count} sesiones de caja registradas. La eliminación corrompería el historial.`
            });
        }

        // Delete user features first
        await pool.query('DELETE FROM user_features WHERE user_id = ?', [id]);

        // Delete user
        await pool.query('DELETE FROM users WHERE id = ?', [id]);

        res.json({ message: `Usuario "${targetUser.username}" eliminado correctamente` });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Toggle user setup status (admin only)
router.put('/users/:id/status', requireAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;
        const { has_setup_complete } = req.body;

        const [userRows] = await pool.query('SELECT id, username, has_setup_complete, empresa_id FROM users WHERE id = ?', [id]);
        const user = userRows[0];

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Empresa admin can only modify users from their empresa
        if (req.user.role !== 'global_admin' && user.empresa_id !== empresaId) {
            return res.status(403).json({ error: 'No tiene permisos para modificar este usuario' });
        }

        const newStatus = has_setup_complete !== undefined ? (has_setup_complete ? 1 : 0) : (user.has_setup_complete ? 0 : 1);

        await pool.query('UPDATE users SET has_setup_complete = ? WHERE id = ?', [newStatus, id]);

        res.json({
            message: `Estado de "${user.username}" actualizado`,
            has_setup_complete: newStatus === 1
        });
    } catch (error) {
        console.error('Toggle user status error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Update user role (empresa_admin only)
router.put('/users/:id/role', requireEmpresaAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;
        const { role } = req.body;

        if (!['empresa_admin', 'employee'].includes(role)) {
            return res.status(400).json({ error: 'Rol inválido' });
        }

        const [userRows] = await pool.query('SELECT id, username, empresa_id, role FROM users WHERE id = ?', [id]);
        const user = userRows[0];

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Can only modify users from same empresa
        if (req.user.role !== 'global_admin' && user.empresa_id !== empresaId) {
            return res.status(403).json({ error: 'No tiene permisos para modificar este usuario' });
        }

        // Can't change global_admin role
        if (user.role === 'global_admin') {
            return res.status(400).json({ error: 'No se puede cambiar el rol de un administrador global' });
        }

        await pool.query('UPDATE users SET role = ?, is_admin = ? WHERE id = ?',
            [role, role === 'empresa_admin' ? 1 : 0, id]);

        res.json({
            message: `Rol de "${user.username}" actualizado a ${role}`
        });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Manage feature availability (global_admin only)
router.post('/', requireGlobalAdmin, async (req, res) => {
    try {
        const { name, display_name, description, icon } = req.body;

        if (!name || !display_name) {
            return res.status(400).json({ error: 'Nombre y nombre de display son requeridos' });
        }

        const [result] = await pool.query(
            'INSERT INTO features (name, display_name, description, icon) VALUES (?, ?, ?, ?)',
            [name, display_name, description || null, icon || 'cube']
        );

        res.json({
            message: 'Feature creada correctamente',
            id: result.insertId
        });
    } catch (error) {
        console.error('Create feature error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete feature (global_admin only)
router.delete('/:id', requireGlobalAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [featureRows] = await pool.query('SELECT id, name FROM features WHERE id = ?', [id]);
        const feature = featureRows[0];

        if (!feature) {
            return res.status(404).json({ error: 'Feature no encontrada' });
        }

        // Delete user_features first
        await pool.query('DELETE FROM user_features WHERE feature_id = ?', [id]);

        // Delete feature
        await pool.query('DELETE FROM features WHERE id = ?', [id]);

        res.json({ message: `Feature "${feature.name}" eliminada correctamente` });
    } catch (error) {
        console.error('Delete feature error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
