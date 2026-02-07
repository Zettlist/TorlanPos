-- =============================================
-- TORLAN POS - Multi-Tenant SaaS Schema (MySQL)
-- =============================================

-- Tabla Maestra: Empresas (Clientes SaaS)
CREATE TABLE IF NOT EXISTS empresas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_empresa VARCHAR(255) NOT NULL,
    plan_contratado ENUM('Prueba', 'Basico', 'Premium', 'Empresarial') NOT NULL DEFAULT 'Basico',
    estado ENUM('Activo', 'Suspendido', 'Baja') NOT NULL DEFAULT 'Activo',
    max_usuarios INT DEFAULT 5,
    max_productos INT DEFAULT 100,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_suspension DATETIME NULL,
    notas TEXT NULL,
    billing_cycle_date VARCHAR(50) NULL,
    INDEX idx_estado (estado),
    INDEX idx_plan (plan_contratado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users table (updated for multi-tenancy)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    empresa_id INT NULL,
    role ENUM('global_admin', 'empresa_admin', 'employee') NOT NULL DEFAULT 'employee',
    is_admin TINYINT(1) DEFAULT 0,
    first_login TINYINT(1) DEFAULT 1,
    has_setup_complete TINYINT(1) DEFAULT 0,
    onboarding_completed TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
    INDEX idx_empresa (empresa_id),
    INDEX idx_role (role),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Features table (available feature flags - global, not per empresa)
CREATE TABLE IF NOT EXISTS features (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    icon VARCHAR(50) DEFAULT 'cube'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User features junction table
CREATE TABLE IF NOT EXISTS user_features (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    feature_id INT NOT NULL,
    is_enabled TINYINT(1) DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_feature (user_id, feature_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products table (with empresa_id for multi-tenancy)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) NULL,
    sale_price DECIMAL(10,2) NULL,
    stock INT DEFAULT 0,
    category VARCHAR(100) NULL,
    barcode VARCHAR(100) NULL,
    sbin_code VARCHAR(100) NULL,
    isbn VARCHAR(20) NULL,
    extras TEXT NULL,
    publication_date VARCHAR(50) NULL,
    publisher VARCHAR(255) NULL,
    page_count INT NULL,
    dimensions VARCHAR(100) NULL,
    weight DECIMAL(8,2) NULL,
    page_color VARCHAR(50) NULL,
    language VARCHAR(10) NULL,
    damian INT DEFAULT 0,
    bernat INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    INDEX idx_empresa (empresa_id),
    INDEX idx_category (category),
    INDEX idx_isbn (isbn),
    INDEX idx_barcode (barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sales table (with empresa_id for multi-tenancy)
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    user_id INT NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash', 'card') NOT NULL,
    cash_session_id INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_empresa (empresa_id),
    INDEX idx_user (user_id),
    INDEX idx_created (created_at),
    INDEX idx_payment (payment_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_sale (sale_id),
    INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sales goals table (with empresa_id for multi-tenancy)
CREATE TABLE IF NOT EXISTS sales_goals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    user_id INT NOT NULL,
    type ENUM('weekly', 'monthly') NOT NULL,
    target DECIMAL(10,2) NOT NULL,
    current DECIMAL(10,2) DEFAULT 0,
    period_start DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_empresa (empresa_id),
    INDEX idx_user (user_id),
    INDEX idx_period (period_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default features
INSERT IGNORE INTO features (name, display_name, description, icon) VALUES
    ('sales_statistics', 'Estadísticas de Ventas', 'Ver estadísticas avanzadas de ventas', 'chart-bar'),
    ('competitor_prices', 'Precios de Competencia', 'Registrar y comparar precios de la competencia', 'scale'),
    ('advances', 'Anticipos', 'Gestionar anticipos de clientes', 'banknotes'),
    ('suppliers', 'Proveedores', 'Gestión de proveedores', 'truck');

-- Business settings for sales goals and configurations
CREATE TABLE IF NOT EXISTS business_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    UNIQUE KEY unique_empresa_setting (empresa_id, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cash sessions for register management (blind cut)
CREATE TABLE IF NOT EXISTS cash_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    user_id INT NOT NULL,
    opening_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    expected_amount DECIMAL(10,2) NULL,
    declared_amount DECIMAL(10,2) NULL,
    difference DECIMAL(10,2) NULL,
    status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME NULL,
    notes TEXT NULL,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_empresa (empresa_id),
    INDEX idx_user (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Centralized log for all critical events across empresas
CREATE TABLE IF NOT EXISTS global_changes_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NULL,
    event_type VARCHAR(100) NOT NULL,
    description TEXT NULL,
    user_id INT NULL,
    metadata TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
    INDEX idx_empresa (empresa_id),
    INDEX idx_event (event_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
