
import pool from '../database/db.js';

export async function migrateProductSuppliers(connection) {
    try {
        console.log('🔄 Checking for supplier columns in products...');

        // Check for supplier_id
        const [supplierIdColumn] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'products' 
            AND COLUMN_NAME = 'supplier_id'
        `);

        if (supplierIdColumn.length === 0) {
            console.log('⚠️ Migration needed: Add supplier_id to products');

            // Add supplier_id column
            await connection.query(`
                ALTER TABLE products 
                ADD COLUMN supplier_id INT NULL AFTER language,
                ADD CONSTRAINT fk_product_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
            `);
            console.log('+ Added supplier_id column');
        }

        // Check for supplier_price
        const [supplierPriceColumn] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'products' 
            AND COLUMN_NAME = 'supplier_price'
        `);

        if (supplierPriceColumn.length === 0) {
            console.log('⚠️ Migration needed: Add supplier_price to products');

            // Add supplier_price column
            await connection.query(`
                ALTER TABLE products 
                ADD COLUMN supplier_price DECIMAL(10,2) NULL AFTER supplier_id
            `);
            console.log('+ Added supplier_price column');
        }

        if (supplierIdColumn.length > 0 && supplierPriceColumn.length > 0) {
            console.log('✅ Schema is up to date (supplier columns).');
        } else {
            console.log('✅ Supplier columns migration applied.');
        }

    } catch (error) {
        console.error('❌ Product Supplier Migration failed:', error);
    }
}
