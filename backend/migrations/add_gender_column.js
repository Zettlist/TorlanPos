/**
 * Migration Script: Add Gender Column to Products
 * 
 * This script safely adds the 'gender' column to the products table
 * if it doesn't already exist.
 */

import pool from './database/db.js';

async function migrate() {
    try {
        console.log('🔄 Checking for gender column...');

        // Check if column exists
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'products' 
            AND COLUMN_NAME = 'gender'
        `);

        if (columns.length === 0) {
            console.log('➕ Adding gender column...');
            await pool.query(`
                ALTER TABLE products 
                ADD COLUMN gender VARCHAR(100) DEFAULT NULL
                COMMENT 'Product genre/gender (e.g., Shonen, Seinen, etc.)'
            `);
            console.log('✅ Gender column added successfully!');
        } else {
            console.log('✅ Gender column already exists');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

migrate();
