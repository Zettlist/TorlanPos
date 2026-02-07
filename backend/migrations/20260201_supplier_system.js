
import mysql from 'mysql2/promise';

const dbConfig = {
    host: '127.0.0.1',
    port: 3308,
    user: 'torlan_user',
    password: 'rUJJkcUfzloxoxzQVPH3MKK1',
    database: 'torlan_pos',
};

async function migrate() {
    console.log('Starting migration: Supplier System...');
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();

    try {
        // 1. Create suppliers table
        console.log('Creating suppliers table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                contact_info TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 2. Add columns to products
        console.log('Adding supplier columns to products...');
        const [columns] = await connection.query('SHOW COLUMNS FROM products');
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('supplier_id')) {
            await connection.query('ALTER TABLE products ADD COLUMN supplier_id INT NULL');
            await connection.query('ALTER TABLE products ADD CONSTRAINT fk_product_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL');
        }

        if (!columnNames.includes('supplier_price')) {
            await connection.query('ALTER TABLE products ADD COLUMN supplier_price DECIMAL(10,2) NULL');
        }

        // 3. Add column to sale_items
        console.log('Adding supplier_price_at_sale to sale_items...');
        const [saleItemColumns] = await connection.query('SHOW COLUMNS FROM sale_items');
        const saleItemColumnNames = saleItemColumns.map(c => c.Field);

        if (!saleItemColumnNames.includes('supplier_price_at_sale')) {
            await connection.query('ALTER TABLE sale_items ADD COLUMN supplier_price_at_sale DECIMAL(10,2) NULL');
        }

        console.log('✅ Migration complete.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        connection.release();
        await pool.end();
    }
}

migrate();
