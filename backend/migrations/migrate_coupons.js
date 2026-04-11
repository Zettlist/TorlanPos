/**
 * Migration: Create coupons table
 */
export async function migrateCoupons(connection) {
    console.log('🔄 Checking for coupons table...');

    const [tables] = await connection.query(`
        SHOW TABLES LIKE 'coupons'
    `);

    if (tables.length === 0) {
        console.log('⚠️ Migration needed: Creating coupons table');

        await connection.query(`
            CREATE TABLE coupons (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT DEFAULT NULL,
                code VARCHAR(50) UNIQUE NOT NULL,
                discount_type ENUM('fixed', 'percentage') NOT NULL,
                discount_value DECIMAL(10, 2) NOT NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                expiration_date DATETIME DEFAULT NULL,
                usage_limit INT DEFAULT NULL,
                usage_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_code (code),
                INDEX idx_empresa_status (empresa_id, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('✅ Coupons table created successfully.');
    } else {
        console.log('✅ Coupons table already exists.');
    }
}
