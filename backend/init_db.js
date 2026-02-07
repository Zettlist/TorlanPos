import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Initializing Torlan POS Database...\n');

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root_password_123',
    database: process.env.DB_NAME || 'torlan_pos',
    port: parseInt(process.env.DB_PORT) || 3306,
    multipleStatements: true
};

async function initDatabase() {
    let connection;

    try {
        // Connect to MySQL
        console.log('🔌 Connecting to MySQL...');
        connection = await mysql.createConnection(config);
        console.log('✅ Connected to MySQL');

        // Read schema file
        console.log('\n📖 Reading schema file...');
        const schemaPath = join(__dirname, 'database', 'schema_mysql.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        console.log('✅ Schema file loaded');
        console.log(`📄 File size: ${schema.length} characters`);

        // Split statements by semicolon (better parsing)
        const statements = [];
        let currentStatement = '';

        for (const line of schema.split('\n')) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('--')) {
                continue;
            }

            currentStatement += ' ' + trimmed;

            // If line ends with semicolon, we have a complete statement
            if (trimmed.endsWith(';')) {
                statements.push(currentStatement.trim().slice(0, -1)); // Remove trailing semicolon
                currentStatement = '';
            }
        }

        // Add last statement if exists
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }

        console.log(`\n📝 Found ${statements.length} SQL statements to execute...\n`);

        let successCount = 0;
        let skipCount = 0;

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];

            // Extract table name for logging
            const tableMatch = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i);
            const insertMatch = statement.match(/INSERT (?:IGNORE )?INTO (\w+)/i);

            try {
                await connection.execute(statement);

                if (tableMatch) {
                    console.log(`✅ Created table: ${tableMatch[1]}`);
                    successCount++;
                } else if (insertMatch) {
                    console.log(`✅ Inserted data into: ${insertMatch[1]}`);
                    successCount++;
                } else {
                    successCount++;
                }
            } catch (error) {
                if (error.code === 'ER_TABLE_EXISTS_ERR') {
                    if (tableMatch) {
                        console.log(`⏭️  Table already exists: ${tableMatch[1]}`);
                    }
                    skipCount++;
                } else if (error.code === 'ER_DUP_ENTRY') {
                    if (insertMatch) {
                        console.log(`⏭️  Data already exists in: ${insertMatch[1]}`);
                    }
                    skipCount++;
                } else {
                    console.error(`❌ Error executing statement:`, error.message);
                    console.error('Statement:', statement.substring(0, 100) + '...');
                }
            }
        }

        // Verify tables were created
        console.log('\n📋 Verifying database schema...');
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`✅ Found ${tables.length} tables:`);
        tables.forEach(t => {
            const tableName = Object.values(t)[0];
            console.log(`   - ${tableName}`);
        });

        console.log('\n═══════════════════════════════════════════════');
        console.log('✅ DATABASE INITIALIZATION COMPLETE!');
        console.log('═══════════════════════════════════════════════');
        console.log(`   Created/Updated: ${successCount} items`);
        console.log(`   Skipped: ${skipCount} items`);
        console.log(`   Total tables: ${tables.length}`);
        console.log('\n🎉 Ready to start the server!\n');

    } catch (error) {
        console.error('\n❌ Database initialization failed:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Ensure MySQL is running: docker ps');
        console.error('2. Verify database exists: CREATE DATABASE torlan_pos;');
        console.error('3. Check credentials in .env file');
        console.error('4. Check schema_mysql.sql syntax');
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Connection closed');
        }
    }
}

// Run initialization
initDatabase();
