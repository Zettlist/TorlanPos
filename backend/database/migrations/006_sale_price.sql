-- Migration: Add sale_price column and migrate data from price column
-- This completes the dual-price system (cost_price from 005 + sale_price)

-- Add sale_price column
ALTER TABLE products ADD COLUMN sale_price REAL DEFAULT 0;

-- Migrate existing price data to sale_price
UPDATE products SET sale_price = price WHERE sale_price = 0 OR sale_price IS NULL;

-- Note: We keep the 'price' column for backward compatibility
-- All new code will use 'sale_price' going forward
