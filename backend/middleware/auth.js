import jwt from 'jsonwebtoken';
import pool from '../database/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'torlan_pos_secret_key_2024';

/**
 * Authenticate JWT token and attach user info to request
 */
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o expirado' });
        }
        req.user = user;
        next();
    });
}

/**
 * Validate that user's empresa is active (not suspended or baja)
 * Skip validation for global_admin users
 */
export async function validateEmpresaActive(req, res, next) {
    try {
        // Global admins don't belong to an empresa
        if (req.user.role === 'global_admin') {
            return next();
        }

        if (!req.user.empresa_id) {
            return res.status(403).json({ error: 'Usuario sin empresa asignada' });
        }

        const [rows] = await pool.query('SELECT estado FROM empresas WHERE id = ?', [req.user.empresa_id]);
        const empresa = rows[0];

        if (!empresa) {
            return res.status(403).json({ error: 'Empresa no encontrada' });
        }

        if (empresa.estado === 'Suspendido') {
            return res.status(403).json({
                error: 'Acceso denegado. La cuenta de su empresa está suspendida por falta de pago.',
                code: 'EMPRESA_SUSPENDED'
            });
        }

        if (empresa.estado === 'Baja') {
            return res.status(403).json({
                error: 'Acceso denegado. La cuenta de su empresa ha sido dada de baja.',
                code: 'EMPRESA_INACTIVE'
            });
        }

        next();
    } catch (error) {
        console.error('validateEmpresaActive error:', error);
        return res.status(500).json({ error: 'Error al validar estado de empresa' });
    }
}

/**
 * Require specific role(s) to access route
 * @param  {...string} roles - Allowed roles
 */
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user.role) {
            return res.status(403).json({ error: 'Usuario sin rol asignado' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Acceso denegado. No tiene permisos para esta acción.',
                requiredRoles: roles,
                userRole: req.user.role
            });
        }

        next();
    };
}

/**
 * Legacy requireAdmin - now uses role-based check
 */
export function requireAdmin(req, res, next) {
    if (req.user.role !== 'global_admin' && req.user.role !== 'empresa_admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    next();
}

/**
 * Require global admin (TorlanAdmin) role
 */
export function requireGlobalAdmin(req, res, next) {
    if (req.user.role !== 'global_admin') {
        return res.status(403).json({ error: 'Acceso denegado. Solo TorlanAdmin puede realizar esta acción.' });
    }
    next();
}

/**
 * Require empresa admin or higher role
 */
export function requireEmpresaAdmin(req, res, next) {
    if (req.user.role !== 'global_admin' && req.user.role !== 'empresa_admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador de empresa.' });
    }
    next();
}

/**
 * Extract empresa_id from authenticated user
 * NEVER trust empresa_id from request body - always get from token
 * @param {object} req - Express request object
 * @returns {number|null} - empresa_id or null for global_admin
 */
export function getEmpresaId(req) {
    if (req.user.role === 'global_admin') {
        return null;
    }
    return req.user.empresa_id;
}

/**
 * Generate JWT token with multi-tenant info
 */
export function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            is_admin: user.is_admin,
            empresa_id: user.empresa_id,
            role: user.role,
            onboarding_completed: user.onboarding_completed
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

export { JWT_SECRET };
