import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outputPath = 'C:\\Users\\hable\\Desktop\\Torlan_Manual_Usuario.pdf';
const doc = new PDFDocument({ margin: 50, size: 'A4' });

doc.pipe(fs.createWriteStream(outputPath));

// Helper for headers
function addHeader(text) {
    doc.moveDown();
    doc.fontSize(18).fillColor('#0ea5e9').text(text);
    doc.moveDown(0.5);
    doc.strokeColor('#e2e8f0').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
}

// Helper for subheaders
function addSubHeader(text) {
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor('#334155').text(text);
    doc.moveDown(0.5);
}

// Helper for body text
function addBody(text) {
    doc.fontSize(11).fillColor('#475569').text(text, {
        align: 'justify',
        lineGap: 4
    });
    doc.moveDown(0.5);
}

// Helper for bullet points
function addBullet(text) {
    doc.fontSize(11).fillColor('#475569').text(`• ${text}`, {
        indent: 10,
        lineGap: 4
    });
}

// === Title Page ===
doc.fontSize(30).fillColor('#0f172a').text('Torlan POS', { align: 'center' });
doc.fontSize(16).fillColor('#64748b').text('Manual de Usuario', { align: 'center' });
doc.moveDown(2);
doc.fontSize(12).text(`Fecha: ${new Date().toLocaleDateString()}`, { align: 'center' });
doc.moveDown(4);

// === Introduction ===
addHeader('1. Introducción');
addBody('Torlan POS es un sistema de punto de venta moderno y multi-plataforma diseñado para gestionar negocios de manera eficiente. Su arquitectura basada en la nube (SaaS) permite a múltiples empresas operar de forma segura y aislada en el mismo sistema.');
addBody('Este manual cubre las funcionalidades principales para los diferentes tipos de usuarios.');

// === Roles y Acceso ===
addHeader('2. Perfiles de Usuario');
addBody('El sistema cuenta con tres niveles de acceso:');

addSubHeader('2.1. TorlanAdmin (Global Admin)');
addBody('Es el super-administrador del sistema SaaS.');
addBullet('Gestión de Empresas: Crear, editar, suspender y reactivar empresas.');
addBullet('Gestión Global de Usuarios: Ver todos los usuarios del sistema.');
addBullet('Configuración del Sistema: Administrar módulos y características globales.');

addSubHeader('2.2. Admin de Empresa');
addBody('Es el administrador de una tienda o negocio específico.');
addBullet('Gestión de Empleados: Crear y administrar usuarios para su negocio.');
addBullet('Reportes Completos: Acceso a todas las estadísticas de ventas.');
addBullet('Gestión de Inventario: Control total sobre productos y stock.');

addSubHeader('2.3. Empleado');
addBody('Usuario operativo para el día a día.');
addBullet('Ventas: Realizar cobros y generar tickets.');
addBullet('Cierre de Caja: Ver sus propias ventas del día.');
addBullet('Consultas: Buscar productos y verificar precios.');

// === Primeros Pasos ===
addHeader('3. Primeros Pasos');

addSubHeader('3.1. Inicio de Sesión');
addBody('Acceda al sistema a través de su navegador web. Ingrese su usuario y contraseña proporcionados por su administrador.');
addBody('Nota: Si es su primera vez, el sistema podría pedirle cambiar su contraseña por seguridad.');

addSubHeader('3.2. Panel Principal (Dashboard)');
addBody('Al ingresar, verá el Dashboard con indicadores clave (según su rol):');
addBullet('Ventas del Día: Total vendido hoy.');
addBullet('Transacciones: Número de ventas realizadas.');
addBullet('Ticket Promedio: Valor promedio de cada venta.');
addBullet('Ventas Mensuales: Gráfica de desempeño del mes.');

// === Módulo de Ventas ===
addHeader('4. Realizar Ventas (Cobrar)');
addBody('El módulo "Cobrar" es el corazón del sistema POS.');

addSubHeader('4.1. Proceso de Venta');
addBody('1. Busque el producto escaneando el código de barras o escribiendo el nombre.');
addBody('2. Seleccione el producto para añadirlo al carrito.');
addBody('3. Ajuste cantidades si es necesario.');
addBody('4. Haga clic en "Cobrar" y seleccione el método de pago (Efectivo/Tarjeta).');
addBody('5. El sistema procesará la venta y actualizará el stock automáticamente.');

// === Gestión de Productos ===
addHeader('5. Gestión de Productos');

addSubHeader('5.1. Crear Producto');
addBody('Para añadir un nuevo producto al inventario:');
addBody('1. Vaya a la sección "Productos".');
addBody('2. Haga clic en "+ Nuevo Producto".');
addBody('3. Complete los datos: Nombre, Precio, Stock, Código de Barras.');
addBody('4. Guarde el producto.');
addBody('Nota: El número máximo de productos depende de su plan contratado (Básico, Premium, Empresarial).');

// === Administración de Empresas (Solo TorlanAdmin) ===
addHeader('6. Gestión de Empresas (SaaS)');
addBody('Esta sección es exclusiva para el administrador global (TorlanAdmin).');

addSubHeader('6.1. Crear Nueva Empresa');
addBody('Desde el Panel Admin:');
addBody('1. Haga clic en "Nueva Empresa".');
addBody('2. Defina el Nombre y seleccione el Plan (Básico, Premium, etc.).');
addBody('3. Establezca los límites de usuarios y productos.');
addBody('4. Una vez creada, cree un usuario Administrador para esa empresa.');

addSubHeader('6.2. Suspender Empresa');
addBody('Si un cliente deja de pagar o incumple términos, puede suspender su acceso. Esto bloqueará el inicio de sesión para todos los usuarios de esa empresa de inmediato.');

addSubHeader('6.3. Planes de Suscripción');
addBody('El sistema Torlan POS ofrece diferentes niveles de servicio según el tamaño de la empresa:');

addBody('• Plan Prueba:');
addBullet('Para evaluación del sistema.');
addBullet('Límite de usuarios: 1');
addBullet('Límite de productos: 5');

addBody('• Plan Básico:');
addBullet('Ideal para pequeños negocios o startups.');
addBullet('Límite de usuarios: 2');
addBullet('Límite de productos: 50');

addBody('• Plan Premium:');
addBullet('Para negocios en crecimiento con más personal.');
addBullet('Límite de usuarios: 10');
addBullet('Límite de productos: 500');

addBody('• Plan Empresarial:');
addBullet('Solución completa para grandes operaciones.');
addBullet('Límite de usuarios: 100');
addBullet('Límite de productos: 10,000');

// === Soporte ===
addHeader('7. Soporte');
addBody('Para asistencia técnica adicional o reportar problemas, contacte al departamento de TI de Torlan.');

// Finalize
doc.end();
console.log(`Manual generado en: ${outputPath}`);
