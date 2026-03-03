import pool from './database/db.js';

async function migrateCloudSQL() {
    console.log('🔄 Ejecutando migración en Cloud SQL...');

    try {
        const connection = await pool.getConnection();
        console.log('✅ Conectado a Cloud SQL');

        try {
            // Agregar columna subtotal
            try {
                await connection.execute('ALTER TABLE sales ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00');
                console.log('✓ Columna subtotal agregada');
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') {
                    console.log('✓ Columna subtotal ya existe');
                } else {
                    throw e;
                }
            }

            // Agregar columna discount
            try {
                await connection.execute('ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00');
                console.log('✓ Columna discount agregada');
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') {
                    console.log('✓ Columna discount ya existe');
                } else {
                    throw e;
                }
            }

            // Agregar columna surcharge
            try {
                await connection.execute('ALTER TABLE sales ADD COLUMN surcharge DECIMAL(10,2) DEFAULT 0.00');
                console.log('✓ Columna surcharge agregada');
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') {
                    console.log('✓ Columna surcharge ya existe');
                } else {
                    throw e;
                }
            }

            // Actualizar registros existentes
            const [result] = await connection.execute('UPDATE sales SET subtotal = total WHERE subtotal = 0.00');
            console.log(`✓ ${result.affectedRows} registros actualizados`);

            // Verificar estructura
            const [columns] = await connection.execute("SHOW COLUMNS FROM sales LIKE '%total' OR SHOW COLUMNS FROM sales LIKE 'discount' OR SHOW COLUMNS FROM sales LIKE 'surcharge'");
            console.log('\n✅ Estructura de tabla sales actualizada:');
            columns.forEach(col => console.log(`  - ${col.Field}: ${col.Type}`));

            console.log('\n✅ Migración Cloud SQL completada exitosamente!\n');
        } finally {
            connection.release();
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        console.error('Detalles:', error);
        process.exit(1);
    }
}

migrateCloudSQL();
