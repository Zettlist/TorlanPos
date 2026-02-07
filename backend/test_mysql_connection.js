// Quick MySQL connection test
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔌 Testing MySQL connection...\n');

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root_password_123',
    database: process.env.DB_NAME || 'torlan_pos',
    port: parseInt(process.env.DB_PORT) || 3306
};

console.log('Config:', {
    host: config.host,
    user: config.user,
    database: config.database,
    port: config.port
});

try {
    const connection = await mysql.createConnection(config);
    console.log('\n✅ MySQL connection successful!');

    // Test query
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Query test passed:', rows);

    // Show tables
    const [tables] = await connection.execute('SHOW TABLES');
    console.log(`\n📋 Existing tables: ${tables.length}`);
    tables.forEach(t => console.log('  -', Object.values(t)[0]));

    await connection.end();
    console.log('\n✅ Connection closed successfully');
} catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Is MySQL running? Check Docker: docker ps');
    console.error('2. Does database exist? Run: CREATE DATABASE torlan_pos;');
    console.error('3. Check credentials in .env file');
    process.exit(1);
}
