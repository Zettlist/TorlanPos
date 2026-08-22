import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Cotizaciones (v2). Una cotizacion es una LISTA con nombre.
//   Fase 1 (formulario): capturas los productos — tipo Offline (compra
//     presencial) u Online (con link de compra), costo de compra y precio de
//     venta. Al guardar se confirma.
//   Fase 2 (panel): se ve el detalle con los totales de la cotizacion
//     (costo compra, precio venta, % ganancia automatico) y un apartado de
//     Proveedores: cada proveedor con su precio base + conceptos (Envío, extra,
//     …) que suman su total. Sirve para comparar cuál conviene.
// Mismo stack/tokens del POS (rgb(var(--x)), fetch con JWT, SVG inline).
// ─────────────────────────────────────────────────────────────────────────────

// Pesos (venta) y Yenes (compra). El yen no usa decimales.
const fmtMXN = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtJPY = (n) => '¥' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const fmt = fmtMXN; // alias para montos en pesos
// Ganancia real: compra (JPY) se convierte a MXN con la tasa antes de comparar.
const gananciaPct = (ccJPY, pvMXN, rate) => {
    const compraMXN = (Number(ccJPY) || 0) * (Number(rate) || 0);
    return compraMXN > 0 ? Math.round(((Number(pvMXN) - compraMXN) / compraMXN) * 1000) / 10 : 0;
};

// Sobrecosto real (envío + fees + impuestos): el costo verdadero es compra × K.
// La "% Ganancia Neta" descuenta ese sobrecosto de la ganancia que muestra la app:
//   gNeta = (1 + pctApp) / K − 1,  donde pctApp = ganancia bruta que ve la app.
const K_SOBRECOSTO = 2.32;
const gananciaNetaPct = (pctBrutoPorc) => Math.round(((1 + Number(pctBrutoPorc) / 100) / K_SOBRECOSTO - 1) * 1000) / 10;

// Semáforo por % de ganancia bruta (la que muestra la app). Cada rango -> color + etiqueta.
const SEMAFORO = [
    { max: 132, color: '#7F1D1D', label: 'PÉRDIDA' },
    { max: 150, color: '#EF4444', label: 'ZONA ROJA' },
    { max: 250, color: '#EAB308', label: 'MARGEN' },
    { max: 280, color: '#22C55E', label: 'ACEPTABLE' },
    { max: 350.001, color: '#10B981', label: 'ÓPTIMO' },
    { max: Infinity, color: '#06B6D4', label: 'EXCELENTE' },
];
const semaforo = (pctBrutoPorc) => {
    const p = Number(pctBrutoPorc) || 0;
    return SEMAFORO.find((s) => p < s.max) || SEMAFORO[SEMAFORO.length - 1];
};

const fmtPct = (n) => `${Math.round(Number(n || 0) * 10) / 10}%`;

// ─── Números animados ────────────────────────────────────────────────────────
// Los totales y porcentajes se recalculan cada vez que se marca un producto o
// se elige la propuesta de un proveedor. Contar hasta el valor nuevo (en vez de
// reemplazarlo de golpe) deja ver CUÁNTO se movió la métrica y en qué dirección.
function useCountUp(target, duration) {
    const ms = duration || 550;
    const to = Number(target) || 0;
    const [val, setVal] = useState(0);
    const fromRef = useRef(0);
    useEffect(() => {
        const from = fromRef.current;
        if (from === to) { setVal(to); return; }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            fromRef.current = to; setVal(to); return;
        }
        let raf = 0;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / ms);
            const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
            const cur = p < 1 ? from + (to - from) * eased : to;
            fromRef.current = cur;
            setVal(cur);
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [to, ms]);
    return val;
}

// Valor numérico animado y ya formateado. El color también transiciona: cuando
// el % cruza un rango del semáforo, el tono se funde en vez de parpadear.
function AnimNum({ value, format = fmtMXN, className = '', style, duration }) {
    const v = useCountUp(value, duration);
    return <span className={className} style={{ transition: 'color 400ms ease', ...style }}>{format(v)}</span>;
}

// Baja una imagen de GCS vía el proxy del API y la convierte a JPEG dataURL
// (canvas) para incrustarla en el PDF. Devuelve { data, ratio(h/w) }.
async function fetchImgData(imagenUrl, authHeaders) {
    const proxy = `${API_URL}/cotizaciones/img-proxy?url=${encodeURIComponent(imagenUrl)}`;
    const res = await fetch(proxy, { headers: authHeaders });
    if (!res.ok) throw new Error('img');
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = objUrl;
        });
        const max = 240;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return { data: canvas.toDataURL('image/jpeg', 0.85), ratio: h / w };
    } finally { URL.revokeObjectURL(objUrl); }
}

// Las fuentes base de jsPDF (Helvetica) son /WinAnsiEncoding: solo Latin-1.
// Si una linea trae UN solo caracter fuera de ese rango, jsPDF pasa la linea
// COMPLETA a UTF-16BE y el visor la dibuja con la tabla WinAnsi: cada ASCII
// sale como espacio + letra y cada kanji como "0³". De ahi el texto separado
// y la basura que aparecia en la columna de URL.
//
// Para URLs la salida correcta es percent-encoding: queda ASCII puro, sigue
// siendo la MISMA direccion (new URL() de ambas da el mismo href) y se puede
// copiar o clickear tal cual.
function urlAscii(texto) {
    return String(texto || '').replace(/[^\x20-\x7E]/gu, (ch) => {
        try { return encodeURIComponent(ch); } catch { return ''; }
    });
}

// Para texto normal no sirve percent-encoding (seria ilegible), asi que se
// quitan los caracteres que la fuente no puede dibujar. Se conserva Latin-1
// completo, que es lo que WinAnsi si cubre (acentos, ñ, ¥…).
//
// Antes de borrar se traduce la puntuacion tipografica que se cuela al copiar
// y pegar (— " " ' ' …): son fuera de Latin-1, pero tienen equivalente ASCII y
// borrarlas dejaria huecos raros en medio de la frase.
const EQUIV_ASCII = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', ' ': ' ' };
function soloLatin1(texto) {
    return String(texto || '')
        .replace(/[–—‘’“”… ]/g, (ch) => EQUIV_ASCII[ch])
        .replace(/[^\x20-\xFF]/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// splitTextToSize solo corta en espacios: una URL es un unico "token" y la
// deja larguisima. Esto parte cualquier linea que siga pasada de ancho,
// midiendo caracter por caracter con la fuente y tamaño activos.
function partirDuro(doc, texto, ancho) {
    const out = [];
    let linea = '';
    for (const ch of texto) {
        const prueba = linea + ch;
        if (linea && doc.getTextWidth(prueba) > ancho) { out.push(linea); linea = ch; }
        else linea = prueba;
    }
    if (linea) out.push(linea);
    return out;
}

// Texto visible de un link. El enlace del PDF siempre lleva la URL COMPLETA;
// esto es solo lo que se lee. Se quita el esquema y el "www.", y si aun no
// cabe en dos renglones se colapsa el centro de la ruta dejando el final, que
// es donde vive el identificador del producto — lo unico que el proveedor
// necesita si llega a imprimir la hoja.
//   https://www.animate-onlineshop.jp/products/%E3%82%B3…/pd/3314567/
//   -> animate-onlineshop.jp/.../pd/3314567/
function urlCorta(doc, completa, ancho, renglones = 2) {
    const cabe = (t) => doc.getTextWidth(t) <= ancho * renglones;

    let u;
    try { u = new URL(completa); } catch { return completa; }

    const host = u.host.replace(/^www\./i, '');
    const segs = u.pathname.split('/').filter(Boolean);
    const barra = u.pathname.endsWith('/') && segs.length ? '/' : '';

    // Sin segmentos, pathname es "/" y sobra: "ejemplo.jp", no "ejemplo.jp/".
    if (!segs.length) return host + u.search;

    const entera = host + u.pathname + u.search;
    if (cabe(entera)) return entera;

    // Sin query (para el proveedor es ruido) y quedandose con la cola.
    const sinQuery = host + u.pathname;
    if (cabe(sinQuery)) return sinQuery;

    for (const cola of [3, 2, 1]) {
        if (segs.length <= cola) break;
        const corto = `${host}/.../${segs.slice(-cola).join('/')}${barra}`;
        if (cabe(corto)) return corto;
    }
    // Ultimo recurso: host + el segmento final, aunque se parta.
    return segs.length ? `${host}/.../${segs[segs.length - 1]}${barra}` : host;
}

function envolver(doc, texto, ancho) {
    const out = [];
    for (const linea of doc.splitTextToSize(String(texto || ''), ancho)) {
        if (doc.getTextWidth(linea) <= ancho) out.push(linea);
        else out.push(...partirDuro(doc, linea, ancho));
    }
    return out;
}

// Genera un PDF (tabla) de los items dados para mandar a proveedores a cotizar.
// El documento va en INGLES: los proveedores son japoneses.
// Incluye: foto, Producto, precio de compra de referencia (¥) y URL/lugar.
// NO incluye precio de venta. Los proveedores responden en su propio formato.
async function descargarPDF(nombre, items, authHeaders, folioInfo) {
    // Precarga de imágenes (las que fallen simplemente no salen).
    const imgMap = {};
    for (const it of items) {
        if (it.imagenUrl) {
            try { imgMap[it.id] = await fetchImgData(it.imagenUrl, authHeaders); } catch { /* sin imagen */ }
        }
    }

    const folioStr = folioInfo?.folio || null; // folio estructurado (45-Q3-COT03-01)
    const dObj = folioInfo?.createdAt ? new Date(folioInfo.createdAt) : new Date();

    const doc = new jsPDF();
    const mL = 14, pageH = 297, bottom = pageH - 16;
    const tableRight = mL + 182;

    // Encabezado
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('Request for Quotation', mL, 18);
    if (folioStr) {
        doc.setFontSize(11); doc.text(`Quote No.: ${folioStr}`, tableRight, 18, { align: 'right' });
    }
    // El encabezado se dibuja con un cursor en vez de coordenadas fijas: asi
    // se le pueden agregar o quitar renglones sin recalcular donde empieza la
    // tabla ni arriesgar que se encimen.
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
    let hy = 25;
    const linea = (texto, { salto = 5, negritas = false, sangria = 0 } = {}) => {
        doc.setFont('helvetica', negritas ? 'bold' : 'normal');
        doc.text(soloLatin1(texto), mL + sangria, hy);
        hy += salto;
    };

    const fecha = dObj.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
    linea(nombre);
    linea(`Date: ${fecha}`);
    linea('Reference purchase prices in Japanese yen (JPY). We appreciate your quotation.');
    linea('Tip: right-click each URL to open it in a separate tab.', { salto: 7 });
    linea('Shipping to Mexico - please quote BOTH addresses:', { negritas: true });
    linea('Mexico - Monterrey, CP 66418', { sangria: 4 });
    linea('Mexico - Ciudad de Mexico, CP 09240', { sangria: 4 });

    doc.setFont('helvetica', 'normal'); doc.setTextColor(0);

    // Anchos en mm; suman los 182 de la tabla. Se derivan las x en cadena para
    // no tener que recalcular offsets a mano al mover una columna.
    const cols = [];
    for (const [title, w, align] of [
        ['#', 7, 'left'],
        ['Photo', 17, 'left'],
        ['Product', 39, 'left'],
        ['Qty', 10, 'right'],
        ['Pcs', 11, 'right'],
        ['Unit (JPY)', 21, 'right'],
        ['Total (JPY)', 22, 'right'],
        ['Weight', 16, 'right'],
        ['URL / Where', 39, 'left'],
    ]) {
        const prev = cols[cols.length - 1];
        cols.push({ title, w, align, x: prev ? prev.x + prev.w : mL });
    }
    const [C_NUM, C_FOTO, C_PROD, C_QTY, C_PZS, C_UNIT, C_TOTAL, C_PESO, C_URL] = cols;

    function header(y) {
        doc.setFillColor(30, 41, 59); doc.rect(mL, y, tableRight - mL, 8, 'F');
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        for (const c of cols) {
            const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2;
            doc.text(c.title, tx, y + 5.5, { align: c.align === 'right' ? 'right' : 'left' });
        }
        doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        return y + 8;
    }

    let y = header(hy + 4);

    // Tamaños: la URL va mas chica porque al quedar percent-encoded se alarga.
    const FS_BASE = 9, FS_URL = 8, LH_BASE = 4.5, LH_URL = 3.4;
    const jpy = (n) => '¥' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
    // El peso ya viene en kg (unidad con la que se cotiza el envio).
    const kg = (n) => (!n ? '-' : `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 })} kg`);

    items.forEach((it, i) => {
        doc.setFontSize(FS_BASE);
        // Si el nombre viene solo en japones, al quitar lo no-Latin1 no queda
        // nada: en ese caso la foto es la referencia.
        const prodTexto = soloLatin1(it.producto) || (it.producto ? '(see photo)' : '');
        const prodLines = doc.splitTextToSize(prodTexto, C_PROD.w - 4);
        const uds = Math.max(1, Number(it.unidades) || 1);
        const pzs = Math.max(1, Number(it.piezas) || 1);
        const pesoLinea = (Number(it.pesoKg) || 0) * uds;

        const esLink = it.tipo === 'online' && !!it.link;
        // El destino del hipervinculo es la URL completa; lo que se lee es la
        // version corta.
        const destino = esLink ? urlAscii(it.link) : null;
        const refLH = esLink ? LH_URL : LH_BASE;
        doc.setFontSize(esLink ? FS_URL : FS_BASE);
        const refText = esLink
            ? urlCorta(doc, destino, C_URL.w - 4)
            : (it.link ? `In store: ${soloLatin1(it.link)}` : 'In store');
        const refLines = envolver(doc, refText, C_URL.w - 4);
        doc.setFontSize(FS_BASE);

        const img = imgMap[it.id];
        // Imagen: máx 20mm ancho / 22mm alto, respetando proporción.
        let imgW = 0, imgH = 0;
        if (img) {
            imgW = C_FOTO.w - 4; imgH = imgW * img.ratio;
            if (imgH > 22) { imgH = 22; imgW = imgH / img.ratio; }
        }
        const altoTexto = Math.max(prodLines.length * LH_BASE, refLines.length * refLH, LH_BASE);
        const rowH = Math.max(altoTexto + 4, imgH + 4, 12);

        if (y + rowH > bottom) { doc.addPage(); y = header(18); }

        doc.setDrawColor(220); doc.rect(mL, y, tableRight - mL, rowH);
        for (const c of cols.slice(1)) doc.line(c.x, y, c.x, y + rowH);

        const ty = y + 5;
        doc.text(String(i + 1), C_NUM.x + 2, ty);
        if (img) {
            try { doc.addImage(img.data, 'JPEG', C_FOTO.x + 2, y + 2, imgW, imgH); } catch { /* omite */ }
        }
        doc.text(prodLines, C_PROD.x + 2, ty);

        // Cantidad en negritas cuando es mas de una: es el dato que no se le
        // puede pasar por alto a quien cotiza.
        if (uds > 1) doc.setFont('helvetica', 'bold');
        doc.text(String(uds), C_QTY.x + C_QTY.w - 2, ty, { align: 'right' });
        // Piezas que trae CADA unidad. No cambia el precio, pero el proveedor
        // necesita ver que el renglon es un lote y de cuantas piezas.
        doc.text(String(pzs), C_PZS.x + C_PZS.w - 2, ty, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        const unit = Number(it.costoCompra || 0);
        doc.text(jpy(unit), C_UNIT.x + C_UNIT.w - 2, ty, { align: 'right' });
        doc.text(jpy(unit * uds), C_TOTAL.x + C_TOTAL.w - 2, ty, { align: 'right' });
        doc.setFontSize(8);
        doc.text(kg(pesoLinea), C_PESO.x + C_PESO.w - 2, ty, { align: 'right' });
        doc.setFontSize(FS_BASE);

        // Linea por linea con la Y calculada: asi el interlineado corresponde
        // al tamaño real usado y, si es link, cada trozo queda clickeable.
        // Azul + subrayado para que se lea como enlace tambien en pantalla.
        doc.setFontSize(esLink ? FS_URL : FS_BASE);
        if (esLink) doc.setTextColor(29, 78, 216);
        refLines.forEach((ln, k) => {
            const lx = C_URL.x + 2;
            const ly = ty + k * refLH;
            if (esLink) {
                doc.textWithLink(ln, lx, ly, { url: destino });
                doc.setDrawColor(29, 78, 216);
                doc.setLineWidth(0.15);
                doc.line(lx, ly + 0.7, lx + doc.getTextWidth(ln), ly + 0.7);
            } else {
                doc.text(ln, lx, ly);
            }
        });
        if (esLink) { doc.setTextColor(0); doc.setDrawColor(220); doc.setLineWidth(0.2); }
        doc.setFontSize(FS_BASE);

        y += rowH;
    });

    // ── Renglon de totales ───────────────────────────────────────────────────
    // Con unidades, la suma de la columna ya no es obvia a simple vista: el
    // proveedor necesita ver cuantas piezas son en total y contra que monto de
    // referencia esta cotizando.
    const udsDe = (it) => Math.max(1, Number(it.unidades) || 1);
    const totalUds = items.reduce((s, it) => s + udsDe(it), 0);
    const totalPzs = items.reduce((s, it) => s + udsDe(it) * Math.max(1, Number(it.piezas) || 1), 0);
    const totalRef = items.reduce((s, it) => s + Number(it.costoCompra || 0) * udsDe(it), 0);
    const totalPeso = Math.round(items.reduce((s, it) => s + (Number(it.pesoKg) || 0) * udsDe(it), 0) * 1000) / 1000;

    const totH = 9;
    if (y + totH > bottom) { doc.addPage(); y = header(18); }
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(220);
    doc.rect(mL, y, tableRight - mL, totH, 'FD');
    for (const c of cols.slice(1)) doc.line(c.x, y, c.x, y + totH);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const tty = y + 6;
    doc.text(`TOTAL - ${items.length} line${items.length === 1 ? '' : 's'}`, C_PROD.x + 2, tty);
    doc.text(String(totalUds), C_QTY.x + C_QTY.w - 2, tty, { align: 'right' });
    doc.text(String(totalPzs), C_PZS.x + C_PZS.w - 2, tty, { align: 'right' });
    doc.text(jpy(totalRef), C_TOTAL.x + C_TOTAL.w - 2, tty, { align: 'right' });
    doc.text(kg(totalPeso), C_PESO.x + C_PESO.w - 2, tty, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += totH;

    const safe = String(nombre || 'cotizacion').replace(/[^\w\d]+/g, '_').slice(0, 40);
    const ymd = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
    doc.save(`${safe}_${ymd}${folioStr ? '_' + folioStr : ''}.pdf`);
}

// El peso se captura y se muestra en kilos. Hasta 3 decimales porque un tomo
// suelto pesa ~0.2 kg y redondear a 1 decimal borraria la mitad del catalogo.
function fmtPeso(kilos) {
    const n = Number(kilos) || 0;
    if (n === 0) return '—';
    return `${n.toLocaleString('es-MX', { maximumFractionDigits: 3 })} kg`;
}

const Ico = {
    plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />,
    pencil: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
    trash: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
    doc: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />,
    image: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />,
    back: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />,
    link: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
    store: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18l-1 9H4L3 3zm1 9v7a1 1 0 001 1h14a1 1 0 001-1v-7M9 21v-4a1 1 0 011-1h4a1 1 0 011 1v4" />,
    download: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
    cart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />,
    cash: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />,
    trend: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
    percent: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h.01M15 15h.01M17 7l-10 10M6 8a2 2 0 110-4 2 2 0 010 4zm12 12a2 2 0 110-4 2 2 0 010 4z" />,
    peso: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m-7 0h14M12 6l-7 2 3.5 7a3.5 3.5 0 007 0L19 8l-7-2z" />,
    gauge: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
    alert: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />,
};
function Icon({ path, className = 'w-5 h-5' }) {
    return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">{path}</svg>;
}
const Spinner = () => (
    <div className="flex justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
);

// ═════════════════════════════════════════════════════════════════════════════
export default function Cotizaciones() {
    const { token } = useAuth();
    const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    const loadList = useCallback(async () => {
        try {
            const r = await fetch(`${API_URL}/cotizaciones`, { headers: authHeaders });
            if (r.ok) setList(await r.json());
        } catch { /* red */ } finally { setLoading(false); }
    }, [authHeaders]);

    useEffect(() => { loadList(); }, [loadList]);

    if (selectedId) {
        return (
            <Detalle
                id={selectedId}
                authHeaders={authHeaders}
                onBack={() => { setSelectedId(null); loadList(); }}
                onDeleted={() => { setSelectedId(null); loadList(); }}
            />
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-ink">Cotizaciones</h1>
                    <p className="text-sm text-muted mt-0.5">Listas de productos aún sin stock — compara proveedores</p>
                </div>
                <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2 shrink-0">
                    <Icon path={Ico.plus} className="w-4 h-4" /> Nueva cotización
                </button>
            </div>

            {loading ? <Spinner /> : list.length === 0 ? (
                <div className="panel p-16 text-center">
                    <div className="w-10 h-10 mx-auto mb-3 text-muted"><Icon path={Ico.doc} className="w-10 h-10" /></div>
                    <p className="text-sm text-muted">Sin cotizaciones registradas</p>
                    <p className="text-xs text-muted mt-1">Crea una lista de productos y luego compara proveedores.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((c) => (
                        <button key={c.id} onClick={() => setSelectedId(c.id)}
                            className="panel p-5 text-left hover:border-accent/40 transition-colors cursor-pointer">
                            <div className="flex items-start justify-between gap-2">
                                <h2 className="font-semibold text-ink truncate">{c.nombre}</h2>
                                <span className="text-xs text-muted shrink-0">{c.numItems} prod.</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-4">
                                <Mini label="Compra (¥)" value={fmtJPY(c.totalCompraJPY)} />
                                <Mini label="Venta ($)" value={fmtMXN(c.totalVentaMXN)} />
                                <Mini label="% Gan. proyectada" value={`${c.gananciaPorc}%`} tone={c.gananciaPorc >= 0 ? 'ok' : 'bad'} />
                                <Mini label="% Gan. neta" value={fmtPct(c.totalCompraJPY > 0 ? gananciaNetaPct(c.gananciaPorc) : 0)}
                                    tone={(c.totalCompraJPY > 0 ? gananciaNetaPct(c.gananciaPorc) : 0) >= 0 ? 'ok' : 'bad'} />
                                <Mini label="Peso aprox." value={fmtPeso(c.totalPesoKg)} />
                                <Mini label="Proveedores" value={String(c.numProveedores)} />
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {creating && (
                <CreateModal
                    authHeaders={authHeaders}
                    onClose={() => setCreating(false)}
                    onCreated={(id) => { setCreating(false); loadList(); setSelectedId(id); }}
                />
            )}
        </div>
    );
}

function Mini({ label, value, tone }) {
    return (
        <div>
            <p className="text-xs text-muted">{label}</p>
            <p className={`text-sm font-semibold mt-0.5 ${tone ? `text-${tone}` : 'text-ink'}`}>{value}</p>
        </div>
    );
}

// ═══ FASE 1 — Formulario de creación (lista de productos) ════════════════════
function CreateModal({ authHeaders, onClose, onCreated }) {
    const nextKey = useRef(1);
    const mkRow = () => ({ key: nextKey.current++, producto: '', unidades: '1', piezas: '1', pesoKg: '', tipo: '', referencia: '', costoCompra: '', precioVenta: '', imagenUrl: null, uploading: false });
    // Nombre automático (editable): "Cotización <fecha> <hora>".
    const defaultNombre = () => {
        const d = new Date();
        const fecha = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        return `Cotización ${fecha} ${hora}`;
    };
    const [nombre, setNombre] = useState(defaultNombre);
    const [rows, setRows] = useState(() => Array.from({ length: 5 }, mkRow));
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [tipoCambio, setTipoCambio] = useState('0.13'); // MXN por 1 JPY
    const [fxLoading, setFxLoading] = useState(true);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API_URL}/cotizaciones/fx`, { headers: authHeaders });
                if (r.ok) { const { rate } = await r.json(); if (vivo && rate) setTipoCambio(String(rate)); }
            } catch { /* red */ } finally { if (vivo) setFxLoading(false); }
        })();
        return () => { vivo = false; };
    }, [authHeaders]);

    const update = (key, field, value) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    const addRows = (n = 1) => setRows((rs) => [...rs, ...Array.from({ length: n }, mkRow)]);
    const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

    async function uploadRowImg(key, file) {
        if (!file) return;
        update(key, 'uploading', true);
        try {
            const fd = new FormData();
            fd.append('imagen', file);
            const r = await fetch(`${API_URL}/cotizaciones/upload-imagen`, { method: 'POST', headers: authHeaders, body: fd });
            if (!r.ok) throw new Error();
            const { url } = await r.json();
            setRows((rs) => rs.map((row) => (row.key === key ? { ...row, imagenUrl: url, uploading: false } : row)));
        } catch {
            update(key, 'uploading', false);
            setErr('No se pudo subir una imagen.');
        }
    }

    // Pegar desde Excel en la 1a celda: reparte Producto / Compra / Venta / Uds /
    // Pzs / Peso(kg). De la 4a en adelante son opcionales.
    function onPasteProducto(e, key) {
        const text = e.clipboardData.getData('text');
        if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
        e.preventDefault();
        const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
        const nuevos = lines.map((l) => {
            const c = l.split('\t');
            return {
                key: nextKey.current++, tipo: '', referencia: '', imagenUrl: null, uploading: false,
                producto: (c[0] || '').trim(),
                costoCompra: (c[1] || '').replace(/[^0-9.]/g, ''),
                precioVenta: (c[2] || '').replace(/[^0-9.]/g, ''),
                unidades: String(Math.max(1, parseInt((c[3] || '').replace(/[^0-9]/g, ''), 10) || 1)),
                piezas: String(Math.max(1, parseInt((c[4] || '').replace(/[^0-9]/g, ''), 10) || 1)),
                pesoKg: (c[5] || '').replace(/[^0-9.]/g, ''),
            };
        });
        setRows((rs) => {
            const i = rs.findIndex((r) => r.key === key);
            const copia = [...rs];
            copia.splice(i, 1, ...nuevos);
            return copia;
        });
    }

    const validas = rows.filter((r) => r.producto.trim());
    const udsDe = (r) => Math.max(1, parseInt(r.unidades, 10) || 1);
    const totalCompra = validas.reduce((s, r) => s + (Number(r.costoCompra) || 0) * udsDe(r), 0);
    const totalVenta = validas.reduce((s, r) => s + (Number(r.precioVenta) || 0) * udsDe(r), 0);
    const totalUnidades = validas.reduce((s, r) => s + udsDe(r), 0);
    const pzsDe = (r) => Math.max(1, parseInt(r.piezas, 10) || 1);
    const totalPiezas = validas.reduce((s, r) => s + udsDe(r) * pzsDe(r), 0);
    const totalPesoKg = validas.reduce((s, r) => s + udsDe(r) * (Number(r.pesoKg) || 0), 0);

    // ── Cierre protegido ─────────────────────────────────────────────────────
    // La captura es larga (decenas de filas, imágenes subidas) y no se guarda
    // nada hasta "Crear cotización": un clic fuera del recuadro borraba todo sin
    // avisar. Si hay algo capturado se pide confirmación antes de descartar.
    const [confirmClose, setConfirmClose] = useState(false);
    // Ojo: unidades arranca en "1", asi que solo cuenta como progreso si la
    // movieron. Si no, el formulario recien abierto pediria confirmacion.
    const hayProgreso = rows.some((r) => r.producto.trim() || r.referencia.trim() || String(r.costoCompra).trim()
        || String(r.precioVenta).trim() || r.imagenUrl || r.uploading
        || udsDe(r) > 1 || pzsDe(r) > 1 || String(r.pesoKg).trim());
    const tryClose = () => { if (hayProgreso) setConfirmClose(true); else onClose(); };

    // Escape: mismo camino que el clic fuera (no cierra en seco).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            if (confirmClose) setConfirmClose(false);
            else tryClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    async function save() {
        setErr('');
        const nombreFinal = nombre.trim() || defaultNombre();
        if (validas.length === 0) { setErr('Agrega al menos un producto.'); return; }
        const items = validas.map((r) => ({
            producto: r.producto.trim(),
            unidades: udsDe(r),
            piezas: pzsDe(r),
            pesoKg: Number(r.pesoKg) || 0,
            tipo: r.tipo || 'offline',
            link: r.referencia?.trim() || null,
            costoCompra: Number(r.costoCompra) || 0,
            precioVenta: Number(r.precioVenta) || 0,
            imagenUrl: r.imagenUrl || null,
        }));
        setSaving(true);
        try {
            const r = await fetch(`${API_URL}/cotizaciones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ nombre: nombreFinal, items, tipoCambio: Number(tipoCambio) || undefined }),
            });
            if (!r.ok) {
                const e = await r.json().catch(() => ({}));
                throw new Error(e.error || 'No se pudo crear');
            }
            const detalle = await r.json();
            onCreated(detalle.id);
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={tryClose}>
            <div className="w-full max-w-5xl rounded-panel bg-surface border border-line shadow-pop max-h-[92vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                    <div>
                        <h3 className="font-semibold text-ink">Nueva cotización</h3>
                        <p className="text-xs text-muted mt-0.5">Captura los productos. Offline = compra presencial · Online = pega el link de compra.</p>
                    </div>
                    <button onClick={tryClose} className="p-1.5 rounded-control text-muted hover:bg-raised cursor-pointer">
                        <Icon path={Ico.x} className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 overflow-auto space-y-4">
                    {err && <div className="text-sm text-bad bg-bad-soft rounded-control px-3 py-2">{err}</div>}

                    <div className="flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[240px]">
                            <label className="block text-xs font-medium text-muted mb-1.5">Nombre de la cotización <span className="opacity-60">(automático, editable)</span></label>
                            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Ej: Pedido enero 2026" />
                        </div>
                        <div className="w-48">
                            <label className="block text-xs font-medium text-muted mb-1.5">Tipo de cambio (¥→$)</label>
                            <div className="relative">
                                <input type="text" inputMode="decimal" value={tipoCambio}
                                    onChange={(e) => setTipoCambio(e.target.value.replace(/[^0-9.]/g, ''))}
                                    className="field pr-16" placeholder="0.13" />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">
                                    {fxLoading ? '…' : 'MXN/¥'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1180px]">
                            <thead>
                                <tr className="text-xs text-muted uppercase tracking-wide">
                                    <th className="text-left font-medium pb-2 pr-2">Producto</th>
                                    <th className="text-center font-medium pb-2 px-2 w-24">Uds.</th>
                                    <th className="text-center font-medium pb-2 px-2 w-24">Pzs.</th>
                                    <th className="text-right font-medium pb-2 px-2 w-24">Peso (kg)</th>
                                    <th className="text-left font-medium pb-2 px-2 w-36">Tipo</th>
                                    <th className="text-left font-medium pb-2 px-2">Dónde / Link</th>
                                    <th className="text-right font-medium pb-2 px-2 w-32">Compra (¥)</th>
                                    <th className="text-right font-medium pb-2 px-2 w-32">Venta ($)</th>
                                    <th className="text-right font-medium pb-2 px-2 w-20">% Gan.</th>
                                    <th className="pb-2 pl-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const pct = gananciaPct(r.costoCompra, r.precioVenta, tipoCambio);
                                    const filled = r.producto.trim();
                                    return (
                                        <tr key={r.key}>
                                            <td className="py-1 pr-2">
                                                <div className="flex items-center gap-2">
                                                    <label className="w-9 h-9 rounded-control border border-line bg-raised overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:border-accent/40 transition-colors"
                                                        title="Subir imagen">
                                                        {r.uploading
                                                            ? <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                                                            : r.imagenUrl
                                                                ? <img src={r.imagenUrl} alt="" className="w-full h-full object-cover" />
                                                                : <Icon path={Ico.image} className="w-4 h-4 text-muted" />}
                                                        <input type="file" accept="image/*" className="hidden"
                                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRowImg(r.key, f); e.target.value = ''; }} />
                                                    </label>
                                                    <input value={r.producto} onChange={(e) => update(r.key, 'producto', e.target.value)}
                                                        onPaste={(e) => onPasteProducto(e, r.key)} className="field" placeholder="Producto" />
                                                </div>
                                            </td>
                                            <td className="py-1 px-2">
                                                <Uds value={r.unidades} onChange={(v) => update(r.key, 'unidades', v)} />
                                            </td>
                                            <td className="py-1 px-2">
                                                <Uds value={r.piezas} onChange={(v) => update(r.key, 'piezas', v)} />
                                            </td>
                                            <td className="py-1 px-2">
                                                <Num value={r.pesoKg} onChange={(v) => update(r.key, 'pesoKg', v)} symbol="kg" placeholder="0.0" />
                                            </td>
                                            <td className="py-1 px-2">
                                                <div className="flex gap-1">
                                                    {['offline', 'online'].map((t) => (
                                                        <button key={t} type="button" onClick={() => update(r.key, 'tipo', t)}
                                                            className={`flex-1 px-1.5 py-2 rounded-control text-xs font-semibold border transition-colors cursor-pointer
                                                                ${r.tipo === t ? 'bg-accent-soft text-accent border-accent/30' : 'bg-raised text-muted border-line hover:text-ink'}`}>
                                                            {t === 'online' ? 'Online' : 'Offline'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-1 px-2">
                                                {r.tipo === '' ? (
                                                    <div className="text-xs text-muted px-1 py-2 italic">Elige tipo…</div>
                                                ) : (
                                                    <input value={r.referencia} onChange={(e) => update(r.key, 'referencia', e.target.value)}
                                                        className="field"
                                                        placeholder={r.tipo === 'online' ? 'https://…' : '¿Dónde se compra? (ej: local, tianguis)'} />
                                                )}
                                            </td>
                                            <td className="py-1 px-2">
                                                <Num value={r.costoCompra} onChange={(v) => update(r.key, 'costoCompra', v)} symbol="¥" />
                                            </td>
                                            <td className="py-1 px-2">
                                                <Num value={r.precioVenta} onChange={(v) => update(r.key, 'precioVenta', v)} symbol="$" />
                                            </td>
                                            <td className="py-1 px-2 text-right tabular">
                                                {filled ? <span className={pct >= 0 ? 'text-ok' : 'text-bad'}>{pct}%</span> : <span className="text-muted">—</span>}
                                            </td>
                                            <td className="py-1 pl-2">
                                                <button onClick={() => removeRow(r.key)} disabled={rows.length <= 1}
                                                    className="p-1.5 rounded-control text-muted hover:text-bad hover:bg-bad-soft cursor-pointer transition-colors disabled:opacity-30">
                                                    <Icon path={Ico.trash} className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => addRows(1)} className="btn-secondary flex items-center gap-1.5 text-sm">
                            <Icon path={Ico.plus} className="w-4 h-4" /> Agregar fila
                        </button>
                        <button onClick={() => addRows(5)} className="btn-secondary text-sm">+5 filas</button>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-line">
                    <div className="text-xs text-muted">
                        {validas.length} producto{validas.length === 1 ? '' : 's'}
                        {totalUnidades !== validas.length && ` · ${totalUnidades} uds`}
                        {totalPiezas !== totalUnidades && ` · ${totalPiezas} pzs`}
                        {totalPesoKg > 0 && ` · ~${fmtPeso(totalPesoKg)}`}
                        {' · '}compra {fmtJPY(totalCompra)} · venta {fmtMXN(totalVenta)}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={tryClose} className="btn-secondary">Cancelar</button>
                        <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                            {saving ? 'Guardando...' : 'Crear cotización'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Confirmación antes de tirar la captura */}
            {confirmClose && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/60"
                    onClick={(e) => { e.stopPropagation(); setConfirmClose(false); }}>
                    <div className="w-full max-w-md rounded-panel bg-surface border border-line shadow-pop p-5 card-in"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start gap-3">
                            <span className="w-10 h-10 rounded-control bg-bad-soft text-bad flex items-center justify-center shrink-0">
                                <Icon path={Ico.alert} className="w-5 h-5" />
                            </span>
                            <div className="min-w-0">
                                <h4 className="font-semibold text-ink">¿Descartar la cotización?</h4>
                                <p className="text-sm text-muted mt-1">
                                    Todavía no se guarda nada. Si sales ahora se pierde <strong className="text-ink">todo lo capturado</strong>
                                    {validas.length > 0 && <> ({validas.length} producto{validas.length === 1 ? '' : 's'})</>} y no se puede recuperar.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setConfirmClose(false)} className="btn-secondary text-sm">Seguir editando</button>
                            <button onClick={onClose} className="btn-primary bg-bad border-bad hover:bg-bad hover:border-bad text-sm">
                                Sí, descartar todo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══ FASE 2 — Panel de detalle ═══════════════════════════════════════════════
function Detalle({ id, authHeaders, onBack, onDeleted }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [itemModal, setItemModal] = useState(null); // null | 'create' | item
    const [editName, setEditName] = useState(false);
    const [nombre, setNombre] = useState('');
    const [sel, setSel] = useState(() => new Set()); // items seleccionados para el PDF
    const [descargando, setDescargando] = useState(false);
    const [selProv, setSelProv] = useState(null); // propuesta de proveedor para los totales
    const [preview, setPreview] = useState(null); // imagen en preview (lightbox)

    const load = useCallback(async () => {
        try {
            const r = await fetch(`${API_URL}/cotizaciones/${id}`, { headers: authHeaders });
            if (r.ok) { const d = await r.json(); setData(d); setNombre(d.nombre); }
        } catch { /* red */ } finally { setLoading(false); }
    }, [id, authHeaders]);

    useEffect(() => { load(); }, [load]);

    // Selección por defecto: la guardada (folio vigente) si existe, si no todos.
    // Al refrescar conserva lo elegido y descarta borrados.
    const initSel = useRef(false);
    useEffect(() => {
        if (!data) return;
        const ids = new Set(data.items.map((i) => i.id));
        setSel((prev) => {
            if (!initSel.current) {
                initSel.current = true;
                const guard = Array.isArray(data.seleccionGuardada)
                    ? data.seleccionGuardada.filter((x) => ids.has(x)) : null;
                return guard && guard.length ? new Set(guard) : ids;
            }
            return new Set([...prev].filter((x) => ids.has(x)));
        });
    }, [data]);

    // Realce corto sobre la fila recién marcada/desmarcada: en tablas largas
    // dice cuál cambió sin tener que buscar el checkbox con la vista.
    const [hit, setHit] = useState(null);
    const hitTimer = useRef();
    useEffect(() => () => clearTimeout(hitTimer.current), []);
    const flashRow = (id2) => {
        setHit(id2);
        clearTimeout(hitTimer.current);
        hitTimer.current = setTimeout(() => setHit(null), 450);
    };

    const toggleSel = (id2) => {
        flashRow(id2);
        setSel((s) => { const n = new Set(s); n.has(id2) ? n.delete(id2) : n.add(id2); return n; });
    };
    const toggleAll = () => setSel((s) => (s.size === data.items.length ? new Set() : new Set(data.items.map((i) => i.id))));

    async function saveNombre() {
        setEditName(false);
        if (!nombre.trim() || nombre === data.nombre) { setNombre(data.nombre); return; }
        await fetch(`${API_URL}/cotizaciones/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ nombre: nombre.trim() }),
        });
        load();
    }

    async function delItem(itemId) {
        if (!confirm('¿Eliminar producto?')) return;
        const r = await fetch(`${API_URL}/cotizaciones/${id}/items/${itemId}`, { method: 'DELETE', headers: authHeaders });
        if (r.ok) setData(await r.json());
    }

    async function delCotiz() {
        if (!confirm('¿Eliminar toda la cotización? Se borran productos y proveedores.')) return;
        const r = await fetch(`${API_URL}/cotizaciones/${id}`, { method: 'DELETE', headers: authHeaders });
        if (r.ok) onDeleted();
    }

    if (loading) return <Spinner />;
    if (!data) return (
        <div>
            <button onClick={onBack} className="btn-secondary flex items-center gap-2 mb-4"><Icon path={Ico.back} className="w-4 h-4" /> Volver</button>
            <div className="panel p-6 text-sm text-bad">No se pudo cargar la cotización.</div>
        </div>
    );

    // Totales calculados SOLO con los productos seleccionados (checkboxes), no
    // con todo el pedido — así las métricas siguen a la selección de la cotización.
    // compraLinea / ventaLinea ya vienen con las unidades multiplicadas.
    const selItems = data.items.filter((i) => sel.has(i.id));
    const totalCompraJPY = selItems.reduce((s, i) => s + (i.compraLinea ?? i.costoCompra), 0);
    const totalCompraMXN = totalCompraJPY * data.tipoCambio;
    const totalVentaMXN = selItems.reduce((s, i) => s + (i.ventaLinea ?? i.precioVenta), 0);
    const totalUnidades = selItems.reduce((s, i) => s + (i.unidades ?? 1), 0);
    const totalPiezas = selItems.reduce((s, i) => s + (i.piezasLinea ?? (i.unidades ?? 1) * (i.piezas ?? 1)), 0);
    const totalPesoKg = Math.round(selItems.reduce((s, i) => s + (i.pesoLinea ?? (i.unidades ?? 1) * (i.pesoKg ?? 0)), 0) * 1000) / 1000;
    // Si hay una propuesta de proveedor seleccionada, el costo pasa a ser su total.
    const provSel = selProv ? data.proveedores.find((p) => p.id === selProv) : null;
    const compraMXN = provSel ? provSel.totalMXN : totalCompraMXN;
    const gananciaMonto = totalVentaMXN - compraMXN;
    const gananciaPorc = compraMXN > 0 ? Math.round(((totalVentaMXN - compraMXN) / compraMXN) * 1000) / 10 : 0;
    // Neta: el costo de verdad es la compra por K (envio + fees + impuestos), asi
    // que la utilidad real es lo que sobra despues de ese sobrecosto. El % sale
    // de la misma formula que ya usaban las filas, para que no se contradigan.
    // Sin costo de compra la razon no existe (division entre 0): gananciaPct ya
    // devuelve 0 y gananciaNetaPct(0) daria -56.9%, que contradiria al monto.
    // Con seleccion vacia se muestra 0, no una perdida inventada.
    const costoRealMXN = compraMXN * K_SOBRECOSTO;
    const gananciaNetaMonto = totalVentaMXN - costoRealMXN;
    const gananciaNetaPorc = compraMXN > 0 ? gananciaNetaPct(gananciaPorc) : 0;

    return (
        <div>
            <button onClick={onBack} className="btn-secondary flex items-center gap-2 mb-4 text-sm">
                <Icon path={Ico.back} className="w-4 h-4" /> Volver a cotizaciones
            </button>

            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0">
                    {editName ? (
                        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
                            onBlur={saveNombre} onKeyDown={(e) => e.key === 'Enter' && saveNombre()}
                            className="field text-xl font-bold max-w-md" />
                    ) : (
                        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
                            {data.nombre}
                            <button onClick={() => setEditName(true)} className="text-muted hover:text-ink cursor-pointer">
                                <Icon path={Ico.pencil} className="w-4 h-4" />
                            </button>
                        </h1>
                    )}
                    <p className="text-sm text-muted mt-0.5">{data.items.length} productos · {data.proveedores.length} proveedores</p>
                </div>
                <button onClick={delCotiz} className="btn-secondary text-bad hover:bg-bad-soft flex items-center gap-2 text-sm shrink-0">
                    <Icon path={Ico.trash} className="w-4 h-4" /> Eliminar
                </button>
            </div>

            {/* Tipo de cambio */}
            <TipoCambioBar cotizId={id} authHeaders={authHeaders} tipoCambio={data.tipoCambio} onChanged={load} />

            {/* Aviso cuando los totales usan una propuesta de proveedor */}
            {provSel && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-control bg-accent-soft border border-accent/30 px-4 py-2">
                    <span className="text-sm text-accent">
                        Totales calculados con la propuesta de <strong>{provSel.nombre}</strong> ({(provSel.moneda === 'JPY' ? fmtJPY : fmtMXN)(provSel.total)})
                    </span>
                    <button onClick={() => setSelProv(null)} className="text-xs text-accent hover:underline cursor-pointer shrink-0">Quitar</button>
                </div>
            )}

            {/* Totales de la SELECCIÓN de productos */}
            <p className="text-xs text-muted mb-2 text-center">
                Totales de <strong className="text-ink">{selItems.length}</strong> de {data.items.length} productos seleccionados
                {totalUnidades !== selItems.length && <> · <strong className="text-ink">{totalUnidades}</strong> unidades</>}
                {totalPiezas !== totalUnidades && <> · <strong className="text-ink">{totalPiezas}</strong> piezas</>}
                {selItems.length < data.items.length && <span className="text-warn"> · marca todos para el total del pedido completo</span>}
            </p>
            {/* Ya son 7-8 metricas: en una sola fila salen ilegibles, asi que se
                deja que envuelvan en filas de 4. */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                {/* Costo de compra de referencia (siempre visible) */}
                <StatCard icon={Ico.cart} label="Costo compra (ref.)"
                    value={<AnimNum value={totalCompraJPY} format={fmtJPY} />}
                    sub={<>≈ <AnimNum value={totalCompraMXN} format={fmtMXN} /></>} />
                {provSel && (
                    <StatCard icon={Ico.store} label={`Costo — ${provSel.nombre}`}
                        value={<AnimNum value={provSel.total} format={provSel.moneda === 'JPY' ? fmtJPY : fmtMXN} />}
                        sub={<>≈ <AnimNum value={provSel.totalMXN} format={fmtMXN} /></>} />
                )}
                <StatCard icon={Ico.cash} label="Precio de venta"
                    value={<AnimNum value={totalVentaMXN} format={fmtMXN} />} sub="total en pesos" />
                <StatCard icon={Ico.peso} label="Peso aprox."
                    value={<AnimNum value={totalPesoKg} format={fmtPeso} />}
                    sub={totalPesoKg > 0
                        ? `${totalPiezas} artículo${totalPiezas === 1 ? '' : 's'}`
                        : 'captura el peso en cada producto'} />

                <StatCard icon={Ico.trend} label="Ganancia proyectada"
                    value={<AnimNum value={gananciaMonto} format={fmtMXN} />} sub="bruta (app)"
                    tone={gananciaMonto >= 0 ? 'ok' : 'bad'} />
                <StatCard icon={Ico.percent} label="% Ganancia proyectada"
                    value={<AnimNum value={gananciaPorc} format={fmtPct} />}
                    color={semaforo(gananciaPorc).color} sub="bruta (app)"
                    right={semaforo(gananciaPorc).label} rightColor={semaforo(gananciaPorc).color} />
                <StatCard icon={Ico.cash} label="Ganancia neta"
                    value={<AnimNum value={gananciaNetaMonto} format={fmtMXN} />}
                    sub={`real (×${K_SOBRECOSTO})`} tone={gananciaNetaMonto >= 0 ? 'ok' : 'bad'} />
                <StatCard icon={Ico.gauge} label="% Ganancia neta"
                    value={<AnimNum value={gananciaNetaPorc} format={fmtPct} />}
                    sub={`real (×${K_SOBRECOSTO})`} tone={gananciaNetaPorc >= 0 ? 'ok' : 'bad'} />
            </div>

            {/* Productos */}
            <div className="panel overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-ink">Productos</h2>
                        <span className="text-xs text-muted">{sel.size} seleccionado{sel.size === 1 ? '' : 's'} para PDF</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={async () => {
                            setDescargando(true);
                            try {
                                const ids = [...sel];
                                // Registra folio + guarda la selección (20 días).
                                let folioInfo = null;
                                try {
                                    const r = await fetch(`${API_URL}/cotizaciones/${id}/folio`, {
                                        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
                                        body: JSON.stringify({ itemIds: ids }),
                                    });
                                    if (r.ok) folioInfo = await r.json();
                                } catch { /* si falla el folio, igual descarga */ }
                                await descargarPDF(data.nombre, data.items.filter((i) => sel.has(i.id)), authHeaders, folioInfo);
                            } finally { setDescargando(false); }
                        }}
                            disabled={sel.size === 0 || descargando}
                            className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40">
                            <Icon path={Ico.download} className="w-4 h-4" /> {descargando ? 'Generando…' : 'Descargar'}
                        </button>
                        <button onClick={() => setItemModal('create')} className="btn-secondary flex items-center gap-1.5 text-sm">
                            <Icon path={Ico.plus} className="w-4 h-4" /> Agregar producto
                        </button>
                    </div>
                </div>
                {data.items.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted">Sin productos.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[880px]">
                            <thead>
                                <tr className="text-xs text-muted uppercase tracking-wide border-b border-line">
                                    <th className="px-3 py-2.5 w-8">
                                        <input type="checkbox" checked={data.items.length > 0 && sel.size === data.items.length}
                                            onChange={toggleAll} className="accent-accent cursor-pointer" title="Seleccionar todos" />
                                    </th>
                                    <th className="text-left font-medium px-2 py-2.5">Producto</th>
                                    <th className="text-center font-medium px-2 py-2.5">Uds.</th>
                                    <th className="text-center font-medium px-2 py-2.5">Pzs.</th>
                                    <th className="text-right font-medium px-2 py-2.5">Peso</th>
                                    <th className="text-left font-medium px-3 py-2.5">Tipo</th>
                                    <th className="text-right font-medium px-3 py-2.5">Compra (¥)</th>
                                    <th className="text-right font-medium px-3 py-2.5">Venta ($)</th>
                                    <th className="text-right font-medium px-3 py-2.5">% Gan.</th>
                                    <th className="text-right font-medium px-3 py-2.5">% Neta</th>
                                    <th className="px-3 py-2.5 w-20"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.items.map((it) => {
                                    // El % de ganancia es unitario: multiplicar ambos lados por
                                    // las mismas unidades no lo mueve.
                                    const pct = gananciaPct(it.costoCompra, it.precioVenta, data.tipoCambio);
                                    const neta = it.costoCompra > 0 ? gananciaNetaPct(pct) : 0;
                                    const sem = semaforo(pct);
                                    const uds = it.unidades ?? 1;
                                    const compraLinea = it.compraLinea ?? it.costoCompra * uds;
                                    const ventaLinea = it.ventaLinea ?? it.precioVenta * uds;
                                    const pzs = it.piezas ?? 1;
                                    const pzsLinea = it.piezasLinea ?? uds * pzs;
                                    const pesoLinea = it.pesoLinea ?? uds * (it.pesoKg ?? 0);
                                    return (
                                        <tr key={it.id} className={`border-b border-line last:border-0 row-anim ${sel.has(it.id) ? 'row-on' : 'row-off'} ${hit === it.id ? 'row-hit' : ''}`}>
                                            <td className="px-3 py-3">
                                                <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggleSel(it.id)}
                                                    className="accent-accent cursor-pointer" />
                                            </td>
                                            <td className="px-2 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    {it.imagenUrl ? (
                                                        <button onClick={() => setPreview(it.imagenUrl)} title="Ver imagen"
                                                            className="w-9 h-9 rounded-control border border-line overflow-hidden shrink-0 cursor-pointer hover:border-accent/50 transition-colors">
                                                            <img src={it.imagenUrl} alt="" className="w-full h-full object-cover" />
                                                        </button>
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-control border border-line bg-raised flex items-center justify-center shrink-0">
                                                            <Icon path={Ico.image} className="w-4 h-4 text-muted" />
                                                        </div>
                                                    )}
                                                    <span className="font-medium text-ink">{it.producto}</span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 text-center tabular">
                                                <span className={`inline-block min-w-[2rem] px-1.5 py-0.5 rounded-control text-xs font-semibold ${uds > 1 ? 'bg-accent-soft text-accent' : 'text-muted'}`}>
                                                    ×{uds}
                                                </span>
                                            </td>
                                            <td className="px-2 py-3 text-center tabular">
                                                <span className={`inline-block min-w-[2rem] px-1.5 py-0.5 rounded-control text-xs font-semibold ${pzs > 1 ? 'bg-accent-soft text-accent' : 'text-muted'}`}>
                                                    {pzs}
                                                </span>
                                                {pzsLinea !== pzs && (
                                                    <span className="block text-[10px] text-muted">{pzsLinea} art.</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-3 text-right tabular text-xs text-muted">
                                                {fmtPeso(pesoLinea)}
                                            </td>
                                            <td className="px-3 py-3">
                                                {it.tipo === 'online' ? (
                                                    it.link
                                                        ? <a href={it.link} target="_blank" rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
                                                            <Icon path={Ico.link} className="w-3.5 h-3.5" /> Online
                                                          </a>
                                                        : <span className="text-accent text-xs">Online</span>
                                                ) : (
                                                    <span className="text-muted text-xs">
                                                        Offline{it.link ? <span className="text-ink"> · {it.link}</span> : ''}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular text-ink">
                                                {fmtJPY(it.costoCompra)}
                                                {uds > 1 && (
                                                    <span className="block text-xs font-semibold text-ink">×{uds} = {fmtJPY(compraLinea)}</span>
                                                )}
                                                <span className="block text-xs text-muted">≈ {fmtMXN(compraLinea * data.tipoCambio)}</span>
                                            </td>
                                            <td className="px-3 py-3 text-right tabular text-ink">
                                                {fmtMXN(it.precioVenta)}
                                                {uds > 1 && (
                                                    <span className="block text-xs font-semibold text-ink">×{uds} = {fmtMXN(ventaLinea)}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular">
                                                <AnimNum value={pct} format={fmtPct} className="font-semibold" style={{ color: sem.color }} />
                                                <span className="block text-[10px] font-semibold" style={{ color: sem.color, transition: 'color 400ms ease' }}>{sem.label}</span>
                                            </td>
                                            <td className="px-3 py-3 text-right tabular">
                                                <AnimNum value={neta} format={fmtPct} className={`transition-colors duration-300 ${neta >= 0 ? 'text-ok' : 'text-bad'}`} />
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex gap-1 justify-end">
                                                    <button onClick={() => setItemModal(it)} className="p-1.5 rounded-control text-muted hover:text-ink hover:bg-raised cursor-pointer transition-colors">
                                                        <Icon path={Ico.pencil} className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => delItem(it.id)} className="p-1.5 rounded-control text-bad hover:bg-bad-soft cursor-pointer transition-colors">
                                                        <Icon path={Ico.trash} className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Proveedores */}
            <ProveedoresEditor
                cotizId={id}
                authHeaders={authHeaders}
                tipoCambio={data.tipoCambio}
                proveedores={data.proveedores}
                items={data.items}
                selProv={selProv}
                currentSelIds={[...sel]}
                onSelectProv={(pid) => {
                    const allIds = data.items.map((i) => i.id);
                    setSelProv((cur) => {
                        if (cur === pid) {
                            // Deseleccionar propuesta -> marcar todos (para los %).
                            setSel(new Set(allIds));
                            return null;
                        }
                        // Seleccionar propuesta -> marcar solo sus productos.
                        const prov = data.proveedores.find((p) => p.id === pid);
                        const scope = (prov?.itemIds || []).filter((x) => allIds.includes(x));
                        setSel(new Set(scope.length ? scope : allIds));
                        return pid;
                    });
                }}
                onSaved={(d) => { setData(d); setSelProv(null); }}
            />

            {itemModal && (
                <ItemModal
                    cotizId={id}
                    authHeaders={authHeaders}
                    tipoCambio={data.tipoCambio}
                    item={itemModal === 'create' ? null : itemModal}
                    onClose={() => setItemModal(null)}
                    onSaved={(d) => { setData(d); setItemModal(null); }}
                />
            )}

            {/* Preview de imagen (lightbox) */}
            {preview && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-ink/80" onClick={() => setPreview(null)}>
                    <img src={preview} alt="" className="max-w-full max-h-full rounded-panel shadow-pop object-contain"
                        onClick={(e) => e.stopPropagation()} />
                    <button onClick={() => setPreview(null)}
                        className="absolute top-4 right-4 p-2 rounded-control bg-surface/90 text-ink hover:bg-surface cursor-pointer shadow-panel">
                        <Icon path={Ico.x} className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
}

// Tarjeta de métrica: icono + label arriba, valor grande, y una línea inferior
// con descripción (izq) y un dato/etiqueta a la derecha.
function StatCard({ icon, label, value, sub, right, rightColor, color, tone = 'ink' }) {
    const valueCls = color ? '' : (tone === 'ink' ? 'text-ink' : `text-${tone}`);
    return (
        <div className="panel p-4">
            <div className="flex items-center gap-2 mb-2.5">
                {icon && (
                    <span className="w-7 h-7 rounded-control bg-raised flex items-center justify-center text-muted shrink-0">
                        <Icon path={icon} className="w-4 h-4" />
                    </span>
                )}
                <span className="text-[11px] font-semibold text-ink uppercase tracking-wide truncate">{label}</span>
            </div>
            <p className={`text-2xl font-bold leading-none transition-colors duration-300 ${valueCls}`}
                style={color ? { color, transition: 'color 400ms ease' } : undefined}>{value}</p>
            {(sub || right) && (
                <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-[11px] text-muted truncate">{sub}</span>
                    {right && <span className="text-[11px] font-semibold shrink-0"
                        style={rightColor ? { color: rightColor, transition: 'color 400ms ease' } : undefined}>{right}</span>}
                </div>
            )}
        </div>
    );
}

// Barra de tipo de cambio: editable + botón para traer la tasa en vivo.
function TipoCambioBar({ cotizId, authHeaders, tipoCambio, onChanged }) {
    const [val, setVal] = useState(String(tipoCambio));
    const [busy, setBusy] = useState(false);
    useEffect(() => setVal(String(tipoCambio)), [tipoCambio]);

    async function persist(v) {
        const n = Number(v);
        if (!n || n <= 0 || n === tipoCambio) return;
        setBusy(true);
        try {
            await fetch(`${API_URL}/cotizaciones/${cotizId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ tipoCambio: n }),
            });
            onChanged();
        } finally { setBusy(false); }
    }
    async function actualizar() {
        setBusy(true);
        try {
            const r = await fetch(`${API_URL}/cotizaciones/fx`, { headers: authHeaders });
            if (r.ok) { const { rate } = await r.json(); if (rate) { setVal(String(rate)); await persist(rate); } }
        } finally { setBusy(false); }
    }

    return (
        <div className="panel p-4 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-ink">Tipo de cambio</span>
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted">¥1 =</span>
                <div className="w-28"><Num value={val} onChange={setVal} symbol="$" /></div>
                <span className="text-sm text-muted">MXN</span>
            </div>
            <button onClick={() => persist(val)} disabled={busy || Number(val) === tipoCambio} className="btn-secondary text-sm disabled:opacity-50">Aplicar</button>
            <button onClick={actualizar} disabled={busy} className="btn-secondary text-sm">Actualizar tasa</button>
        </div>
    );
}

// ── Modal agregar/editar producto (+ imagen) ─────────────────────────────────
function ItemModal({ cotizId, authHeaders, tipoCambio, item, onClose, onSaved }) {
    const isEdit = !!item;
    const [form, setForm] = useState(() => ({
        producto: item?.producto || '',
        unidades: String(item?.unidades ?? 1),
        piezas: String(item?.piezas ?? 1),
        pesoKg: item?.pesoKg ? String(item.pesoKg) : '',
        tipo: item?.tipo || 'offline',
        link: item?.link || '',
        costoCompra: item ? String(item.costoCompra) : '',
        precioVenta: item ? String(item.precioVenta) : '',
        imagenUrl: item?.imagenUrl || null,
    }));
    const [saving, setSaving] = useState(false);
    const [uploadingImg, setUploadingImg] = useState(false);
    const [err, setErr] = useState('');

    async function save() {
        setErr('');
        if (!form.producto.trim()) { setErr('Falta el nombre del producto.'); return; }
        const body = {
            producto: form.producto.trim(),
            unidades: Math.max(1, parseInt(form.unidades, 10) || 1),
            piezas: Math.max(1, parseInt(form.piezas, 10) || 1),
            pesoKg: Number(form.pesoKg) || 0,
            tipo: form.tipo,
            link: form.link?.trim() || null,
            costoCompra: Number(form.costoCompra) || 0,
            precioVenta: Number(form.precioVenta) || 0,
        };
        setSaving(true);
        try {
            const url = isEdit ? `${API_URL}/cotizaciones/${cotizId}/items/${item.id}` : `${API_URL}/cotizaciones/${cotizId}/items`;
            const r = await fetch(url, {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify(body),
            });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'No se pudo guardar'); }
            onSaved(await r.json());
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function uploadImagen(file) {
        if (!file || !isEdit) return;
        setUploadingImg(true); setErr('');
        try {
            const fd = new FormData();
            fd.append('imagen', file);
            const r = await fetch(`${API_URL}/cotizaciones/${cotizId}/items/${item.id}/imagen`, { method: 'POST', headers: authHeaders, body: fd });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'No se pudo subir'); }
            const d = await r.json();
            const updated = d.items.find((i) => i.id === item.id);
            setForm((f) => ({ ...f, imagenUrl: updated?.imagenUrl || null }));
            onSaved(d);
        } catch (e) {
            setErr(e.message);
        } finally {
            setUploadingImg(false);
        }
    }

    async function removeImagen() {
        if (!isEdit) return;
        setUploadingImg(true);
        try {
            const r = await fetch(`${API_URL}/cotizaciones/${cotizId}/items/${item.id}/imagen`, { method: 'DELETE', headers: authHeaders });
            if (r.ok) { const d = await r.json(); setForm((f) => ({ ...f, imagenUrl: null })); onSaved(d); }
        } finally { setUploadingImg(false); }
    }

    const pct = gananciaPct(form.costoCompra, form.precioVenta, tipoCambio);
    const uds = Math.max(1, parseInt(form.unidades, 10) || 1);
    const pzs = Math.max(1, parseInt(form.piezas, 10) || 1);
    const pesoTotal = uds * (Number(form.pesoKg) || 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={onClose}>
            <div className="w-full max-w-lg rounded-panel bg-surface border border-line shadow-pop max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
                    <h3 className="font-semibold text-ink">{isEdit ? 'Editar producto' : 'Agregar producto'}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-control text-muted hover:bg-raised cursor-pointer"><Icon path={Ico.x} className="w-4 h-4" /></button>
                </div>

                <div className="p-5 space-y-5">
                    {err && <div className="text-sm text-bad bg-bad-soft rounded-control px-3 py-2">{err}</div>}

                    {isEdit && (
                        <section>
                            <SectionTitle>Imagen</SectionTitle>
                            <div className="flex items-center gap-4">
                                <div className="w-24 h-24 rounded-control border border-line bg-raised overflow-hidden flex items-center justify-center shrink-0">
                                    {form.imagenUrl ? <img src={form.imagenUrl} alt="" className="w-full h-full object-cover" /> : <Icon path={Ico.image} className="w-8 h-8 text-muted" />}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className={`btn-secondary text-sm cursor-pointer text-center ${uploadingImg ? 'opacity-60 pointer-events-none' : ''}`}>
                                        {uploadingImg ? 'Subiendo...' : form.imagenUrl ? 'Cambiar imagen' : 'Subir imagen'}
                                        <input type="file" accept="image/*" className="hidden"
                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImagen(f); e.target.value = ''; }} />
                                    </label>
                                    {form.imagenUrl && <button onClick={removeImagen} disabled={uploadingImg} className="text-xs text-bad hover:underline cursor-pointer disabled:opacity-50">Quitar imagen</button>}
                                </div>
                            </div>
                        </section>
                    )}

                    <Field label="Producto">
                        <input value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })} className="field" placeholder="Ej: One Piece Vol. 1" />
                    </Field>

                    <Field label="Tipo de compra">
                        <div className="flex gap-2">
                            {['offline', 'online'].map((t) => (
                                <button key={t} type="button" onClick={() => setForm({ ...form, tipo: t })}
                                    className={`flex-1 px-3 py-2 rounded-control text-sm font-semibold border transition-colors cursor-pointer
                                        ${form.tipo === t ? 'bg-accent-soft text-accent border-accent/30' : 'bg-raised text-muted border-line hover:text-ink'}`}>
                                    {t === 'online' ? 'Online (con link)' : 'Offline (presencial)'}
                                </button>
                            ))}
                        </div>
                    </Field>

                    <Field label={form.tipo === 'online' ? 'Link de compra' : '¿Dónde se compra?'}>
                        <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className="field"
                            placeholder={form.tipo === 'online' ? 'https://…' : 'Ej: Tianguis del Chopo, local 5'} />
                    </Field>

                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Unidades"><Uds value={form.unidades} onChange={(v) => setForm({ ...form, unidades: v })} /></Field>
                        <Field label="Piezas por unidad"><Uds value={form.piezas} onChange={(v) => setForm({ ...form, piezas: v })} /></Field>
                        <Field label="Peso aprox. por unidad (kg)">
                            <Num value={form.pesoKg} onChange={(v) => setForm({ ...form, pesoKg: v })} symbol="kg" placeholder="0.0" />
                        </Field>
                    </div>
                    <p className="text-xs text-muted -mt-1">
                        <strong className="text-ink">Unidades</strong>: cuántas veces compras este renglón ·{' '}
                        <strong className="text-ink">Piezas</strong>: cuántos artículos trae cada uno (paquetes).
                        Los precios son por unidad completa, así que las piezas no cambian el costo.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Costo de compra (¥)"><Num value={form.costoCompra} onChange={(v) => setForm({ ...form, costoCompra: v })} symbol="¥" /></Field>
                        <Field label="Precio de venta ($)"><Num value={form.precioVenta} onChange={(v) => setForm({ ...form, precioVenta: v })} symbol="$" /></Field>
                    </div>

                    {(Number(form.costoCompra) > 0 || Number(form.precioVenta) > 0) && (
                        <div className="rounded-panel p-4 bg-raised border border-line space-y-1">
                            <Row label="Compra en pesos (pieza)" value={fmtMXN((Number(form.costoCompra) || 0) * (Number(tipoCambio) || 0))} sub={`¥ × ${tipoCambio}`} />
                            {uds > 1 && (
                                <>
                                    <Row label={`Compra total (×${uds})`} value={fmtJPY((Number(form.costoCompra) || 0) * uds)}
                                        sub={`≈ ${fmtMXN((Number(form.costoCompra) || 0) * uds * (Number(tipoCambio) || 0))}`} bold />
                                    <Row label={`Venta total (×${uds})`} value={fmtMXN((Number(form.precioVenta) || 0) * uds)} bold />
                                </>
                            )}
                            {pzs > 1 && <Row label="Artículos que llegan" value={`${uds * pzs}`} sub={`${uds} × ${pzs} pzs`} />}
                            {pesoTotal > 0 && <Row label="Peso aproximado" value={fmtPeso(pesoTotal)} sub={uds > 1 ? `${fmtPeso(Number(form.pesoKg) || 0)} × ${uds}` : undefined} />}
                            <Row label="% Ganancia" value={`${pct}%`} bold tone={pct >= 0 ? 'ok' : 'bad'} />
                        </div>
                    )}
                </div>

                <div className="flex gap-2 px-5 pb-5">
                    <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                    <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-60">{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </div>
        </div>
    );
}

// ── Editor de proveedores (con conceptos / segmentaciones) ───────────────────
function ProveedoresEditor({ cotizId, authHeaders, tipoCambio, proveedores, items, selProv, onSelectProv, currentSelIds, onSaved }) {
    const rate = Number(tipoCambio) || 0;
    const nextKey = useRef(1);
    const [showAdd, setShowAdd] = useState(false);
    const fromServer = () => proveedores.map((p) => ({
        key: nextKey.current++,
        serverId: p.id, // id guardado (para usar la propuesta en los totales)
        nombre: p.nombre,
        moneda: p.moneda || 'JPY',
        itemIds: Array.isArray(p.itemIds) ? p.itemIds : [], // productos que cubre
        conceptos: p.conceptos.map((c) => ({ key: nextKey.current++, concepto: c.concepto, monto: String(c.monto) })),
    }));
    const [provs, setProvs] = useState(fromServer);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [dirty, setDirty] = useState(false);

    // Resincroniza si el detalle cambió por fuera (p. ej. otro guardado).
    const sig = useMemo(() => JSON.stringify(proveedores), [proveedores]);
    useEffect(() => { setProvs(fromServer()); setDirty(false); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

    const mark = (fn) => { setDirty(true); fn(); };

    // Borrado en dos tiempos: primero la tarjeta/renglón se desvanece, y cuando
    // termina la animación se saca del estado. `nextKey` es un contador único
    // para proveedores y conceptos, así que un solo Set cubre ambos.
    const [dying, setDying] = useState(() => new Set());
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const fadeOut = (key, after) => {
        setDying((s) => new Set(s).add(key));
        timers.current.push(setTimeout(() => {
            after();
            setDying((s) => { const n = new Set(s); n.delete(key); return n; });
        }, 230));
    };

    // Alta desde el formulario (folio ya cargó los productos que cubre).
    const addFromModal = (draft) => {
        mark(() => setProvs((ps) => [...ps, {
            key: nextKey.current++,
            nombre: draft.nombre,
            moneda: draft.moneda,
            itemIds: draft.itemIds || [],
            conceptos: (draft.conceptos || []).map((c) => ({ key: nextKey.current++, concepto: c.concepto, monto: String(c.monto) })),
        }]));
        setShowAdd(false);
    };
    // Fija el alcance del proveedor a la selección actual de productos.
    const setScope = (key) => mark(() => setProvs((ps) => ps.map((p) => (p.key === key ? { ...p, itemIds: [...(currentSelIds || [])] } : p))));
    const removeProv = (key) => fadeOut(key, () => mark(() => setProvs((ps) => ps.filter((p) => p.key !== key))));
    const updProv = (key, field, value) => mark(() => setProvs((ps) => ps.map((p) => (p.key === key ? { ...p, [field]: value } : p))));
    // Cambiar la moneda CONVIERTE los montos con la tasa (no solo re-etiqueta).
    // ¥→$ multiplica por la tasa; $→¥ divide. Pesos a 2 decimales, yenes enteros.
    const setMoneda = (key, moneda) => mark(() => setProvs((ps) => ps.map((p) => {
        if (p.key !== key || p.moneda === moneda) return p;
        const conv = (v) => {
            const n = Number(v) || 0;
            if (!n || !rate) return v; // sin tasa, no convierte
            const out = moneda === 'MXN' ? n * rate : n / rate;
            return moneda === 'MXN' ? String(Math.round(out * 100) / 100) : String(Math.round(out));
        };
        return { ...p, moneda, conceptos: p.conceptos.map((c) => ({ ...c, monto: conv(c.monto) })) };
    })));
    const addConc = (key) => mark(() => setProvs((ps) => ps.map((p) => (p.key === key ? { ...p, conceptos: [...p.conceptos, { key: nextKey.current++, concepto: '', monto: '' }] } : p))));
    const updConc = (pk, ck, field, value) => mark(() => setProvs((ps) => ps.map((p) => (p.key === pk ? { ...p, conceptos: p.conceptos.map((c) => (c.key === ck ? { ...c, [field]: value } : c)) } : p))));
    const removeConc = (pk, ck) => fadeOut(ck, () => mark(() => setProvs((ps) => ps.map((p) => (p.key === pk ? { ...p, conceptos: p.conceptos.filter((c) => c.key !== ck) } : p)))));

    const totalOf = (p) => p.conceptos.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    const totalMXNof = (p) => (p.moneda === 'JPY' ? totalOf(p) * rate : totalOf(p));
    const validCount = provs.filter((p) => p.nombre.trim()).length;
    const minTotalMXN = Math.min(...provs.filter((p) => p.nombre.trim()).map(totalMXNof));

    async function save() {
        setErr('');
        const payload = provs
            .filter((p) => p.nombre.trim())
            .map((p) => ({
                nombre: p.nombre.trim(),
                moneda: p.moneda === 'MXN' ? 'MXN' : 'JPY',
                itemIds: Array.isArray(p.itemIds) ? p.itemIds : [],
                conceptos: p.conceptos
                    .filter((c) => c.concepto.trim())
                    .map((c) => ({ concepto: c.concepto.trim(), monto: Number(c.monto) || 0 })),
            }));
        setSaving(true);
        try {
            const r = await fetch(`${API_URL}/cotizaciones/${cotizId}/proveedores`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ proveedores: payload }),
            });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'No se pudo guardar'); }
            const d = await r.json();
            onSaved(d);
            setDirty(false);
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="panel overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Icon path={Ico.store} className="w-4 h-4 text-muted" />
                    <h2 className="font-semibold text-ink">Proveedores</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowAdd(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
                        <Icon path={Ico.plus} className="w-4 h-4" /> Proveedor
                    </button>
                    <button onClick={save} disabled={saving || !dirty} className="btn-primary text-sm disabled:opacity-50">
                        {saving ? 'Guardando...' : dirty ? 'Guardar cambios' : 'Guardado'}
                    </button>
                </div>
            </div>

            <div className="p-5">
                {err && <div className="text-sm text-bad bg-bad-soft rounded-control px-3 py-2 mb-3">{err}</div>}

                {provs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted">Aún no hay proveedores. Agrega uno para comparar precios.</p>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {provs.map((p) => {
                            const sym = p.moneda === 'JPY' ? '¥' : '$';
                            const fmtNative = p.moneda === 'JPY' ? fmtJPY : fmtMXN;
                            const totalNative = totalOf(p);
                            const totalMXN = totalMXNof(p);
                            const esMejor = p.nombre.trim() && validCount > 1 && totalMXN === minTotalMXN;
                            // Equivalente en la otra moneda para el subtítulo del total.
                            const equiv = p.moneda === 'JPY'
                                ? `≈ ${fmtMXN(totalMXN)}`
                                : (rate > 0 ? `≈ ${fmtJPY(totalNative / rate)}` : '');
                            const enTotales = p.serverId && selProv === p.serverId;
                            return (
                                <div key={p.key} className={`rounded-panel border p-4 transition-colors duration-300 ${dying.has(p.key) ? 'card-out' : 'card-in'} ${enTotales ? 'ring-2 ring-accent ' : ''}${esMejor ? 'border-ok/40 bg-ok-soft/20' : 'border-line bg-raised/40'}`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        {esMejor && <span title="Mejor total (en pesos)" className="text-ok"><Icon path={Ico.star} className="w-4 h-4" /></span>}
                                        <input value={p.nombre} onChange={(e) => updProv(p.key, 'nombre', e.target.value)}
                                            className="field font-semibold flex-1" placeholder="Nombre del proveedor" />
                                        <button onClick={() => removeProv(p.key)} className="p-1.5 rounded-control text-muted hover:text-bad hover:bg-bad-soft cursor-pointer">
                                            <Icon path={Ico.trash} className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between text-xs mb-2">
                                        <span className="text-muted">Cubre {p.itemIds?.length || 0} producto{(p.itemIds?.length || 0) === 1 ? '' : 's'}</span>
                                        <button onClick={() => setScope(p.key)} className="text-accent hover:underline cursor-pointer" title="Usar los productos marcados ahora">
                                            Fijar a selección actual
                                        </button>
                                    </div>

                                    {p.serverId && (
                                        <button onClick={() => onSelectProv(p.serverId)}
                                            className={`w-full mb-3 px-2 py-1.5 rounded-control text-xs font-semibold border cursor-pointer transition-colors
                                                ${enTotales ? 'bg-accent text-accent-ink border-accent' : 'bg-raised text-muted border-line hover:text-ink'}`}>
                                            {enTotales ? '✓ Usando esta propuesta (productos marcados abajo)' : 'Usar esta propuesta en los totales'}
                                        </button>
                                    )}

                                    {/* Moneda del proveedor */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs text-muted">Cotiza en:</span>
                                        <div className="flex gap-1">
                                            {[['JPY', 'Yen ¥'], ['MXN', 'Peso $']].map(([m, lbl]) => (
                                                <button key={m} type="button" onClick={() => setMoneda(p.key, m)}
                                                    className={`px-2.5 py-1 rounded-control text-xs font-semibold border transition-colors cursor-pointer
                                                        ${p.moneda === m ? 'bg-accent-soft text-accent border-accent/30' : 'bg-raised text-muted border-line hover:text-ink'}`}>
                                                    {lbl}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Conceptos / segmentaciones — el total es su suma */}
                                    <div className="space-y-1.5 mt-3">
                                        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Conceptos</p>
                                        {p.conceptos.map((c) => (
                                            <div key={c.key} className={`flex items-center gap-2 ${dying.has(c.key) ? 'line-out' : ''}`}>
                                                <input value={c.concepto} onChange={(e) => updConc(p.key, c.key, 'concepto', e.target.value)}
                                                    className="field flex-1" placeholder="Ej: Envío" />
                                                <div className="w-28"><Num value={c.monto} onChange={(v) => updConc(p.key, c.key, 'monto', v)} symbol={sym} /></div>
                                                <button onClick={() => removeConc(p.key, c.key)} className="p-1.5 rounded-control text-muted hover:text-bad hover:bg-bad-soft cursor-pointer">
                                                    <Icon path={Ico.x} className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <button onClick={() => addConc(p.key)} className="text-xs text-accent hover:underline cursor-pointer flex items-center gap-1 mt-1">
                                            <Icon path={Ico.plus} className="w-3.5 h-3.5" /> Agregar concepto
                                        </button>
                                    </div>

                                    <div className="flex justify-between items-baseline border-t border-line mt-3 pt-2">
                                        <span className="text-sm text-muted">Total</span>
                                        <span className="text-right">
                                            {/* Corto: el total se recalcula mientras se teclea un concepto. */}
                                            <AnimNum value={totalNative} format={fmtNative} duration={260}
                                                className={`text-lg font-bold transition-colors duration-300 ${esMejor ? 'text-ok' : 'text-ink'}`} />
                                            {equiv && <span className="block text-xs text-muted">{equiv}</span>}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showAdd && (
                <AddProveedorModal
                    cotizId={cotizId}
                    authHeaders={authHeaders}
                    items={items}
                    onAdd={addFromModal}
                    onClose={() => setShowAdd(false)}
                />
            )}
        </div>
    );
}

// ── Formulario para registrar un proveedor a partir de un FOLIO ──────────────
// Pide el folio de la cotización; carga los productos que ese folio cotizó y los
// fija como alcance del proveedor. Luego captura nombre, moneda, base y conceptos.
function AddProveedorModal({ cotizId, authHeaders, items, onAdd, onClose }) {
    const nextKey = useRef(1);
    const [folioInput, setFolioInput] = useState('');
    const [loaded, setLoaded] = useState(null); // { folio, itemIds, createdAt }
    const [loadingF, setLoadingF] = useState(false);
    const [nombre, setNombre] = useState('');
    const [moneda, setMoneda] = useState('JPY');
    const [conceptos, setConceptos] = useState([]);
    const [err, setErr] = useState('');

    const sym = moneda === 'JPY' ? '¥' : '$';
    const itemsById = useMemo(() => Object.fromEntries((items || []).map((i) => [i.id, i])), [items]);
    const productosCargados = loaded ? loaded.itemIds.map((id) => itemsById[id]).filter(Boolean) : [];

    async function cargarFolio() {
        const val = String(folioInput).trim();
        if (!val) { setErr('Escribe el folio.'); return; }
        setLoadingF(true); setErr('');
        try {
            const r = await fetch(`${API_URL}/cotizaciones/${cotizId}/folio/${encodeURIComponent(val)}`, { headers: authHeaders });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'No se pudo cargar el folio');
            setLoaded(d);
        } catch (e) { setErr(e.message); setLoaded(null); }
        finally { setLoadingF(false); }
    }

    const addConc = () => setConceptos((cs) => [...cs, { key: nextKey.current++, concepto: '', monto: '' }]);
    const updConc = (k, f, v) => setConceptos((cs) => cs.map((c) => (c.key === k ? { ...c, [f]: v } : c)));
    const rmConc = (k) => setConceptos((cs) => cs.filter((c) => c.key !== k));

    const total = conceptos.reduce((s, c) => s + (Number(c.monto) || 0), 0);

    function agregar() {
        setErr('');
        if (!loaded) { setErr('Primero carga un folio para saber qué productos cubre.'); return; }
        if (!nombre.trim()) { setErr('Falta el nombre del proveedor.'); return; }
        onAdd({
            nombre: nombre.trim(),
            moneda,
            itemIds: loaded.itemIds,
            conceptos: conceptos.filter((c) => c.concepto.trim()).map((c) => ({ concepto: c.concepto.trim(), monto: Number(c.monto) || 0 })),
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={onClose}>
            <div className="w-full max-w-lg rounded-panel bg-surface border border-line shadow-pop max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
                    <div>
                        <h3 className="font-semibold text-ink">Registrar proveedor</h3>
                        <p className="text-xs text-muted mt-0.5">Indica el folio de la cotización que le enviaste.</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-control text-muted hover:bg-raised cursor-pointer"><Icon path={Ico.x} className="w-4 h-4" /></button>
                </div>

                <div className="p-5 space-y-5">
                    {err && <div className="text-sm text-bad bg-bad-soft rounded-control px-3 py-2">{err}</div>}

                    {/* Folio */}
                    <Field label="Folio de la cotización">
                        <div className="flex gap-2">
                            <input value={folioInput} onChange={(e) => setFolioInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && cargarFolio()}
                                className="field flex-1" placeholder="Ej: 45Q3COT0101" />
                            <button onClick={cargarFolio} disabled={loadingF} className="btn-secondary text-sm disabled:opacity-60">
                                {loadingF ? 'Cargando…' : 'Cargar'}
                            </button>
                        </div>
                    </Field>

                    {loaded && (
                        <div className="rounded-panel border border-ok/40 bg-ok-soft/20 p-3">
                            <p className="text-xs font-semibold text-ok mb-1.5">Folio {loaded.folio} · {productosCargados.length} productos</p>
                            <ul className="text-xs text-ink space-y-0.5 max-h-32 overflow-y-auto">
                                {productosCargados.map((p) => <li key={p.id}>• {p.producto}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Datos del proveedor */}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Nombre del proveedor">
                            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Ej: Luis" />
                        </Field>
                        <Field label="Cotiza en">
                            <div className="flex gap-1">
                                {[['JPY', 'Yen ¥'], ['MXN', 'Peso $']].map(([m, lbl]) => (
                                    <button key={m} type="button" onClick={() => setMoneda(m)}
                                        className={`flex-1 px-2 py-2 rounded-control text-xs font-semibold border transition-colors cursor-pointer
                                            ${moneda === m ? 'bg-accent-soft text-accent border-accent/30' : 'bg-raised text-muted border-line hover:text-ink'}`}>
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </div>

                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Conceptos (el total es su suma)</p>
                            <button onClick={addConc} className="text-xs text-accent hover:underline cursor-pointer flex items-center gap-1">
                                <Icon path={Ico.plus} className="w-3.5 h-3.5" /> Agregar
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            {conceptos.map((c) => (
                                <div key={c.key} className="flex items-center gap-2">
                                    <input value={c.concepto} onChange={(e) => updConc(c.key, 'concepto', e.target.value)} className="field flex-1" placeholder="Ej: Envío" />
                                    <div className="w-28"><Num value={c.monto} onChange={(v) => updConc(c.key, 'monto', v)} symbol={sym} /></div>
                                    <button onClick={() => rmConc(c.key)} className="p-1.5 rounded-control text-muted hover:text-bad hover:bg-bad-soft cursor-pointer">
                                        <Icon path={Ico.x} className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            {conceptos.length === 0 && <p className="text-xs text-muted">Sin conceptos extra.</p>}
                        </div>
                    </section>

                    <div className="flex justify-between items-baseline border-t border-line pt-2">
                        <span className="text-sm text-muted">Total</span>
                        <span className="text-lg font-bold text-ink">{(moneda === 'JPY' ? fmtJPY : fmtMXN)(total)}</span>
                    </div>
                </div>

                <div className="flex gap-2 px-5 pb-5">
                    <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                    <button onClick={agregar} disabled={!loaded || !nombre.trim()} className="btn-primary flex-1 disabled:opacity-50">Agregar proveedor</button>
                </div>
            </div>
        </div>
    );
}

// ── Primitivas ───────────────────────────────────────────────────────────────
function Field({ label, children }) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
            {children}
        </div>
    );
}
function SectionTitle({ children }) {
    return <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{children}</p>;
}
// Input de unidades: enteros >= 1, con botones para el caso comun (subir de a
// uno). Se deja escribir libre — incluso vacio — y solo al salir del campo se
// normaliza, para no pelear con quien borra todo para teclear "12".
function Uds({ value, onChange, min = 1, max = 100000 }) {
    const n = parseInt(value, 10);
    const paso = (d) => onChange(String(Math.min(max, Math.max(min, (isNaN(n) ? min : n) + d))));
    return (
        <div className="flex items-stretch rounded-control border border-line bg-raised overflow-hidden">
            <button type="button" onClick={() => paso(-1)} disabled={!isNaN(n) && n <= min}
                className="px-2.5 text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                aria-label="Quitar una unidad">−</button>
            <input type="text" inputMode="numeric" value={value}
                onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => onChange(String(Math.min(max, Math.max(min, parseInt(value, 10) || min))))}
                className="w-full bg-transparent border-0 text-center text-sm tabular text-ink focus:outline-none py-2" />
            <button type="button" onClick={() => paso(1)} disabled={!isNaN(n) && n >= max}
                className="px-2.5 text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                aria-label="Agregar una unidad">+</button>
        </div>
    );
}
// Input de dinero: sin flechas (no type=number), escritura directa, prefijo $.
// Deja solo dígitos y un punto decimal. Devuelve la cadena limpia.
function Num({ value, onChange, placeholder = '0', symbol = '$' }) {
    const clean = (s) => {
        s = String(s).replace(/[^0-9.]/g, '');
        const parts = s.split('.');
        if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
        return s;
    };
    return (
        <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">{symbol}</span>
            <input type="text" inputMode="decimal" value={value}
                onChange={(e) => onChange(clean(e.target.value))}
                className="field pl-6 text-right" placeholder={placeholder} />
        </div>
    );
}
function Row({ label, value, sub, tone, bold }) {
    const cls = tone ? `text-${tone}` : 'text-ink';
    return (
        <div className="flex justify-between items-baseline text-sm">
            <span className="text-muted text-xs">
                {label}{sub && <span className="ml-1 opacity-60" style={{ fontSize: 10 }}>{sub}</span>}
            </span>
            <span className={`${cls} ${bold ? 'font-semibold' : ''}`}>{value}</span>
        </div>
    );
}
