-- Migración: Agregar columnas discount y surcharge a tabla sales
-- Ejecutar este archivo con: mysql -u root -p torlan_pos < run_migration.sql

-- Agregar columna subtotal
ALTER TABLE sales ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00;

-- Agregar columna discount  
ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00;

-- Agregar columna surcharge
ALTER TABLE sales ADD COLUMN surcharge DECIMAL(10,2) DEFAULT 0.00;

-- Actualizar registros existentes para que subtotal = total
UPDATE sales SET subtotal = total WHERE subtotal = 0.00;

-- Verificar cambios
SELECT 'Migración completada exitosamente' as status;
DESCRIBE sales;
