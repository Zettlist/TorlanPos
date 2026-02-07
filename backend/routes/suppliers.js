
import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);
router.use(validateEmpresaActive);

// Get all suppliers for the empresa
router.get('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Acceso denegado' });

        const [suppliers] = await pool.query(
            'SELECT * FROM suppliers WHERE empresa_id = ? ORDER BY name ASC',
            [empresaId]
        );
        res.json(suppliers);
    } catch (error) {
        console.error('Get suppliers error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create a supplier
router.post('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { name, contact_info } = req.body;

        if (!empresaId) return res.status(403).json({ error: 'Acceso denegado' });
        if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

        const [result] = await pool.query(
            'INSERT INTO suppliers (empresa_id, name, contact_info) VALUES (?, ?, ?)',
            [empresaId, name, contact_info || null]
        );

        res.json({ id: result.insertId, message: 'Proveedor creado correctamente' });
    } catch (error) {
        console.error('Create supplier error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Update a supplier
router.put('/:id', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;
        const { name, contact_info } = req.body;

        if (!empresaId) return res.status(403).json({ error: 'Acceso denegado' });
        if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

        const [result] = await pool.query(
            'UPDATE suppliers SET name = ?, contact_info = ? WHERE id = ? AND empresa_id = ?',
            [name, contact_info || null, id, empresaId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Proveedor no encontrado' });
        }

        res.json({ message: 'Proveedor actualizado correctamente' });
    } catch (error) {
        console.error('Update supplier error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete a supplier
router.delete('/:id', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;

        if (!empresaId) return res.status(403).json({ error: 'Acceso denegado' });

        const [result] = await pool.query(
            'DELETE FROM suppliers WHERE id = ? AND empresa_id = ?',
            [id, empresaId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Proveedor no encontrado' });
        }

        res.json({ message: 'Proveedor eliminado correctamente' });
    } catch (error) {
        console.error('Delete supplier error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
