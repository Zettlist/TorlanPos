const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  try {
    await conn.execute('ALTER TABLE products ADD COLUMN sinopsis TEXT NULL AFTER artist');
    console.log('✅ Columna sinopsis agregada a products');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('⏭️  sinopsis ya existe, skip');
    } else {
      console.error('❌', e.message);
    }
  }
  await conn.end();
})();
