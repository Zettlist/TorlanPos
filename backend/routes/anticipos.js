import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and active empresa
router.use(authenticateToken);
router.use(validateEmpresaActive);

// Get all anticipos for the empresa
router.get('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [anticipos] = await pool.query(`
            SELECT a.*, u.username as created_by_name,
                   (SELECT COUNT(*) FROM anticipo_items WHERE anticipo_id = a.id) as items_count
            FROM anticipos a
            LEFT JOIN users u ON a.created_by = u.id
            WHERE a.empresa_id = ?
            ORDER BY a.created_at DESC
        `, [empresaId]);

        res.json(anticipos);
    } catch (error) {
        console.error('Get anticipos error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get anticipo details with items
router.get('/:id', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [anticipos] = await pool.query(`
            SELECT a.*, u.username as created_by_name
            FROM anticipos a
            LEFT JOIN users u ON a.created_by = u.id
            WHERE a.id = ? AND a.empresa_id = ?
        `, [id, empresaId]);

        if (anticipos.length === 0) {
            return res.status(404).json({ error: 'Anticipo no encontrado' });
        }

        const [items] = await pool.query(`
            SELECT ai.*, p.name as product_name, p.image_url, p.sbin_code
            FROM anticipo_items ai
            JOIN products p ON ai.product_id = p.id
            WHERE ai.anticipo_id = ?
        `, [id]);

        res.json({
            ...anticipos[0],
            items
        });
    } catch (error) {
        console.error('Get anticipo details error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create new anticipo (descuenta inventario INMEDIATAMENTE)
router.post('/', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const empresaId = getEmpresaId(req);
        const { customer_name, customer_phone, items, paid_amount = 0, notes = '' } = req.body;

        if (!empresaId) {
            await connection.rollback();
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Validations
        if (!customer_name || !items || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Datos incompletos. Se requiere nombre del cliente y al menos un producto.' });
        }

        // Verify all products exist and have enough stock
        for (const item of items) {
            const [products] = await connection.query(
                'SELECT id, stock, price, sale_price FROM products WHERE id = ? AND empresa_id = ?',
                [item.product_id, empresaId]
            );

            if (products.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: `Producto con ID ${item.product_id} no encontrado` });
            }

            const product = products[0];
            if (product.stock < item.quantity) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Stock insuficiente para el producto (disponible: ${product.stock}, solicitado: ${item.quantity})`
                });
            }
        }

        // Calculate total
        let total = 0;
        const itemsWithPrices = [];

        for (const item of items) {
            const [products] = await connection.query(
                'SELECT price, sale_price FROM products WHERE id = ?',
                [item.product_id]
            );
            const unit_price = Number(products[0].sale_price || products[0].price);
            const subtotal = unit_price * item.quantity;
            total += subtotal;

            itemsWithPrices.push({
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price,
                subtotal
            });
        }

        // Create anticipo
        const [result] = await connection.query(`
            INSERT INTO anticipos (empresa_id, customer_name, customer_phone, total_amount, paid_amount, created_by, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [empresaId, customer_name, customer_phone, total, paid_amount, req.user.id, notes]);

        const anticipoId = result.insertId;

        // Insert items and DECREASE STOCK IMMEDIATELY
        for (const item of itemsWithPrices) {
            await connection.query(`
                INSERT INTO anticipo_items (anticipo_id, product_id, quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?)
            `, [anticipoId, item.product_id, item.quantity, item.unit_price, item.subtotal]);

            // DECREASE STOCK
            await connection.query(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        await connection.commit();

        res.status(201).json({
            message: 'Anticipo creado exitosamente',
            anticipoId,
            total,
            paid_amount
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create anticipo error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        connection.release();
    }
});

// Register payment (abono)
router.post('/:id/payment', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;
        const { amount } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Monto inválido' });
        }

        // Get anticipo
        const [anticipos] = await pool.query(
            'SELECT * FROM anticipos WHERE id = ? AND empresa_id = ?',
            [id, empresaId]
        );

        if (anticipos.length === 0) {
            return res.status(404).json({ error: 'Anticipo no encontrado' });
        }

        const anticipo = anticipos[0];

        if (anticipo.status !== 'pending') {
            return res.status(400).json({ error: 'El anticipo ya fue completado o cancelado' });
        }

        const newPaidAmount = Number(anticipo.paid_amount) + Number(amount);

        if (newPaidAmount > Number(anticipo.total_amount)) {
            return res.status(400).json({ error: 'El monto excede el total del anticipo' });
        }

        await pool.query(
            'UPDATE anticipos SET paid_amount = ? WHERE id = ?',
            [newPaidAmount, id]
        );

        res.json({
            message: 'Pago registrado exitosamente',
            paid_amount: newPaidAmount,
            remaining: Number(anticipo.total_amount) - newPaidAmount
        });
    } catch (error) {
        console.error('Register payment error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Complete anticipo (liquidar) - NO modifica inventario porque ya se descontó
router.post('/:id/complete', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const empresaId = getEmpresaId(req);
        const { id } = req.params;
        const { payment_method = 'cash', card_type, bank, final_payment = 0 } = req.body;

        if (!empresaId) {
            await connection.rollback();
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Get anticipo
        const [anticipos] = await connection.query(
            'SELECT * FROM anticipos WHERE id = ? AND empresa_id = ?',
            [id, empresaId]
        );

        if (anticipos.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Anticipo no encontrado' });
        }

        const anticipo = anticipos[0];

        if (anticipo.status !== 'pending') {
            await connection.rollback();
            return res.status(400).json({ error: 'El anticipo ya fue completado o cancelado' });
        }

        // Update paid amount with final payment
        const totalPaid = Number(anticipo.paid_amount) + Number(final_payment);

        if (totalPaid < Number(anticipo.total_amount)) {
            await connection.rollback();
            return res.status(400).json({
                error: 'El monto pagado no cubre el total del anticipo',
                paid: totalPaid,
                total: Number(anticipo.total_amount),
                remaining: Number(anticipo.total_amount) - totalPaid
            });
        }

        // Get anticipo items
        const [items] = await connection.query(
            'SELECT * FROM anticipo_items WHERE anticipo_id = ?',
            [id]
        );

        // Create sale record (same as regular sales)
        const [saleResult] = await connection.query(`
            INSERT INTO sales (empresa_id, user_id, total, payment_method, card_type, bank, sale_date)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [empresaId, req.user.id, anticipo.total_amount, payment_method, card_type, bank]);

        const saleId = saleResult.insertId;

        // Insert sale items (NO modify stock - already decreased on anticipo creation)
        for (const item of items) {
            await connection.query(`
                INSERT INTO sale_items (sale_id, product_id, quantity, price)
                VALUES (?, ?, ?, ?)
            `, [saleId, item.product_id, item.quantity, item.unit_price]);
        }

        // Mark anticipo as completed
        await connection.query(
            'UPDATE anticipos SET status = ?, paid_amount = ?, completed_at = NOW() WHERE id = ?',
            ['completed', totalPaid, id]
        );

        await connection.commit();

        res.json({
            message: 'Anticipo liquidado exitosamente',
            saleId,
            total: anticipo.total_amount
        });
    } catch (error) {
        await connection.rollback();
        console.error('Complete anticipo error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        connection.release();
    }
});

// DELETE anticipo (devuelve productos al inventario)
router.delete('/:id', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const empresaId = getEmpresaId(req);
        const { id } = req.params;

        if (!empresaId) {
            await connection.rollback();
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Get anticipo
        const [anticipos] = await connection.query(
            'SELECT * FROM anticipos WHERE id = ? AND empresa_id = ?',
            [id, empresaId]
        );

        if (anticipos.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Anticipo no encontrado' });
        }

        const anticipo = anticipos[0];

        if (anticipo.status === 'completed') {
            await connection.rollback();
            return res.status(400).json({ error: 'No se puede eliminar un anticipo ya completado' });
        }

        // Get items to restore stock
        const [items] = await connection.query(
            'SELECT product_id, quantity FROM anticipo_items WHERE anticipo_id = ?',
            [id]
        );

        // RESTORE STOCK for each product
        for (const item of items) {
            await connection.query(
                'UPDATE products SET stock = stock + ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        // Delete anticipo (cascade will delete items)
        await connection.query('DELETE FROM anticipos WHERE id = ?', [id]);

        await connection.commit();

        res.json({
            message: 'Anticipo eliminado y productos devueltos al inventario',
            items_restored: items.length
        });
    } catch (error) {
        await connection.rollback();
        console.error('Delete anticipo error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        connection.release();
    }
});

export default router;
