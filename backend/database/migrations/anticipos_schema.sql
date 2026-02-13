-- Migración: Módulo de Anticipos
-- Fecha: 2026-02-07
-- Descripción: Tablas para gestionar anticipos de productos con descuento inmediato de inventario

-- Tabla principal de anticipos
CREATE TABLE IF NOT EXISTS anticipos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    empresa_id INT NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    total_amount DECIMAL(10,2) NOT NULL,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    notes TEXT,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_anticipos_empresa (empresa_id),
    INDEX idx_anticipos_status (status),
    INDEX idx_anticipos_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Items del anticipo (productos apartados)
CREATE TABLE IF NOT EXISTS anticipo_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    anticipo_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (anticipo_id) REFERENCES anticipos(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_anticipo_items_anticipo (anticipo_id),
    INDEX idx_anticipo_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
