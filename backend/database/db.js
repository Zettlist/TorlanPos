import mysql from 'mysql2/promise';

// Database connection configuration
const dbConfig = {
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'torlan_pos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Determine if we're connecting via Unix socket (App Engine) or TCP (local/development)
const dbHost = process.env.DB_HOST || 'localhost';
if (dbHost.startsWith('/cloudsql/')) {
  // Unix socket connection for Cloud SQL in App Engine
  dbConfig.socketPath = dbHost;
} else {
  // TCP connection for local development or direct IP
  dbConfig.host = dbHost;
  dbConfig.port = parseInt(process.env.DB_PORT) || 3306;
}

// Create connection pool
const pool = mysql.createPool(dbConfig);

export default pool;

// Test database connection
export async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    throw error;
  }
}
