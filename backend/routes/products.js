import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';
import { requireInventoryWrite } from '../middleware/inventoryAccess.js';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import multer from 'multer';
import { uploadFileToGCS } from '../utils/storage.js';
// import ptp from 'pdf-to-printer'; // Removed for client-side printing support
import { fileURLToPath } from 'url';
import { generateEAN13, getProductSequence } from '../utils/barcodeGenerator.js';

// Configure Multer (Memory Storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// const { print } = ptp;

const router = express.Router();

// All routes require authentication and active empresa
router.use(authenticateToken);
router.use(validateEmpresaActive);

// Generate unique internal SKU/ISBN
router.get('/generate-sku', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Generate unique 13-digit numeric code
        let sku = '';
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 5) {
            let randomDigits = '';
            for (let i = 0; i < 12; i++) {
                randomDigits += Math.floor(Math.random() * 10).toString();
            }
            sku = '2' + randomDigits; // Mock EAN-13 starting with 2 (In-store use)

            // Check existence
            const [existing] = await pool.query(
                'SELECT id FROM products WHERE empresa_id = ? AND (isbn = ? OR sbin_code = ?)',
                [empresaId, sku, sku]
            );

            if (existing.length === 0) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            return res.status(409).json({ error: 'No se pudo generar un código único. Intente de nuevo.' });
        }

        res.json({ sku });
    } catch (error) {
        console.error('Generate SKU error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get distinct categories and publishers for autocomplete
router.get('/suggestions', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [categories] = await pool.query(
            'SELECT DISTINCT category FROM products WHERE empresa_id = ? AND category IS NOT NULL AND category != "" ORDER BY category',
            [empresaId]
        );

        const [publishers] = await pool.query(
            'SELECT DISTINCT publisher FROM products WHERE empresa_id = ? AND publisher IS NOT NULL AND publisher != "" ORDER BY publisher',
            [empresaId]
        );
        const [genders] = await pool.query(
            'SELECT DISTINCT gender FROM products WHERE empresa_id = ? AND gender IS NOT NULL AND gender != "" ORDER BY gender',
            [empresaId]
        );

        res.json({
            categories: categories.map(c => c.category),
            publishers: publishers.map(p => p.publisher),
            genders: genders.map(g => g.gender)
        });
    } catch (error) {
        console.error('Get suggestions error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get all products (filtered by empresa_id)
router.get('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // STRICT ACCESS CONTROL: Employees cannot see the full product list (Management)
        const [userRows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
        const user = userRows[0];

        if (user.role !== 'empresa_admin' && user.role !== 'global_admin') {
            return res.status(403).json({
                error: 'Acceso denegado. No tiene permisos para ver el inventario completo.',
                code: 'INVENTORY_ACCESS_DENIED'
            });
        }

        const [products] = await pool.query(
            'SELECT * FROM products WHERE empresa_id = ? ORDER BY name',
            [empresaId]
        );

        res.json(products);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Search products by name or SBIN code (optimized for barcode scanners)
router.get('/search', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { q, exact } = req.query;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!q || q.length < 1) {
            const [products] = await pool.query(
                'SELECT * FROM products WHERE empresa_id = ? ORDER BY name LIMIT 50',
                [empresaId]
            );
            return res.json(products);
        }

        // Exact match mode for barcode scanner (Enter key pressed)
        if (exact === 'true') {
            const [productRows] = await pool.query(
                'SELECT * FROM products WHERE empresa_id = ? AND (name = ? OR sbin_code = ? OR barcode = ? OR isbn = ?) LIMIT 1',
                [empresaId, q, q, q, q]
            );

            if (productRows.length > 0) {
                return res.json({ exactMatch: true, product: productRows[0] });
            }
            return res.json({ exactMatch: false, product: null });
        }

        const searchTerm = `%${q}%`;
        const [products] = await pool.query(`
            SELECT * FROM products 
            WHERE empresa_id = ? AND (name LIKE ? OR sbin_code LIKE ? OR barcode LIKE ? OR isbn LIKE ?)
            ORDER BY 
                CASE 
                    WHEN sbin_code = ? THEN 1
                    WHEN barcode = ? THEN 2
                    WHEN sbin_code LIKE ? THEN 3
                    ELSE 4
                END,
                name
            LIMIT 50
        `, [empresaId, searchTerm, searchTerm, searchTerm, searchTerm, q, q, `${q}%`]);

        res.json(products);
    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Check if SBIN code is duplicate (within same empresa)
router.get('/check-sbin', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { sbin_code, exclude_id } = req.query;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!sbin_code || sbin_code.trim() === '') {
            return res.json({ isDuplicate: false });
        }

        let query = 'SELECT id, name FROM products WHERE empresa_id = ? AND sbin_code = ?';
        let params = [empresaId, sbin_code];

        if (exclude_id) {
            query += ' AND id != ?';
            params.push(exclude_id);
        }

        const [existing] = await pool.query(query, params);

        res.json({
            isDuplicate: existing.length > 0,
            existingProduct: existing[0] || null
        });
    } catch (error) {
        console.error('Check SBIN error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create product - PROTECTED: requires admin role
router.post('/', requireInventoryWrite, upload.single('image'), async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { name, cost_price, sale_price, stock, category, gender, barcode, sbin_code, isbn, extras, publication_date, publisher, page_count, dimensions, weight, page_color, language, supplier_id, supplier_price } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Validate required fields
        if (!name || cost_price === undefined || sale_price === undefined) {
            return res.status(400).json({ error: 'Nombre, precio de costo y precio de venta son requeridos' });
        }

        // Validate Image (Required)
        if (!req.file) {
            return res.status(400).json({ error: 'La imagen del producto es obligatoria' });
        }

        // Validate price values
        if (parseFloat(cost_price) < 0 || parseFloat(sale_price) < 0) {
            return res.status(400).json({ error: 'Los precios deben ser positivos' });
        }

        // Check product limit for empresa
        const [empresaRows] = await pool.query('SELECT max_productos FROM empresas WHERE id = ?', [empresaId]);
        const empresa = empresaRows[0];
        const [productCountRows] = await pool.query('SELECT COUNT(*) as count FROM products WHERE empresa_id = ?', [empresaId]);
        const productCount = productCountRows[0];

        if (productCount.count >= empresa.max_productos) {
            return res.status(400).json({
                error: `Límite de productos alcanzado (${empresa.max_productos}). Actualice su plan para más productos.`
            });
        }

        // Check for duplicate SBIN code (within same empresa)
        // Check for duplicate codes (sbin, isbn, barcode)
        if (sbin_code) {
            const [existing] = await pool.query('SELECT id FROM products WHERE empresa_id = ? AND sbin_code = ?', [empresaId, sbin_code]);
            if (existing.length > 0) return res.status(400).json({ error: 'El código SBIN ya existe en otro producto' });
        }
        if (isbn) {
            const [existing] = await pool.query('SELECT id FROM products WHERE empresa_id = ? AND isbn = ?', [empresaId, isbn]);
            if (existing.length > 0) return res.status(400).json({ error: 'El ISBN ya existe en otro producto' });
        }
        if (barcode) {
            const [existing] = await pool.query('SELECT id FROM products WHERE empresa_id = ? AND barcode = ?', [empresaId, barcode]);
            if (existing.length > 0) return res.status(400).json({ error: 'El código de barras ya existe en otro producto' });
        }

        // Upload Image to GCS
        let imageUrl = null;
        if (req.file) {
            try {
                imageUrl = await uploadFileToGCS(req.file);
            } catch (uploadError) {
                return res.status(500).json({ error: 'Error al subir la imagen' });
            }
        }

        // Get or create category_id
        let categoryId = null;
        if (category) {
            const [catRows] = await pool.execute(
                'INSERT INTO categories (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
                [category]
            );
            categoryId = catRows.insertId;
        }

        // Get or create publisher_id
        let publisherId = null;
        if (publisher) {
            const [pubRows] = await pool.execute(
                'INSERT INTO publishers (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
                [publisher]
            );
            publisherId = pubRows.insertId;
        }

        // Auto-generate EAN-13 barcode if not provided and category exists
        let finalBarcode = barcode;
        if (!barcode && categoryId) {
            try {
                const sequence = await getProductSequence(pool, empresaId, categoryId, publisherId);
                finalBarcode = generateEAN13(empresaId, categoryId, publisherId, sequence);
                console.log(`✓ Generated EAN-13 barcode: ${finalBarcode} (E:${empresaId} C:${categoryId} P:${publisherId || 0} S:${sequence})`);
            } catch (barcodeError) {
                console.warn('Barcode generation failed:', barcodeError.message);
                // Continue without barcode if generation fails
            }
        }

        const [result] = await pool.query(`
            INSERT INTO products (
                empresa_id, name, price, cost_price, sale_price, stock, category, category_id, barcode, sbin_code, isbn, 
                extras, publication_date, publisher, publisher_id, page_count, dimensions, 
                weight, page_color, language, supplier_id, supplier_price, image_url, gender
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            empresaId, name, sale_price, cost_price, sale_price, stock || 0, category || null, categoryId,
            finalBarcode || null, sbin_code || null, isbn || null, extras || null,
            publication_date || null, publisher || null, publisherId, page_count || null, dimensions || null,
            weight || null, page_color || null, language || null, supplier_id || null, supplier_price || null, imageUrl, gender || null
        ]);

        res.json({
            message: 'Producto creado correctamente',
            id: result.insertId,
            barcode: finalBarcode,
            image_url: imageUrl
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Update product - PROTECTED: requires admin role
router.put('/:id', requireInventoryWrite, upload.single('image'), async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;
        const { name, cost_price, sale_price, stock, category, gender, barcode, sbin_code, isbn, extras, publication_date, publisher, page_count, dimensions, weight, page_color, language, supplier_id, supplier_price } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Verify product belongs to user's empresa
        const [productRows] = await pool.query('SELECT id, image_url FROM products WHERE id = ? AND empresa_id = ?', [id, empresaId]);
        if (productRows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        let imageUrl = productRows[0].image_url;

        // Check JSON content type too, sometimes image isn't updated
        // Upload New Image if present
        if (req.file) {
            try {
                imageUrl = await uploadFileToGCS(req.file);
            } catch (uploadError) {
                return res.status(500).json({ error: 'Error al subir la imagen' });
            }
        }

        // Check for duplicate SBIN code (within same empresa, excluding current product)
        // Check for duplicate codes (sbin, isbn, barcode) - excluding current product
        if (sbin_code) {
            const [existing] = await pool.query('SELECT id FROM products WHERE empresa_id = ? AND sbin_code = ? AND id != ?', [empresaId, sbin_code, id]);
            if (existing.length > 0) return res.status(400).json({ error: 'El código SBIN ya existe en otro producto' });
        }
        if (isbn) {
            const [existing] = await pool.query('SELECT id FROM products WHERE empresa_id = ? AND isbn = ? AND id != ?', [empresaId, isbn, id]);
            if (existing.length > 0) return res.status(400).json({ error: 'El ISBN ya existe en otro producto' });
        }
        if (barcode) {
            const [existing] = await pool.query('SELECT id FROM products WHERE empresa_id = ? AND barcode = ? AND id != ?', [empresaId, barcode, id]);
            if (existing.length > 0) return res.status(400).json({ error: 'El código de barras ya existe en otro producto' });
        }

        await pool.query(`
            UPDATE products SET 
                name = ?, cost_price = ?, sale_price = ?, stock = ?, category = ?, gender = ?, barcode = ?, 
                sbin_code = ?, isbn = ?, extras = ?, publication_date = ?, 
                publisher = ?, page_count = ?, dimensions = ?, weight = ?, page_color = ?, language = ?,
                supplier_id = ?, supplier_price = ?, image_url = ?
            WHERE id = ? AND empresa_id = ?
        `, [
            name, cost_price, sale_price, stock || 0, category || null, gender || null, barcode || null,
            sbin_code || null, isbn || null, extras || null,
            publication_date || null, publisher || null, page_count || null, dimensions || null,
            weight || null, page_color || null, language || null,
            supplier_id || null, supplier_price || null, imageUrl, id, empresaId
        ]);

        res.json({ message: 'Producto actualizado correctamente', image_url: imageUrl });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete product - PROTECTED: requires admin role
router.delete('/:id', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Verify product belongs to user's empresa
        const [productRows] = await pool.query('SELECT id, name FROM products WHERE id = ? AND empresa_id = ?', [id, empresaId]);
        const product = productRows[0];

        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // Check for force delete
        const force = req.query.force === 'true';

        if (force) {
            // Force Delete: Remove related sale items first
            console.log(`Force deleting product ${id} and its history...`);

            // 1. Get sales that contain this product
            const [relatedSales] = await pool.query(`
                SELECT DISTINCT sale_id FROM sale_items WHERE product_id = ?
            `, [id]);

            // 2. Delete items
            await pool.query('DELETE FROM sale_items WHERE product_id = ?', [id]);

            // 3. Cleanup empty sales (orphaned headers)
            for (const sale of relatedSales) {
                const [remainingItems] = await pool.query('SELECT COUNT(*) as count FROM sale_items WHERE sale_id = ?', [sale.sale_id]);
                if (remainingItems[0].count === 0) {
                    await pool.query('DELETE FROM sales WHERE id = ?', [sale.sale_id]);
                } else {
                    // Start Recalculate Total for split sales
                    const [newTotal] = await pool.query('SELECT SUM(price * quantity) as total FROM sale_items WHERE sale_id = ?', [sale.sale_id]);
                    await pool.query('UPDATE sales SET total = ? WHERE id = ?', [newTotal[0].total || 0, sale.sale_id]);
                }
            }
        }

        await pool.query('DELETE FROM products WHERE id = ? AND empresa_id = ?', [id, empresaId]);
        res.json({ message: `Producto "${product.name}" eliminado correctamente` });
    } catch (error) {
        console.error('Delete product error:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                error: 'No se puede eliminar este producto porque tiene ventas o registros asociados. Considere desactivarlo o cambiar el stock a 0.'
            });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Bulk create products (for setup wizard) - PROTECTED: requires admin role
router.post('/bulk', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { products } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Se requiere un array de productos' });
        }

        // Check product limit
        const [empresaRows] = await pool.query('SELECT max_productos FROM empresas WHERE id = ?', [empresaId]);
        const empresa = empresaRows[0];
        const [productCountRows] = await pool.query('SELECT COUNT(*) as count FROM products WHERE empresa_id = ?', [empresaId]);
        const productCount = productCountRows[0];

        if (productCount.count + products.length > empresa.max_productos) {
            return res.status(400).json({
                error: `Límite de productos alcanzado. Puede añadir máximo ${empresa.max_productos - productCount.count} productos más.`
            });
        }

        for (const product of products) {
            await pool.query(
                'INSERT INTO products (empresa_id, name, price, stock, category, sbin_code, isbn, extras, publication_date, publisher, page_count, dimensions, weight, page_color, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [empresaId, product.name, product.price, product.stock || 0, product.category || null, product.sbin_code || null, product.isbn || null, product.extras || null, product.publication_date || null, product.publisher || null, product.page_count || null, product.dimensions || null, product.weight || null, product.page_color || null, product.language || null]
            );
        }

        res.json({ message: `${products.length} productos creados correctamente` });
    } catch (error) {
        console.error('Bulk create products error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Print label directly to printer
const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.post('/print-label', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { product } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!product) {
            return res.status(400).json({ error: 'Datos del producto requeridos' });
        }

        // Verify product belongs to user's empresa
        const [dbProductRows] = await pool.query('SELECT id FROM products WHERE id = ? AND empresa_id = ?', [product.id, empresaId]);
        if (dbProductRows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const codeToPrint = product.isbn || product.sbin_code || product.barcode;
        if (!codeToPrint) {
            return res.status(400).json({ error: 'El producto no tiene código para imprimir' });
        }

        // Stream PDF directly to client
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="label.pdf"');

        // Create PDF (50mm x 25mm = ~141.7pt x ~70.9pt)
        const doc = new PDFDocument({
            size: [141.73, 70.87],
            margin: 0,
            autoFirstPage: true
        });

        doc.pipe(res);

        // Generate barcode buffer
        const png = await bwipjs.toBuffer({
            bcid: 'code128',
            text: codeToPrint,
            scale: 2,
            height: 10,
            includetext: true,
            textxalign: 'center',
        });

        // Add Product Name (centered, small font)
        doc.font('Helvetica-Bold').fontSize(8);

        // Truncate name if too long
        let name = product.name;
        if (name.length > 22) name = name.substring(0, 22) + '...';

        doc.text(name, 0, 5, {
            align: 'center',
            width: 141.73
        });

        // Add Barcode Image
        doc.image(png, 23, 18, {
            fit: [95, 35],
            align: 'center',
            valign: 'center'
        });

        // Add Price
        const priceToPrint = Number(product.sale_price || product.price || 0);
        doc.fontSize(8).text(`$${priceToPrint.toFixed(2)}`, 0, 58, {
            align: 'center',
            width: 141.73
        });

        doc.end();

    } catch (error) {
        console.error('Print label error:', error);
        // Only send JSON if headers haven't been sent yet
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

export default router;
