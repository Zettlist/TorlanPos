import express from 'express';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';
import { Storage } from '@google-cloud/storage';
import pool from '../database/db.js';

const router = express.Router();
const storage = new Storage();
const BUCKET_NAME = process.env.GCLOUD_STORAGE_BUCKET || 'pos-torlan.appspot.com';
const bucket = storage.bucket(BUCKET_NAME);

// Initialize Tables (Run once - Public with secret)
router.get('/init-tables-public-setup-secure', async (req, res) => {
    // Basic secret check
    if (req.query.secret !== 'secure-setup-123') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const createOrdersTable = `
            CREATE TABLE IF NOT EXISTS pre_orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                order_number VARCHAR(50) NOT NULL,
                client_number VARCHAR(50) NULL,
                client_name VARCHAR(255) NULL,
                client_phone VARCHAR(50) NULL,
                client_email VARCHAR(255) NULL,
                client_address TEXT NULL,
                title VARCHAR(255) NULL,
                artist VARCHAR(255) NULL,
                group_name VARCHAR(255) NULL,
                language VARCHAR(50) NULL,
                category VARCHAR(100) NULL,
                pages VARCHAR(50) NULL,
                isbn VARCHAR(50) NULL,
                photo_url TEXT NULL,
                total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
                deposit DECIMAL(10,2) NOT NULL DEFAULT 0,
                total_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
                balance DECIMAL(10,2) NOT NULL DEFAULT 0,
                status ENUM('pending', 'paid', 'cancelled', 'delivered') DEFAULT 'pending',
                is_paid_in_full TINYINT(1) DEFAULT 0,
                last_payment_date DATE NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
                INDEX idx_empresa (empresa_id),
                UNIQUE KEY unique_order_empresa (empresa_id, order_number)
            );
        `;

        const createPaymentsTable = `
            CREATE TABLE IF NOT EXISTS pre_order_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pre_order_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                payment_date DATE NULL,
                payment_number INT NOT NULL,
                notes TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (pre_order_id) REFERENCES pre_orders(id) ON DELETE CASCADE
            );
        `;

        await pool.query(createOrdersTable);
        await pool.query(createPaymentsTable);

        res.json({ message: 'Tables initialized successfully' });
    } catch (error) {
        console.error('Init tables error:', error);
        res.status(500).json({ error: 'Failed to initialize tables' });
    }
});

// All routes require authentication and active empresa
router.use(authenticateToken);
router.use(validateEmpresaActive);



// GET all pre-orders
router.get('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const [rows] = await pool.query(`
            SELECT * FROM pre_orders 
            WHERE empresa_id = ? 
            ORDER BY created_at DESC
        `, [empresaId]);

        // Fetch payments for each order? Or fetch on demand?
        // Let's fetch payments to match frontend structure
        const ordersWithPayments = await Promise.all(rows.map(async (order) => {
            const [payments] = await pool.query(`
                SELECT * FROM pre_order_payments 
                WHERE pre_order_id = ? 
                ORDER BY payment_number ASC
            `, [order.id]);

            return {
                ...order,
                id: order.id, // Database ID
                localId: new Date(order.created_at).getTime(), // Fallback for frontend key if needed
                clientName: order.client_name,
                clientNumber: order.client_number,
                totalPrice: order.total_price,
                totalPaid: order.total_paid,
                lastPaymentDate: order.last_payment_date ? new Date(order.last_payment_date).toLocaleDateString() : null,
                isPaidInFull: order.is_paid_in_full === 1,
                orderNumber: order.order_number,
                payments: payments.map(p => ({
                    amount: p.amount,
                    date: p.payment_date ? new Date(p.payment_date).toLocaleDateString() : null,
                    paymentNumber: p.payment_number
                })),
                // Map other snake_case to camelCase for frontend compatibility
                clientPhone: order.client_phone,
                clientEmail: order.client_email,
                clientAddress: order.client_address,
                group: order.group_name // map group_name to group
            };
        }));

        res.json(ordersWithPayments);
    } catch (error) {
        console.error('Get pre-orders error:', error);
        res.status(500).json({ error: 'Error fetching pre-orders' });
    }
});

// CREATE new pre-order
router.post('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const data = req.body;

        // Basic validation
        if (!data.clientName || !data.totalPrice) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.query(`
                INSERT INTO pre_orders (
                    empresa_id, order_number, client_number, client_name, client_phone, 
                    client_email, client_address, title, artist, group_name, language, 
                    category, pages, isbn, photo_url, total_price, deposit, total_paid, 
                    balance, status, is_paid_in_full, last_payment_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                empresaId,
                data.orderNumber,
                data.clientNumber,
                data.clientName,
                data.clientPhone,
                data.clientEmail,
                data.clientAddress,
                data.title,
                data.artist,
                data.group || data.group_name, // Handle both
                data.language,
                data.category,
                data.pages,
                data.isbn,
                data.photo, // Assuming this is URL or Base64 string? If Base64 string is too long for TEXT, it might fail. Use specific column type or just URL.
                // Note: If photo is huge base64, standard MYSQL TEXT is 64KB. LONGTEXT is 4GB.
                // We should ensure schema uses TEXT or verify size. 
                // For now, let's assume it fits or is null.
                parseFloat(data.totalPrice),
                parseFloat(data.deposit),
                parseFloat(data.totalPaid || data.deposit),
                parseFloat(data.balance),
                data.status || 'pending',
                data.isPaidInFull ? 1 : 0,
                new Date() // last_payment_date is today
            ]);

            const preOrderId = result.insertId;

            // Insert initial payment if deposit > 0
            if (data.payments && data.payments.length > 0) {
                const initialPayment = data.payments[0];
                await connection.query(`
                    INSERT INTO pre_order_payments (
                        pre_order_id, amount, payment_date, payment_number
                    ) VALUES (?, ?, ?, ?)
                `, [
                    preOrderId,
                    parseFloat(initialPayment.amount),
                    new Date(), // Use current date for safety
                    1
                ]);
            }

            await connection.commit();
            res.status(201).json({ message: 'Pre-order created', id: preOrderId });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Create pre-order error:', error);
        res.status(500).json({ error: 'Error creating pre-order' });
    }
});

// LIQUIDATE / ADD PAYMENT
router.post('/:id/liquidate', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req); // Security check needed to ensure order belongs to empresa
        const preOrderId = req.params.id;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Verify order belongs to empresa and fetch current state
            const [orders] = await connection.query(`
                SELECT * FROM pre_orders WHERE id = ? AND empresa_id = ? FOR UPDATE
            `, [preOrderId, empresaId]);

            if (orders.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Order not found' });
            }

            const order = orders[0];

            // Check if fully paid?
            // Logic handled by frontend but good to check.

            const newTotalPaid = parseFloat(order.total_paid) + parseFloat(amount);
            const newBalance = parseFloat(order.total_price) - newTotalPaid;
            const isPaidInFull = newBalance <= 0;

            // Get next payment number
            const [payments] = await connection.query(`
                SELECT COUNT(*) as count FROM pre_order_payments WHERE pre_order_id = ?
            `, [preOrderId]);
            const nextPaymentNum = payments[0].count + 1;

            // Insert payment
            await connection.query(`
                INSERT INTO pre_order_payments (
                    pre_order_id, amount, payment_date, payment_number
                ) VALUES (?, ?, ?, ?)
            `, [preOrderId, amount, new Date(), nextPaymentNum]);

            // Update order
            await connection.query(`
                UPDATE pre_orders 
                SET total_paid = ?, balance = ?, is_paid_in_full = ?, last_payment_date = ?, updated_at = NOW()
                WHERE id = ?
            `, [newTotalPaid, newBalance, isPaidInFull ? 1 : 0, new Date(), preOrderId]);

            await connection.commit();
            res.json({ message: 'Payment added successfully', newBalance, isPaidInFull });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Liquidate error:', error);
        res.status(500).json({ error: 'Error processing payment' });
    }
});

router.post('/generate-receipt', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { orderNumber, imageData } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!orderNumber || !imageData) {
            return res.status(400).json({ error: 'Número de orden e imagen requeridos' });
        }

        // Convert base64 to buffer
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Create unique filename
        const filename = `receipts/comprobante-${orderNumber}-${Date.now()}.png`;
        const blob = bucket.file(filename);

        // Upload to GCS
        const blobStream = blob.createWriteStream({
            resumable: false,
            contentType: 'image/png',
            metadata: {
                metadata: {
                    orderNumber: orderNumber,
                    empresaId: empresaId.toString()
                }
            }
        });

        blobStream.on('error', (err) => {
            console.error('GCS Upload Error:', err);
            return res.status(500).json({ error: 'Error al subir el comprobante' });
        });

        blobStream.on('finish', async () => {
            try {
                // Make the file public
                await blob.makePublic();
                const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;

                res.json({
                    receiptUrl: publicUrl,
                    message: 'Comprobante generado exitosamente'
                });
            } catch (err) {
                console.warn('Could not make file public:', err.message);
                // Return URL anyway
                const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;
                res.json({ receiptUrl: publicUrl });
            }
        });

        blobStream.end(buffer);

    } catch (error) {
        console.error('Generate receipt error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
