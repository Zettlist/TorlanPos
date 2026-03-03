-- =============================================
-- Migration 007: Composite Indexes for Performance
-- Improves query speed for statistics, dashboard, and product search
-- =============================================

-- Composite index for sales statistics queries (empresa_id + created_at)
-- Used heavily by /statistics, /goals, and /reports endpoints
ALTER TABLE sales ADD INDEX IF NOT EXISTS idx_empresa_created (empresa_id, created_at);

-- Composite index for cash session lookups (empresa_id + user_id + status)
-- Used on every sale creation to validate open cash session
ALTER TABLE cash_sessions ADD INDEX IF NOT EXISTS idx_empresa_user_status (empresa_id, user_id, status);

-- Composite index for product name search (empresa_id + name)
-- Used by product list and search
ALTER TABLE products ADD INDEX IF NOT EXISTS idx_empresa_name (empresa_id, name);

-- Composite index for sbin_code product lookup (empresa_id + sbin_code)
-- Used by barcode scanner search
ALTER TABLE products ADD INDEX IF NOT EXISTS idx_empresa_sbin (empresa_id, sbin_code);

-- Composite index for sale_items supplier debt calculation
-- Used by statistics endpoint to calculate daily supplier debt
ALTER TABLE sale_items ADD INDEX IF NOT EXISTS idx_sale_product (sale_id, product_id);
