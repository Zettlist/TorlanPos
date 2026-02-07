import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';

const router = express.Router();

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'torlan_pos_secret_key_2024';

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. Search for user by username OR employee_number
        const [rows] = await pool.query(`
            SELECT u.*, e.estado as empresa_estado 
            FROM users u
            LEFT JOIN empresas e ON u.empresa_id = e.id
            WHERE u.username = ? OR u.employee_number = ?
        `, [username, username]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        // 2. Iterate through found users (to support duplicate usernames in different companies)
        // We check password for each until we find a match
        let user = null;
        for (const candidate of rows) {
            const isMatch = (password === candidate.password_hash) ||
                (await bcrypt.compare(password, candidate.password_hash).catch(() => false));

            if (isMatch) {
                user = candidate;
                break;
            }
        }

        if (!user) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        // 3. Check if empresa is suspended (if user has empresa_id)
        if (user.empresa_id && user.empresa_estado === 'Suspendido') {
            return res.status(403).json({
                error: "Empresa suspendida. Contacte al administrador.",
                suspended: true
            });
        }

        // 4. Lazy Backfill: If user has no employee_number, generate one now
        if (!user.employee_number) {
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
                await pool.query('UPDATE users SET employee_number = ? WHERE id = ?', [employee_number, user.id]);
                user.employee_number = employee_number;
                console.log(`Lazy backfill: Generated employee_number ${employee_number} for user ${user.username}`);
            }
        }

        // 5. Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                empresa_id: user.empresa_id,
                is_admin: user.is_admin
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // 5. Successful login
        res.json({
            message: "Login exitoso",
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                empresa_id: user.empresa_id,
                is_admin: Boolean(user.is_admin),
                first_login: Boolean(user.first_login),
                has_setup_complete: Boolean(user.has_setup_complete),
                onboarding_completed: Boolean(user.onboarding_completed)
            }
        });

    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get fresh user data
        const [rows] = await pool.query(`
            SELECT u.*, e.estado as empresa_estado 
            FROM users u
            LEFT JOIN empresas e ON u.empresa_id = e.id
            WHERE u.id = ?
        `, [decoded.id]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }

        const user = rows[0];

        // Check if empresa is suspended
        if (user.empresa_id && user.empresa_estado === 'Suspendido') {
            return res.status(403).json({
                error: "Empresa suspendida",
                suspended: true
            });
        }

        res.json({
            valid: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                empresa_id: user.empresa_id,
                is_admin: Boolean(user.is_admin),
                first_login: Boolean(user.first_login),
                has_setup_complete: Boolean(user.has_setup_complete),
                onboarding_completed: Boolean(user.onboarding_completed)
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ error: 'Token inválido' });
    }
});

// Get current user info with features (called by frontend after login)
router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get fresh user data
        const [rows] = await pool.query(`
            SELECT u.*, e.estado as empresa_estado, e.nombre_empresa
            FROM users u
            LEFT JOIN empresas e ON u.empresa_id = e.id
            WHERE u.id = ?
        `, [decoded.id]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }

        const user = rows[0];

        // Lazy Backfill for /me endpoint as well
        if (!user.employee_number) {
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
                await pool.query('UPDATE users SET employee_number = ? WHERE id = ?', [employee_number, user.id]);
                user.employee_number = employee_number;
            }
        }

        // Check if empresa is suspended
        if (user.empresa_id && user.empresa_estado === 'Suspendido') {
            return res.status(403).json({
                error: "Empresa suspendida. Contacte al administrador.",
                code: 'EMPRESA_SUSPENDED'
            });
        }

        if (user.empresa_id && user.empresa_estado === 'Baja') {
            return res.status(403).json({
                error: "Empresa dada de baja.",
                code: 'EMPRESA_INACTIVE'
            });
        }

        // Get user features
        const [featureRows] = await pool.query(`
            SELECT f.name, uf.is_enabled
            FROM user_features uf
            JOIN features f ON uf.feature_id = f.id
            WHERE uf.user_id = ?
        `, [user.id]);

        const features = {};
        featureRows.forEach(row => {
            features[row.name] = Boolean(row.is_enabled);
        });

        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                empresa_id: user.empresa_id,
                empresa: user.nombre_empresa ? {
                    id: user.empresa_id,
                    name: user.nombre_empresa,
                    estado: user.empresa_estado
                } : null,
                is_admin: Boolean(user.is_admin),
                first_login: Boolean(user.first_login),
                has_setup_complete: Boolean(user.has_setup_complete),
                onboarding_completed: Boolean(user.onboarding_completed)
            },
            features
        });
    } catch (error) {
        console.error('Error getting user info:', error);
        res.status(401).json({ error: 'Token inválido' });
    }
});

// Change password endpoint
router.post('/change-password', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { currentPassword, newPassword } = req.body;

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get current user
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = rows[0];

        // Verify current password if provided (not required for first login)
        if (currentPassword) {
            const passwordMatch = (currentPassword === user.password_hash) ||
                (await bcrypt.compare(currentPassword, user.password_hash).catch(() => false));

            if (!passwordMatch) {
                return res.status(401).json({ error: 'Contraseña actual incorrecta' });
            }
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and mark first_login as false
        await pool.query(
            'UPDATE users SET password_hash = ?, first_login = 0 WHERE id = ?',
            [hashedPassword, user.id]
        );

        res.json({
            message: 'Contraseña actualizada exitosamente',
            success: true
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

// Complete setup endpoint
router.post('/complete-setup', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        await pool.query(
            'UPDATE users SET has_setup_complete = 1 WHERE id = ?',
            [decoded.id]
        );

        res.json({
            message: 'Setup completado',
            success: true
        });

    } catch (error) {
        console.error('Error completing setup:', error);
        res.status(500).json({ error: 'Error al completar setup' });
    }
});

export default router;