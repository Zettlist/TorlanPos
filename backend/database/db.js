import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Database connection configuration
const dbConfig = {
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'torlan_pos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
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

// ─── TLS ────────────────────────────────────────────────────────────────────
//
// Aiven rechaza cualquier conexion sin cifrar. Antes esto no hacia falta
// porque Cloud SQL se alcanzaba por socket Unix dentro de App Engine, donde el
// trafico no sale de la maquina; una base publica es otra cosa: sin TLS las
// credenciales y todos los datos de clientes viajan en claro por internet.
//
// DB_SSL_CA apunta al ca.pem que descarga el panel de Aiven. Verificar contra
// esa CA es lo que distingue "cifrado" de "cifrado contra quien sea": sin
// comprobar el certificado, un intermediario puede presentarse como la base.
//
// DB_SSL=1 sin CA usa la verificacion por defecto de Node contra las CA
// publicas del sistema. Sirve para un proveedor con certificado publico, no
// para Aiven, que firma con CA propia.
const rutaCA = process.env.DB_SSL_CA;
if (rutaCA) {
  dbConfig.ssl = {
    ca: readFileSync(rutaCA, 'utf8'),
    rejectUnauthorized: true,
  };
} else if (process.env.DB_SSL === '1') {
  dbConfig.ssl = { rejectUnauthorized: true };
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
