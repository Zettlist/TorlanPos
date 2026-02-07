import pool from './database/db.js';

async function createTable() {
    try {
        console.log('🛠 Creating global_changes_log table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_changes_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NULL,
                event_type VARCHAR(50) NOT NULL,
                description TEXT NULL,
                metadata TEXT NULL,
                user_id INT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_empresa (empresa_id),
                INDEX idx_type (event_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Table created successfully.');
    } catch (error) {
        console.error('❌ Error creating table:', error);
    } finally {
        await pool.end();
    }
}

createTable();
