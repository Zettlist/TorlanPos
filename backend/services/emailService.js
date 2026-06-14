import { Resend } from 'resend';

// Requires: RESEND_API_KEY, EMAIL_FROM (optional, defaults to Bisonte Manga sender)

const FROM = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';

const CARRIER_INFO = {
    paquetexpress: { name: 'Paquetexpress', url: (t) => `https://www.paquetexpress.com.mx/rastreo/?guia=${t}` },
    fedex:         { name: 'FedEx',         url: (t) => `https://www.fedex.com/apps/fedextrack/?tracknumbers=${t}` },
    dhl:           { name: 'DHL',           url: (t) => `https://www.dhl.com/mx-es/home/tracking.html?tracking-id=${t}` },
    estafeta:      { name: 'Estafeta',      url: (t) => `https://www.estafeta.com/herramientas/rastreo?wayBillType=1&wayBill=${t}` },
};

const TEMPLATES = {
    confirmado: (order) => ({
        subject: `📦 Confirmación de stock — Pedido #${order.id} — Bisonte Manga`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #10b981">
                <h2 style="color:#10b981;margin:0 0 12px">Confirmación de stock</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">Confirmamos la existencia de tu pedido <strong>#${order.id}</strong> por <strong>$${Number(order.total).toFixed(2)} MXN</strong>. Ya estamos preparando tu envío.</p>
                <p style="color:#6b7280;font-size:14px">Pronto recibirás el número de guía para rastrear tu paquete.</p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
    }),
    envio_espera: (order) => ({
        subject: `📦 Pedido #${order.id} en preparación — Bisonte Manga`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #3b82f6">
                <h2 style="color:#3b82f6;margin:0 0 12px">Tu pedido está siendo preparado</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">Tu pedido <strong>#${order.id}</strong> está siendo empacado y listo para despachar pronto.</p>
                <p style="color:#6b7280;font-size:14px">Te enviaremos el número de guía cuando sea despachado.</p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
    }),
    envio_despachado: (order) => {
        const carrier = order.carrier ? CARRIER_INFO[order.carrier.toLowerCase()] : null;
        const carrierName = carrier?.name || order.carrier || 'la paquetería';
        const trackingUrl = carrier && order.tracking_number ? carrier.url(order.tracking_number) : null;
        return {
            subject: `🚚 Pedido #${order.id} en camino — Bisonte Manga`,
            html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #8b5cf6">
                <h2 style="color:#8b5cf6;margin:0 0 12px">¡Tu pedido va en camino!</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">Tu pedido <strong>#${order.id}</strong> ha sido enviado por <strong>${carrierName}</strong>.</p>
                ${order.tracking_number ? `
                <div style="background:#f3f4f6;padding:16px;border-radius:10px;margin:20px 0;text-align:center">
                  <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Número de guía · ${carrierName}</p>
                  <p style="margin:6px 0 8px;font-size:22px;font-weight:900;font-family:monospace;color:#1f2937">${order.tracking_number}</p>
                  ${trackingUrl ? `<a href="${trackingUrl}" style="display:inline-block;background:#8b5cf6;color:#fff;padding:10px 24px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.5px">Rastrear paquete →</a>` : ''}
                </div>` : ''}
                <p style="color:#6b7280;font-size:14px">También puedes rastrear tu paquete directamente en el sitio de ${carrierName}.</p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
        };
    },
    entregado: (order) => ({
        subject: `🎉 Pedido #${order.id} entregado — Bisonte Manga`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #10b981">
                <h2 style="color:#10b981;margin:0 0 12px">¡Pedido entregado!</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">Tu pedido <strong>#${order.id}</strong> ha sido entregado. ¡Esperamos que lo disfrutes!</p>
                <p style="color:#6b7280;font-size:14px">Si tuviste algún problema con tu pedido, contáctanos en <a href="mailto:soporte@bisontemanga.com" style="color:#dc2626">soporte@bisontemanga.com</a></p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
    }),
    reclamo_paqueteria: (order) => ({
        subject: `📦 Incidente en tu envío — Pedido #${order.id} — Bisonte Manga`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #f59e0b">
                <h2 style="color:#f59e0b;margin:0 0 12px">Incidente reportado en tu envío</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">La paquetería reportó un incidente con tu pedido <strong>#${order.id}</strong>. Estamos en contacto con ellos para resolver la situación.</p>
                ${order.tracking_number ? `<div style="background:#fffbeb;padding:14px;border-radius:10px;margin:16px 0"><p style="margin:0;font-size:12px;color:#92400e">Guía: <strong style="font-family:monospace">${order.tracking_number}</strong></p></div>` : ''}
                <p style="color:#6b7280;font-size:14px">Te mantendremos informado. Si tienes preguntas escríbenos a <a href="mailto:soporte@bisontemanga.com" style="color:#dc2626">soporte@bisontemanga.com</a></p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
    }),
    reclamo_cliente: (order) => ({
        subject: `⚠️ Reclamo recibido — Pedido #${order.id} — Bisonte Manga`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #f59e0b">
                <h2 style="color:#f59e0b;margin:0 0 12px">Hemos recibido tu reclamo</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">Tu reclamo para el pedido <strong>#${order.id}</strong> ha sido registrado y está en revisión.</p>
                ${order.claim_notes ? `<div style="background:#fffbeb;padding:16px;border-radius:10px;border-left:4px solid #f59e0b;margin:16px 0"><p style="margin:0;font-size:14px;color:#92400e">${order.claim_notes}</p></div>` : ''}
                <p style="color:#6b7280;font-size:14px">Te contactaremos a la brevedad para resolver tu caso.</p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
    }),
    // keep legacy key as alias for cliente
    reclamo_disputa: (order) => TEMPLATES.reclamo_cliente(order),
    reclamo_resolucion: (order) => ({
        subject: `✅ Reclamo resuelto — Pedido #${order.id} — Bisonte Manga`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #10b981">
                <h2 style="color:#10b981;margin:0 0 12px">Tu reclamo fue resuelto</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">El reclamo de tu pedido <strong>#${order.id}</strong> ha sido resuelto.</p>
                ${order.claim_notes ? `<div style="background:#f0fdf4;padding:16px;border-radius:10px;border-left:4px solid #10b981;margin:16px 0"><p style="margin:0;font-size:14px;color:#065f46">${order.claim_notes}</p></div>` : ''}
                <p style="color:#6b7280;font-size:14px">Gracias por tu paciencia.</p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
    }),
    cancelado: (order) => ({
        subject: `❌ Pedido #${order.id} cancelado — Bisonte Manga`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
              </div>
              <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #ef4444">
                <h2 style="color:#ef4444;margin:0 0 12px">Pedido cancelado</h2>
                <p style="color:#374151">Hola <strong>${order.nombre} ${order.apellido}</strong>,</p>
                <p style="color:#374151">Tu pedido <strong>#${order.id}</strong> ha sido cancelado.</p>
                ${order.motivo ? `<p style="color:#6b7280;font-size:14px">Motivo: ${order.motivo}</p>` : ''}
                <p style="color:#6b7280;font-size:14px">El cargo en tu tarjeta será liberado en 3-5 días hábiles.</p>
              </div>
              <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
            </div>`
    }),
};

/**
 * Send order status notification email via Resend.
 * Fails silently if RESEND_API_KEY not configured.
 */
export async function sendOrderEmail(templateKey, to, orderData) {
    if (!process.env.RESEND_API_KEY) {
        console.log(`[Email] RESEND_API_KEY not set — skipping ${templateKey} to ${to}`);
        return;
    }
    if (!to) return;

    const template = TEMPLATES[templateKey];
    if (!template) {
        console.warn(`[Email] Unknown template: ${templateKey}`);
        return;
    }

    try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { subject, html } = template(orderData);
        const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
        if (error) throw new Error(error.message);
        console.log(`[Email] ${templateKey} → ${to} (id: ${data.id})`);
    } catch (err) {
        console.error(`[Email] Failed ${templateKey} to ${to}:`, err.message);
    }
}
