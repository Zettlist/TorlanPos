import pool from './database/db.js';

async function checkDatabaseSize() {
    try {
        console.log('🔍 Consultando tamaño de la base de datos...\n');

        const [rows] = await pool.query(`
            SELECT 
                table_schema AS "Base de Datos", 
                ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS "Tamaño (MB)" 
            FROM information_schema.TABLES 
            GROUP BY table_schema
        `);

        console.log('📊 Tamaño de las bases de datos:\n');
        console.table(rows);

        // Específicamente torlan_pos
        const torlanDB = rows.find(r => r['Base de Datos'] === 'torlan_pos');
        if (torlanDB) {
            console.log(`\n💾 Base de datos "torlan_pos": ${torlanDB['Tamaño (MB)']} MB`);
        }

        // También mostrar el tamaño por tabla
        console.log('\n📋 Tamaño por tabla en torlan_pos:\n');
        const [tables] = await pool.query(`
            SELECT 
                table_name AS "Tabla",
                ROUND((data_length + index_length) / 1024 / 1024, 2) AS "Tamaño (MB)",
                table_rows AS "Filas"
            FROM information_schema.TABLES
            WHERE table_schema = 'torlan_pos'
            ORDER BY (data_length + index_length) DESC
        `);

        console.table(tables);

        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkDatabaseSize();
