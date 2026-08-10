/**
 * Formatos de envio: medidas y peso por edicion.
 *
 * Existen porque largo/ancho/alto/peso solo se usan para cotizar con Envia.com
 * y dentro de una edicion son identicos entre tomos. Se miden una vez y se
 * seleccionan; antes se capturaban libro por libro en `products.dimensions`,
 * un texto libre que llego a tener '18x12.8x1.5', '18 x 12,8 x 1.5 cm' y
 * '18cm' para la misma edicion — imposible de usar para cotizar sin adivinar.
 */
import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';
import { requireInventoryWrite } from '../middleware/inventoryAccess.js';

const router = express.Router();
router.use(authenticateToken);
router.use(validateEmpresaActive);

const CAMPOS = ['length_cm', 'width_cm', 'height_cm', 'weight_g'];

/** Valida el cuerpo. Devuelve el error o null. */
function validar(body) {
    const nombre = String(body.name || '').trim();
    if (!nombre) return 'El nombre del formato es obligatorio';
    if (nombre.length > 120) return 'El nombre no puede pasar de 120 caracteres';

    for (const c of CAMPOS) {
        const v = Number(body[c]);
        // Un cero aqui lo rechaza Envia.com al cotizar, no al guardar: el error
        // saldria en el checkout de un cliente, no en el alta del producto.
        if (!Number.isFinite(v) || v <= 0) {
            return `La medida "${c}" tiene que ser un numero mayor que cero`;
        }
    }
    return null;
}

// Lista de formatos de la empresa, con cuantos productos usa cada uno.
router.get('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Usuario sin empresa asignada' });

        const [rows] = await pool.query(`
            SELECT pf.*, COUNT(p.id) AS productos
              FROM product_formats pf
              LEFT JOIN products p ON p.format_id = pf.id
             WHERE pf.empresa_id = ?
             GROUP BY pf.id
             ORDER BY pf.name
        `, [empresaId]);

        res.json(rows);
    } catch (error) {
        console.error('Listar formatos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Usuario sin empresa asignada' });

        const problema = validar(req.body);
        if (problema) return res.status(400).json({ error: problema });

        const [r] = await pool.query(
            `INSERT INTO product_formats (empresa_id, name, length_cm, width_cm, height_cm, weight_g)
             VALUES (?,?,?,?,?,?)`,
            [empresaId, String(req.body.name).trim(),
                req.body.length_cm, req.body.width_cm, req.body.height_cm, req.body.weight_g]);

        const [[creado]] = await pool.query('SELECT * FROM product_formats WHERE id = ?', [r.insertId]);
        res.status(201).json(creado);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe un formato con ese nombre' });
        }
        console.error('Crear formato:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.put('/:id', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Usuario sin empresa asignada' });

        const problema = validar(req.body);
        if (problema) return res.status(400).json({ error: problema });

        // El WHERE lleva empresa_id: sin el, un id ajeno se editaria igual.
        const [r] = await pool.query(
            `UPDATE product_formats
                SET name = ?, length_cm = ?, width_cm = ?, height_cm = ?, weight_g = ?
              WHERE id = ? AND empresa_id = ?`,
            [String(req.body.name).trim(), req.body.length_cm, req.body.width_cm,
                req.body.height_cm, req.body.weight_g, req.params.id, empresaId]);

        if (r.affectedRows === 0) return res.status(404).json({ error: 'Formato no encontrado' });

        const [[actualizado]] = await pool.query(
            'SELECT * FROM product_formats WHERE id = ?', [req.params.id]);
        res.json(actualizado);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe un formato con ese nombre' });
        }
        console.error('Actualizar formato:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.delete('/:id', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Usuario sin empresa asignada' });

        // La foranea es ON DELETE SET NULL: los productos sobreviven y se
        // quedan sin medidas. Se avisa cuantos, porque hasta que se les asigne
        // otro formato no se pueden cotizar.
        const [[uso]] = await pool.query(
            'SELECT COUNT(*) AS n FROM products WHERE format_id = ?', [req.params.id]);

        const [r] = await pool.query(
            'DELETE FROM product_formats WHERE id = ? AND empresa_id = ?', [req.params.id, empresaId]);
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Formato no encontrado' });

        res.json({
            message: 'Formato eliminado',
            productosSinFormato: Number(uso.n),
        });
    } catch (error) {
        console.error('Borrar formato:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
