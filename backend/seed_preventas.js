/**
 * seed_preventas.js
 * Inserta pedidos falsos en pre_orders para probar el sistema de preventas.
 * Uso: node seed_preventas.js
 */

import { config } from 'dotenv';
config(); // loads .env BEFORE pool is initialized

import pool from './database/db.js';


const FAKE_ORDERS = [
    { orderNumber: 'PRE-2026-001', clientNumber: 'CLI-001', clientName: 'Ana Torres', clientPhone: '55-1234-5678', title: 'Berserk Deluxe Vol. 3', artist: 'Kentaro Miura', groupName: 'Berserk', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 890, deposit: 200, balance: 690, isPaidInFull: 0 },
    { orderNumber: 'PRE-2026-002', clientNumber: 'CLI-001', clientName: 'Ana Torres', clientPhone: '55-1234-5678', title: 'Chainsaw Man Vol. 5', artist: 'Tatsuki Fujimoto', groupName: 'Chainsaw Man', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 149, deposit: 149, balance: 0, isPaidInFull: 1 },
    { orderNumber: 'PRE-2026-003', clientNumber: 'CLI-002', clientName: 'Carlos Ruiz', clientPhone: '33-9876-5432', title: 'One Piece Vol. 105', artist: 'Eiichiro Oda', groupName: 'One Piece', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 159, deposit: 100, balance: 59, isPaidInFull: 0 },
    { orderNumber: 'PRE-2026-004', clientNumber: 'CLI-002', clientName: 'Carlos Ruiz', clientPhone: '33-9876-5432', title: 'Jujutsu Kaisen Vol. 22', artist: 'Gege Akutami', groupName: 'Jujutsu Kaisen', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 149, deposit: 149, balance: 0, isPaidInFull: 1 },
    { orderNumber: 'PRE-2026-005', clientNumber: 'CLI-003', clientName: 'María López', clientPhone: '81-5555-0001', title: 'Sailor Moon Eternal 2', artist: 'Naoko Takeuchi', groupName: 'Sailor Moon', language: 'Japonés', category: JSON.stringify(['Manga', 'Revista']), totalPrice: 850, deposit: 300, balance: 550, isPaidInFull: 0, internationalOrder: 1, internationalCountry: 'Japón' },
    { orderNumber: 'PRE-2026-006', clientNumber: 'CLI-003', clientName: 'María López', clientPhone: '81-5555-0001', title: 'Evangelion 3.0+1.0 Artbook', artist: 'Hideaki Anno', groupName: 'EVA', language: 'Japonés', category: JSON.stringify(['Revista']), totalPrice: 1200, deposit: 600, balance: 600, isPaidInFull: 0, internationalOrder: 1, internationalCountry: 'Japón' },
    { orderNumber: 'PRE-2026-007', clientNumber: 'CLI-004', clientName: 'Jorge Medina', clientPhone: '55-7777-3333', title: 'Dragon Ball Super Vol. 4', artist: 'Akira Toriyama', groupName: 'Dragon Ball', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 149, deposit: 50, balance: 99, isPaidInFull: 0 },
    { orderNumber: 'PRE-2026-008', clientNumber: 'CLI-004', clientName: 'Jorge Medina', clientPhone: '55-7777-3333', title: 'Attack on Titan Vol. 34 Final', artist: 'Hajime Isayama', groupName: 'AoT', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 159, deposit: 159, balance: 0, isPaidInFull: 1 },
    { orderNumber: 'PRE-2026-009', clientNumber: 'CLI-005', clientName: 'Sofía Ramírez', clientPhone: '55-2222-8888', title: 'No Game No Life 1 (novela)', artist: 'Yuu Kamiya', groupName: 'NGNL', language: 'Español', category: JSON.stringify(['Revista']), totalPrice: 380, deposit: 100, balance: 280, isPaidInFull: 0 },
    { orderNumber: 'PRE-2026-010', clientNumber: 'CLI-005', clientName: 'Sofía Ramírez', clientPhone: '55-2222-8888', title: 'Figura Rem - Re:Zero 1/8', artist: 'Good Smile Company', groupName: 'Re:Zero', language: '', category: JSON.stringify(['Figura']), totalPrice: 3200, deposit: 1000, balance: 2200, isPaidInFull: 0 },
    { orderNumber: 'PRE-2026-011', clientNumber: 'CLI-006', clientName: 'Luis Fernández', clientPhone: '55-4444-2121', title: 'Spy x Family Vol. 10', artist: 'Tatsuya Endo', groupName: 'Spy x Family', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 139, deposit: 139, balance: 0, isPaidInFull: 1 },
    { orderNumber: 'PRE-2026-012', clientNumber: 'CLI-007', clientName: 'Elena Vega', clientPhone: '44-6060-1010', title: 'Oshi no Ko Vol. 1', artist: 'Aka Akasaka', groupName: 'Oshi no Ko', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 149, deposit: 80, balance: 69, isPaidInFull: 0, internationalOrder: 1, internationalCountry: 'España' },
    { orderNumber: 'PRE-2026-013', clientNumber: 'CLI-007', clientName: 'Elena Vega', clientPhone: '44-6060-1010', title: 'Manga Smile Pack (colección)', artist: 'Varios', groupName: '', language: 'Español', category: JSON.stringify(['Manga', 'Revista']), totalPrice: 580, deposit: 200, balance: 380, isPaidInFull: 0, internationalOrder: 1, internationalCountry: 'España' },
    { orderNumber: 'PRE-2026-014', clientNumber: 'CLI-008', clientName: 'Roberto Díaz', clientPhone: '55-3333-7777', title: 'Blue Lock Vol. 15', artist: 'Muneyuki Kaneshiro', groupName: 'Blue Lock', language: 'Español', category: JSON.stringify(['Manga']), totalPrice: 159, deposit: 159, balance: 0, isPaidInFull: 1 },
    { orderNumber: 'PRE-2026-015', clientNumber: 'CLI-009', clientName: 'Valentina Cruz', clientPhone: '55-9999-1234', title: 'Figura Miku Hatsune Concert', artist: 'Max Factory', groupName: 'Vocaloid', language: '', category: JSON.stringify(['Figura']), totalPrice: 2800, deposit: 700, balance: 2100, isPaidInFull: 0 },
];

async function seedPreventas() {
    console.log('🔍 Buscando empresa...');

    let conn;
    try {
        conn = await pool.getConnection();

        // Find empresa
        const [empresas] = await conn.query(`SELECT id, nombre_empresa FROM empresas LIMIT 1`);
        if (empresas.length === 0) {
            console.error('❌ No hay empresas registradas. Inicia sesión y crea una primero.');
            return;
        }

        const empresa = empresas[0];
        console.log(`✅ Empresa: ${empresa.nombre_empresa} (ID: ${empresa.id})`);

        // Create tables if they don't exist
        await conn.query(`
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
                photo_url TEXT NULL,
                total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
                deposit DECIMAL(10,2) NOT NULL DEFAULT 0,
                total_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
                balance DECIMAL(10,2) NOT NULL DEFAULT 0,
                status ENUM('pending','paid','cancelled','delivered') DEFAULT 'pending',
                is_paid_in_full TINYINT(1) DEFAULT 0,
                last_payment_date DATE NULL,
                batch_id INT NULL,
                international_order TINYINT(1) DEFAULT 0,
                international_country VARCHAR(50) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_empresa (empresa_id),
                INDEX idx_batch (batch_id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS pre_order_batches (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                name VARCHAR(255) NULL,
                total_orders INT DEFAULT 0,
                total_value DECIMAL(10,2) DEFAULT 0,
                closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_empresa_batch (empresa_id)
            )
        `);

        // Add missing columns silently
        const alterCols = [
            `ALTER TABLE pre_orders ADD COLUMN IF NOT EXISTS batch_id INT NULL`,
            `ALTER TABLE pre_orders ADD COLUMN IF NOT EXISTS international_order TINYINT(1) DEFAULT 0`,
            `ALTER TABLE pre_orders ADD COLUMN IF NOT EXISTS international_country VARCHAR(50) NULL`,
        ];
        for (const sql of alterCols) {
            try { await conn.query(sql); } catch { }
        }

        let inserted = 0, skipped = 0;

        for (const order of FAKE_ORDERS) {
            // Skip if order_number already exists
            const [existing] = await conn.query(
                `SELECT id FROM pre_orders WHERE empresa_id = ? AND order_number = ?`,
                [empresa.id, order.orderNumber]
            );
            if (existing.length > 0) {
                console.log(`⏩ Saltando duplicado: ${order.orderNumber}`);
                skipped++;
                continue;
            }

            await conn.query(`
                INSERT INTO pre_orders (
                    empresa_id, order_number, client_number, client_name, client_phone,
                    title, artist, group_name, language, category,
                    total_price, deposit, total_paid, balance, status, is_paid_in_full,
                    international_order, international_country, last_payment_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                empresa.id,
                order.orderNumber,
                order.clientNumber,
                order.clientName,
                order.clientPhone,
                order.title,
                order.artist,
                order.groupName,
                order.language,
                order.category,
                order.totalPrice,
                order.deposit,
                order.deposit,       // total_paid = deposit
                order.balance,
                order.isPaidInFull ? 'paid' : 'pending',
                order.isPaidInFull,
                order.internationalOrder || 0,
                order.internationalCountry || null,
            ]);
            console.log(`✅ ${order.orderNumber} — ${order.title} (${order.clientName})`);
            inserted++;
        }

        console.log(`\n🎉 Listo! ${inserted} pedidos insertados, ${skipped} saltados.`);
        console.log(`🌐 Abre https://pos-torlan.web.app y ve a Preventas para probarlos.`);

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

seedPreventas();
