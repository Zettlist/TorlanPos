import pool from './database/db.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
    console.log('🔄 Ejecutando migración: agregar columnas discount y surcharge...');

    try {
        const connection = await pool.getConnection();

        try {
            // Agregar columna subtotal (ignorar si ya existe)
            try {
                await connection.execute(`
                    ALTER TABLE sales ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00
                `);
                console.log('✓ Columna subtotal agregada');
            } catch (e) {
                console.log('✓ Columna subtotal ya existe');
            }

            // Agregar columna discount (ignorar si ya existe)
            try {
                await connection.execute(`
                    ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00
                `);
                console.log('✓ Columna discount agregada');
            } catch (e) {
                console.log('✓ Columna discount ya existe');
            }

            // Agregar columna surcharge (ignorar si ya existe)
            try {
                await connection.execute(`
                    ALTER TABLE sales ADD COLUMN surcharge DECIMAL(10,2) DEFAULT 0.00
                `);
                console.log('✓ Columna surcharge agregada');
            } catch (e) {
                console.log('✓ Columna surcharge ya existe');
            }

            // Actualizar registros existentes
            const [result] = await connection.execute(`
                UPDATE sales SET subtotal = total WHERE subtotal = 0.00
            `);
            console.log(`✓ ${result.affectedRows} registros actualizados`);

            console.log('\n✅ Migración completada exitosamente\n');
        } finally {
            connection.release();
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    }
}

runMigration();
