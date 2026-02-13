import pool from '../database/db.js';

export async function migrate_anticipos() {
    try {
        console.log('🔄 Running Anticipos migration...');

        // Check if tables already exist
        const [tables] = await pool.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'anticipos'
        `);

        if (tables[0].count > 0) {
            console.log('✅ Anticipos tables already exist, skipping migration');
            return;
        }

        // Create anticipos table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS anticipos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                empresa_id INT NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                customer_phone VARCHAR(20),
                total_amount DECIMAL(10,2) NOT NULL,
                paid_amount DECIMAL(10,2) DEFAULT 0,
                status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
                created_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                notes TEXT,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id),
                INDEX idx_anticipos_empresa (empresa_id),
                INDEX idx_anticipos_status (status),
                INDEX idx_anticipos_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create anticipo_items table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS anticipo_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                anticipo_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                subtotal DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (anticipo_id) REFERENCES anticipos(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id),
                INDEX idx_anticipo_items_anticipo (anticipo_id),
                INDEX idx_anticipo_items_product (product_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log('✅ Anticipos migration completed successfully');
    } catch (error) {
        console.error('❌ Anticipos migration failed:', error);
        throw error;
    }
}
