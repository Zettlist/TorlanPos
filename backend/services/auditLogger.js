/**
 * Audit Logger Service
 * Centralized logging for critical events across all empresas
 */

import pool from '../database/db.js';

/**
 * Log a global change event
 * @param {number|null} empresaId - ID of the empresa (null for global events)
 * @param {string} eventType - Type of event (e.g., 'USER_CREATED', 'CONFIG_UPDATED')
 * @param {string} description - Human-readable description
 * @param {object|null} metadata - Additional data (will be JSON stringified)
 * @param {number|null} userId - ID of user who triggered the event
 */
export async function logGlobalChange(empresaId, eventType, description, metadata = null, userId = null) {
    try {
        await pool.query(`
            INSERT INTO global_changes_log (empresa_id, event_type, description, metadata, user_id)
            VALUES (?, ?, ?, ?, ?)
        `, [
            empresaId,
            eventType,
            description,
            metadata ? JSON.stringify(metadata) : null,
            userId
        ]);
    } catch (error) {
        console.error('Audit log error:', error);
        // Don't throw - logging should not break the main flow
    }
}

/**
 * Log user creation event (includes credentials for test phase)
 */
export function logUserCreated(empresaId, username, tempPassword, createdByUserId = null) {
    logGlobalChange(
        empresaId,
        'USER_CREATED',
        `Usuario "${username}" creado`,
        {
            username,
            temp_password: tempPassword, // For test phase only - remove in production
            created_at: new Date().toISOString()
        },
        createdByUserId
    );
}

/**
 * Log configuration update event
 */
export function logConfigUpdated(empresaId, userId, changes = {}) {
    logGlobalChange(
        empresaId,
        'CONFIG_UPDATED',
        'Configuración de empresa actualizada',
        { changes },
        userId
    );
}

/**
 * Log empresa creation
 */
export function logEmpresaCreated(empresaId, nombre, plan, createdByUserId = null) {
    logGlobalChange(
        empresaId,
        'EMPRESA_CREATED',
        `Empresa "${nombre}" creada con plan ${plan}`,
        { nombre, plan },
        createdByUserId
    );
}

/**
 * Log empresa suspension
 */
export function logEmpresaSuspended(empresaId, nombre, reason = null, userId = null) {
    logGlobalChange(
        empresaId,
        'EMPRESA_SUSPENDED',
        `Empresa "${nombre}" suspendida`,
        { reason },
        userId
    );
}

/**
 * Log empresa deletion
 */
export function logEmpresaDeleted(empresaId, nombre, userId = null) {
    logGlobalChange(
        empresaId,
        'EMPRESA_DELETED',
        `Empresa "${nombre}" eliminada con todos sus datos`,
        { deleted_at: new Date().toISOString() },
        userId
    );
}

/**
 * Log onboarding completion
 */
export function logOnboardingCompleted(empresaId, userId, goals = {}) {
    logGlobalChange(
        empresaId,
        'ONBOARDING_COMPLETED',
        'Configuración inicial completada',
        { goals },
        userId
    );
}

export default {
    logGlobalChange,
    logUserCreated,
    logConfigUpdated,
    logEmpresaCreated,
    logEmpresaSuspended,
    logEmpresaDeleted,
    logOnboardingCompleted
};
