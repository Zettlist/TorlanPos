import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, requireEmpresaAdmin } from '../middleware/auth.js';

const router = express.Router();

const EVENTO_MUNDIAL = 'mundial2026-mex-kor';
const OPCIONES = ['mexico', 'corea'];

/**
 * GET /api/eventos/mundial/votos
 * Conteos + lista de votantes (datos de clientes web) + resultado publicado.
 * Solo managers: incluye emails de clientes.
 */
router.get('/mundial/votos', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    try {
        const [conteoRows] = await pool.query(
            'SELECT opcion, COUNT(*) AS total FROM event_votes WHERE evento = ? GROUP BY opcion',
            [EVENTO_MUNDIAL]
        );
        const conteos = Object.fromEntries(OPCIONES.map(o => [o, 0]));
        for (const r of conteoRows) conteos[r.opcion] = r.total;

        const [votantes] = await pool.query(
            `SELECT v.id, v.opcion, v.created_at,
                    c.id AS cliente_id, c.nombre, c.apellido, c.email
             FROM event_votes v
             LEFT JOIN clientes c ON c.id = v.cliente_id
             WHERE v.evento = ?
             ORDER BY v.created_at DESC`,
            [EVENTO_MUNDIAL]
        );

        const [resultado] = await pool.query(
            'SELECT ganador, codigo, updated_at FROM event_results WHERE evento = ?',
            [EVENTO_MUNDIAL]
        );

        res.json({
            conteos,
            votantes,
            resultado: resultado[0] || null,
        });
    } catch (error) {
        console.error('GET /api/eventos/mundial/votos error:', error);
        res.status(500).json({ error: 'Error al obtener los votos del evento' });
    }
});

/**
 * PATCH /api/eventos/mundial/resultado
 * Publica el ganador y el código de descuento que verán los acertantes en la tienda.
 * Body: { ganador: 'mexico' | 'sudafrica', codigo: 'MUNDIAL10' }
 */
router.patch('/mundial/resultado', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const { ganador, codigo } = req.body;

    if (!OPCIONES.includes(ganador)) {
        return res.status(400).json({ error: 'Ganador inválido' });
    }

    try {
        await pool.query(
            `INSERT INTO event_results (evento, ganador, codigo) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE ganador = VALUES(ganador), codigo = VALUES(codigo)`,
            [EVENTO_MUNDIAL, ganador, codigo || null]
        );
        res.json({ message: 'Resultado publicado' });
    } catch (error) {
        console.error('PATCH /api/eventos/mundial/resultado error:', error);
        res.status(500).json({ error: 'Error al publicar el resultado' });
    }
});

export default router;
