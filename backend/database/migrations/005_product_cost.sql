-- Migration: Add cost_price to products for profit/loss calculations
-- This enables the Reports module to calculate margins and profitability

ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0;

-- Update existing products to have a default cost (70% of sale price as placeholder)
UPDATE products SET cost_price = price * 0.7 WHERE cost_price = 0 OR cost_price IS NULL;
