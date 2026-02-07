import pool from './database/db.js';
import dotenv from 'dotenv';

dotenv.config();

// Function to print table manually since table output might be weird in some consoles
function printTable(title, data) {
    console.log(`\n--- ${title} ---`);
    if (data.length === 0) {
        console.log('✅ None found.');
    } else {
        console.log('❌ Found duplicates:');
        console.table(data);
    }
}

async function checkDuplicates() {
    try {
        console.log('Connected to database via app pool.');

        // 1. Check ISBN Duplicates
        const [isbnDups] = await pool.query(`
            SELECT empresa_id, isbn, COUNT(*) as count, GROUP_CONCAT(name) as products
            FROM products 
            WHERE isbn IS NOT NULL AND isbn != '' 
            GROUP BY empresa_id, isbn 
            HAVING count > 1
        `);
        printTable('Duplicate ISBNs', isbnDups);

        // 2. Check SBIN Code Duplicates
        const [sbinDups] = await pool.query(`
            SELECT empresa_id, sbin_code, COUNT(*) as count, GROUP_CONCAT(name) as products
            FROM products 
            WHERE sbin_code IS NOT NULL AND sbin_code != '' 
            GROUP BY empresa_id, sbin_code 
            HAVING count > 1
        `);
        printTable('Duplicate SBIN Codes', sbinDups);

        // 3. Check Barcode Duplicates
        const [barcodeDups] = await pool.query(`
            SELECT empresa_id, barcode, COUNT(*) as count, GROUP_CONCAT(name) as products
            FROM products 
            WHERE barcode IS NOT NULL AND barcode != '' 
            GROUP BY empresa_id, barcode 
            HAVING count > 1
        `);
        printTable('Duplicate Barcodes', barcodeDups);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Pool ending isn't strictly necessary for a script that just exits, 
        // but good practice if we want to shut down cleanly.
        // However, mysql2 pool.end() returns a promise.
        await pool.end();
    }
}

checkDuplicates();
