-- =============================================
-- Migración: Agregar Descuento y Aumento a Ventas
-- Fecha: 2026-02-13
-- =============================================

-- Agregar columnas para subtotal, descuento y aumento
ALTER TABLE sales ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN surcharge DECIMAL(10,2) DEFAULT 0.00;

-- Actualizar registros existentes: el total actual pasa a ser el subtotal
UPDATE sales SET subtotal = total WHERE subtotal = 0.00;

-- Verificar cambios
SELECT 'Migración completada' as status;
