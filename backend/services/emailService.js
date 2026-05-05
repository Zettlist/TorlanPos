import nodemailer from 'nodemailer';

// Configure via env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// Gmail example:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_USER=tu@gmail.com  SMTP_PASS=app_password

const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST  || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@torlanpos.com';

const TEMPLATES = {
    confirmado: (order) => ({
        subject: `✅ Pedido #${order.id} confirmado — Torlan`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#10b981">¡Tu pedido fue confirmado!</h2>
                <p>Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p>Tu pedido <strong>#${order.id}</strong> por <strong>$${Number(order.total).toFixed(2)}</strong> ha sido confirmado y está siendo preparado.</p>
                <p style="color:#6b7280;font-size:14px">Te avisaremos cuando sea enviado.</p>
                <hr style="border:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#9ca3af">Torlan POS · Este es un correo automático</p>
            </div>
        `
    }),
    envio_espera: (order) => ({
        subject: `📦 Pedido #${order.id} en preparación — Torlan`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#3b82f6">Tu pedido está siendo preparado</h2>
                <p>Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p>Tu pedido <strong>#${order.id}</strong> está siendo empacado y listo para despachar pronto.</p>
                <p style="color:#6b7280;font-size:14px">Te enviaremos el número de guía cuando sea despachado.</p>
                <hr style="border:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#9ca3af">Torlan POS · Este es un correo automático</p>
            </div>
        `
    }),
    envio_despachado: (order) => ({
        subject: `🚚 Pedido #${order.id} despachado — Torlan`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#8b5cf6">¡Tu pedido va en camino!</h2>
                <p>Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p>Tu pedido <strong>#${order.id}</strong> ha sido enviado.</p>
                ${order.tracking_number ? `<div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0">
                    <p style="margin:0;font-size:14px;color:#6b7280">Número de guía</p>
                    <p style="margin:4px 0 0;font-size:20px;font-weight:bold;font-family:monospace;color:#1f2937">${order.tracking_number}</p>
                </div>` : ''}
                <p style="color:#6b7280;font-size:14px">Puedes rastrear tu paquete con el número de guía en el sitio de la paquetería.</p>
                <hr style="border:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#9ca3af">Torlan POS · Este es un correo automático</p>
            </div>
        `
    }),
    entregado: (order) => ({
        subject: `🎉 Pedido #${order.id} entregado — Torlan`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#10b981">¡Pedido entregado!</h2>
                <p>Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p>Tu pedido <strong>#${order.id}</strong> ha sido marcado como entregado. ¡Esperamos que lo disfrutes!</p>
                <p style="color:#6b7280;font-size:14px">Si tuviste algún problema con tu pedido, contáctanos.</p>
                <hr style="border:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#9ca3af">Torlan POS · Este es un correo automático</p>
            </div>
        `
    }),
    reclamo_disputa: (order) => ({
        subject: `⚠️ Reclamo recibido — Pedido #${order.id} — Torlan`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#f59e0b">Hemos recibido tu reclamo</h2>
                <p>Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p>Tu reclamo para el pedido <strong>#${order.id}</strong> ha sido registrado y está en revisión.</p>
                ${order.claim_notes ? `<div style="background:#fffbeb;padding:16px;border-radius:8px;border-left:4px solid #f59e0b;margin:16px 0">
                    <p style="margin:0;font-size:14px;color:#92400e">${order.claim_notes}</p>
                </div>` : ''}
                <p style="color:#6b7280;font-size:14px">Te contactaremos a la brevedad para resolver tu caso.</p>
                <hr style="border:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#9ca3af">Torlan POS · Este es un correo automático</p>
            </div>
        `
    }),
    reclamo_resolucion: (order) => ({
        subject: `✅ Reclamo resuelto — Pedido #${order.id} — Torlan`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#10b981">Tu reclamo fue resuelto</h2>
                <p>Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p>El reclamo de tu pedido <strong>#${order.id}</strong> ha sido resuelto.</p>
                ${order.claim_notes ? `<div style="background:#f0fdf4;padding:16px;border-radius:8px;border-left:4px solid #10b981;margin:16px 0">
                    <p style="margin:0;font-size:14px;color:#065f46">${order.claim_notes}</p>
                </div>` : ''}
                <p style="color:#6b7280;font-size:14px">Gracias por tu paciencia.</p>
                <hr style="border:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#9ca3af">Torlan POS · Este es un correo automático</p>
            </div>
        `
    }),
    cancelado: (order) => ({
        subject: `❌ Pedido #${order.id} cancelado — Torlan`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#ef4444">Pedido cancelado</h2>
                <p>Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p>Tu pedido <strong>#${order.id}</strong> ha sido cancelado.</p>
                ${order.motivo ? `<p style="color:#6b7280;font-size:14px">Motivo: ${order.motivo}</p>` : ''}
                <p style="color:#6b7280;font-size:14px">El cargo en tu tarjeta será liberado en 3-5 días hábiles.</p>
                <hr style="border:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#9ca3af">Torlan POS · Este es un correo automático</p>
            </div>
        `
    }),
};

/**
 * Send order status notification email.
 * Fails silently if SMTP not configured.
 *
 * @param {string} templateKey - Key from TEMPLATES
 * @param {string} to - Recipient email
 * @param {object} orderData - Order data for template
 */
export async function sendOrderEmail(templateKey, to, orderData) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`[Email] SMTP not configured — skipping ${templateKey} to ${to}`);
        return;
    }
    if (!to) return;

    const template = TEMPLATES[templateKey];
    if (!template) {
        console.warn(`[Email] Unknown template: ${templateKey}`);
        return;
    }

    try {
        const { subject, html } = template(orderData);
        await transporter.sendMail({ from: FROM, to, subject, html });
        console.log(`[Email] ${templateKey} → ${to}`);
    } catch (err) {
        console.error(`[Email] Failed to send ${templateKey} to ${to}:`, err.message);
    }
}
