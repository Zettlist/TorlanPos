-- SQL para ejecutar en Cloud SQL
USE torlan_pos;

ALTER TABLE sales ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN surcharge DECIMAL(10,2) DEFAULT 0.00;
UPDATE sales SET subtotal = total WHERE subtotal = 0.00;

SELECT 'Migración Cloud SQL completada' as status;
