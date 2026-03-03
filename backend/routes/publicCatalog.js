import express from 'express';
import pool from '../database/db.js';

const router = express.Router();

// =============================================
// PUBLIC CATALOG API
// No authentication required — for external consumers (e.g., Bisonte Manga)
// All endpoints require empresa_id query parameter
// =============================================

// GET /api/public/catalog/tags?empresa_id=X
// Returns all available tags for filtering
router.get('/tags', async (req, res) => {
    try {
        const { empresa_id } = req.query;

        if (!empresa_id) {
            return res.status(400).json({ error: 'empresa_id is required' });
        }

        // Verify empresa exists and is active
        const [empresa] = await pool.query(
            'SELECT id, nombre FROM empresas WHERE id = ? AND estado = ?',
            [empresa_id, 'activa']
        );

        if (empresa.length === 0) {
            return res.status(404).json({ error: 'Empresa not found or inactive' });
        }

        const [tags] = await pool.query(
            'SELECT t.id, t.name, COUNT(pt.product_id) as product_count FROM tags t LEFT JOIN product_tags pt ON t.id = pt.tag_id WHERE t.empresa_id = ? GROUP BY t.id ORDER BY t.name',
            [empresa_id]
        );

        res.json({
            empresa: empresa[0].nombre,
            tags: tags
        });
    } catch (error) {
        console.error('Public catalog tags error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/public/catalog/products?empresa_id=X&tags=Manga,BL&page=1&limit=20
// Returns products with their tags, optionally filtered by tags
router.get('/products', async (req, res) => {
    try {
        const { empresa_id, tags, page = 1, limit = 20, search } = req.query;

        if (!empresa_id) {
            return res.status(400).json({ error: 'empresa_id is required' });
        }

        // Verify empresa exists and is active
        const [empresa] = await pool.query(
            'SELECT id FROM empresas WHERE id = ? AND estado = ?',
            [empresa_id, 'activa']
        );

        if (empresa.length === 0) {
            return res.status(404).json({ error: 'Empresa not found or inactive' });
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let whereClause = 'WHERE p.empresa_id = ?';
        let params = [empresa_id];

        // Filter by tags if provided
        if (tags) {
            const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
            if (tagList.length > 0) {
                const tagPlaceholders = tagList.map(() => '?').join(',');
                whereClause += ` AND p.id IN (
                    SELECT pt.product_id FROM product_tags pt
                    JOIN tags t ON pt.tag_id = t.id
                    WHERE t.empresa_id = ? AND t.name IN (${tagPlaceholders})
                )`;
                params.push(empresa_id, ...tagList);
            }
        }

        // Search by name
        if (search) {
            whereClause += ' AND p.name LIKE ?';
            params.push(`%${search}%`);
        }

        // Only show products with stock > 0
        whereClause += ' AND p.stock > 0';

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(DISTINCT p.id) as total FROM products p ${whereClause}`,
            params
        );
        const total = countResult[0].total;

        // Get products with tags
        const [products] = await pool.query(`
            SELECT p.id, p.name, p.sale_price, p.price, p.stock, p.category, p.gender,
                   p.publisher, p.sbin_code, p.isbn, p.barcode, p.image_url,
                   p.publication_date, p.page_count, p.dimensions, p.weight,
                   p.page_color, p.language, p.extras, p.created_at, p.is_adult,
                   p.artist, p.group_name,
                   GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') as tags
            FROM products p
            LEFT JOIN product_tags pt ON p.id = pt.product_id
            LEFT JOIN tags t ON pt.tag_id = t.id
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limitNum, offset]);

        // Parse tags
        const productsWithTags = products.map(p => ({
            ...p,
            price: Number(p.sale_price || p.price || 0),
            tags: p.tags ? p.tags.split(',') : []
        }));

        res.json({
            products: productsWithTags,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Public catalog products error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
