-- =============================================
-- TORLAN POS - Multi-Tenant SaaS Schema
-- =============================================

-- Tabla Maestra: Empresas (Clientes SaaS)
CREATE TABLE IF NOT EXISTS empresas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_empresa TEXT NOT NULL,
    plan_contratado TEXT NOT NULL DEFAULT 'Basico' CHECK(plan_contratado IN ('Prueba', 'Basico', 'Premium', 'Empresarial')),
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK(estado IN ('Activo', 'Suspendido', 'Baja')),
    max_usuarios INTEGER DEFAULT 5,
    max_productos INTEGER DEFAULT 100,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_suspension DATETIME,
    notas TEXT
);

-- Users table (updated for multi-tenancy)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    empresa_id INTEGER,
    role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('global_admin', 'empresa_admin', 'employee')),
    is_admin INTEGER DEFAULT 0,
    first_login INTEGER DEFAULT 1,
    has_setup_complete INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL
);

-- Features table (available feature flags - global, not per empresa)
CREATE TABLE IF NOT EXISTS features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'cube'
);

-- User features junction table
CREATE TABLE IF NOT EXISTS user_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    is_enabled INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE,
    UNIQUE(user_id, feature_id)
);

-- Products table (with empresa_id for multi-tenancy)
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    category TEXT,
    barcode TEXT,
    sbin_code TEXT,
    isbn TEXT,
    extras TEXT,
    publication_date TEXT,
    publisher TEXT,
    page_count INTEGER,
    dimensions TEXT,
    weight REAL,
    page_color TEXT,
    language TEXT,
    damian INTEGER DEFAULT 0,
    bernat INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- Sales table (with empresa_id for multi-tenancy)
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Sales goals table (with empresa_id for multi-tenancy)
CREATE TABLE IF NOT EXISTS sales_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('weekly', 'monthly')),
    target REAL NOT NULL,
    current REAL DEFAULT 0,
    period_start DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Insert default features
INSERT OR IGNORE INTO features (name, display_name, description, icon) VALUES
    ('sales_statistics', 'Estadísticas de Ventas', 'Ver estadísticas avanzadas de ventas', 'chart-bar'),
    ('competitor_prices', 'Precios de Competencia', 'Registrar y comparar precios de la competencia', 'scale'),
    ('advances', 'Anticipos', 'Gestionar anticipos de clientes', 'banknotes'),
    ('suppliers', 'Proveedores', 'Gestión de proveedores', 'truck');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_empresa ON products(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sales_empresa ON sales(empresa_id);
CREATE INDEX IF NOT EXISTS idx_users_empresa ON users(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sales_goals_empresa ON sales_goals(empresa_id);

-- =============================================
-- CASH CONTROL & BUSINESS SETTINGS
-- =============================================

-- Business settings for sales goals and configurations
CREATE TABLE IF NOT EXISTS business_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    UNIQUE(empresa_id, setting_key)
);

-- Cash sessions for register management (blind cut)
CREATE TABLE IF NOT EXISTS cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    opening_amount REAL NOT NULL DEFAULT 0,
    expected_amount REAL,
    declared_amount REAL,
    difference REAL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    notes TEXT,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for cash sessions
CREATE INDEX IF NOT EXISTS idx_cash_sessions_empresa ON cash_sessions(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_user ON cash_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);

-- =============================================
-- GLOBAL AUDIT TRAIL
-- =============================================

-- Centralized log for all critical events across empresas
CREATE TABLE IF NOT EXISTS global_changes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER,
    event_type TEXT NOT NULL,
    description TEXT,
    user_id INTEGER,
    metadata TEXT, -- JSON for additional data (e.g., credentials during test phase)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_global_log_empresa ON global_changes_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_global_log_event ON global_changes_log(event_type);
CREATE INDEX IF NOT EXISTS idx_global_log_created ON global_changes_log(created_at);


