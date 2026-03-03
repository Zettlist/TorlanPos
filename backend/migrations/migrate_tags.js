import pool from '../database/db.js';

export async function migrateTags(connection) {
    // Check if tags table already exists
    const [tables] = await connection.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tags'`
    );

    if (tables.length > 0) {
        console.log('✅ Tags tables already exist.');
        return;
    }

    console.log('⚠️ Migration needed: Creating tags system tables...');

    // Create tags table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS tags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            empresa_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
            UNIQUE KEY unique_tag_empresa (name, empresa_id),
            INDEX idx_empresa (empresa_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create product_tags junction table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS product_tags (
            product_id INT NOT NULL,
            tag_id INT NOT NULL,
            PRIMARY KEY (product_id, tag_id),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Tags system tables created.');
}
