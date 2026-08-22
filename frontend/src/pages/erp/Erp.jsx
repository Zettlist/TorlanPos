import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Modulo ERP (portado del proyecto Next.js "erp-financiero").
// Un solo apartado con dos pestañas internas: Dashboard (rentabilidad) y
// Pedidos (CRUD). Reconstruido sobre el stack del POS: tokens de tema
// rgb(var(--x)), fetch con JWT, sin dependencias nuevas (iconos y graficas en
// SVG inline en vez de lucide-react / recharts).
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABELS = {
    EN_RUTA: 'En Ruta', PROBLEMA_ADUANAS: 'Problema de Aduanas',
    EN_VENTA: 'En Venta', LIQUIDANDO: 'Liquidando',
};
// Cada estado -> par (fondo suave, texto) con tokens del POS.
const STATUS_STYLE = {
    EN_RUTA: 'bg-accent-soft text-accent',
    PROBLEMA_ADUANAS: 'bg-bad-soft text-bad',
    EN_VENTA: 'bg-ok-soft text-ok',
    LIQUIDANDO: 'bg-warn-soft text-warn',
};

const PROVEEDORES = ['Bernart', 'Damian', 'Felix'];

const EMPTY = {
    proveedor: 'Bernart',
    fechaPedido: new Date().toISOString().split('T')[0],
    costoProducto: '', costoEnvio: '', impuestos: '', imprevistos: '',
    totalPiezas: '', piezasVendidas: '', porcentajeGanancia: '',
    status: 'EN_RUTA', notas: '',
};

// Metricas a partir de los campos crudos de un pedido/form.
function calcMetrics(p) {
    const inv = (Number(p.costoProducto) || 0) + (Number(p.costoEnvio) || 0)
        + (Number(p.impuestos) || 0) + (Number(p.imprevistos) || 0);
    const piezas = Number(p.totalPiezas) || 0;
    const vendidas = Number(p.piezasVendidas) || 0;
    const gananciaPorc = Number(p.porcentajeGanancia) || 0;
    const costoUnit = piezas > 0 ? inv / piezas : 0;
    const precioVenta = costoUnit * (1 + gananciaPorc / 100);
    const ingresoEsperado = piezas * precioVenta;
    const ingresoActual = vendidas * precioVenta;
    const gananciaReal = inv > 0 ? ((ingresoActual - inv) / inv) * 100 : 0;
    return { inv, costoUnit, precioVenta, ingresoEsperado, ingresoActual, gananciaReal: Math.round(gananciaReal * 10) / 10 };
}

// ── Iconos (SVG inline, estilo heroicons) ────────────────────────────────────
const Ico = {
    plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />,
    pencil: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
    trash: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
    box: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    trend: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
    wallet: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />,
    bag: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />,
    coins: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
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
export default function Erp() {
    const { token } = useAuth();
    const [tab, setTab] = useState('dashboard');
    const authHeaders = { Authorization: `Bearer ${token}` };

    return (
        <div>
            {/* Encabezado + pestañas internas */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-ink">ERP</h1>
                <p className="text-sm text-muted mt-0.5">Rentabilidad y pedidos a proveedor</p>
            </div>

            <div className="flex gap-1 mb-6 p-1 rounded-control bg-raised w-fit">
                {[['dashboard', 'Dashboard'], ['pedidos', 'Pedidos']].map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-1.5 rounded-control text-sm font-medium transition-colors cursor-pointer
                            ${tab === id ? 'bg-surface text-ink shadow-panel' : 'text-muted hover:text-ink'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'dashboard'
                ? <Dashboard authHeaders={authHeaders} />
                : <Pedidos authHeaders={authHeaders} />}
        </div>
    );
}

// ── Tarjeta de métrica ────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, tone = 'accent' }) {
    return (
        <div className="panel p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-semibold text-ink mt-1 truncate">{value}</p>
                    {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
                </div>
                <div className={`w-10 h-10 rounded-control flex items-center justify-center shrink-0 bg-${tone}-soft text-${tone}`}>
                    <Icon path={icon} />
                </div>
            </div>
        </div>
    );
}

// ═══ DASHBOARD ═══════════════════════════════════════════════════════════════
function Dashboard({ authHeaders }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let vivo = true;
        const load = async () => {
            try {
                const r = await fetch(`${API_URL}/erp/stats`, { headers: authHeaders });
                if (!r.ok) throw new Error();
                const d = await r.json();
                if (vivo) { setData(d); setError(false); }
            } catch {
                if (vivo) setError(true);
            } finally {
                if (vivo) setLoading(false);
            }
        };
        load();
        const t = setInterval(load, 30000); // refresco periodico
        return () => { vivo = false; clearInterval(t); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <Spinner />;
    if (error) return <div className="panel p-6 text-sm text-bad">Error cargando datos del ERP.</div>;

    const d = data || {};
    const gTone = (d.gananciaPorc ?? 0) >= 0 ? 'ok' : 'bad';

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard label="Piezas vendidas" value={String(d.piezasVendidas ?? 0)}
                    sub={`de ${(d.piezasVendidas ?? 0) + (d.piezasFaltantes ?? 0)} totales`} icon={Ico.check} tone="ok" />
                <StatCard label="Faltantes por vender" value={String(d.piezasFaltantes ?? 0)}
                    sub="piezas en inventario" icon={Ico.box} tone="warn" />
                <StatCard label="% Ganancia" value={`${d.gananciaPorc ?? 0}%`}
                    sub="sobre inversión total" icon={Ico.trend} tone={gTone} />
                <StatCard label="Inversión total" value={fmt(d.inversionTotal)}
                    sub="costo de todos los pedidos" icon={Ico.wallet} tone="accent" />
                <StatCard label="Ingreso esperado" value={fmt(d.deberiamos)}
                    sub="si se vende el 100%" icon={Ico.coins} tone="accent" />
                <StatCard label="Ingreso actual" value={fmt(d.ingresoActual)}
                    sub={`${d.pedidosActivos ?? 0} pedidos activos`} icon={Ico.bag} tone="ok" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="panel p-5">
                    <h2 className="text-sm font-medium text-ink mb-4">Inversión vs Ingresos (6 meses)</h2>
                    <BarChart data={d.pedidosPorMes || []} />
                    <div className="flex gap-4 mt-3 text-xs text-muted">
                        <Legend color="rgb(var(--accent))" label="Inversión" />
                        <Legend color="rgb(var(--ok))" label="Ingresos" />
                    </div>
                </div>
                <div className="panel p-5">
                    <h2 className="text-sm font-medium text-ink mb-4">Tendencia de ingresos</h2>
                    <AreaChart data={d.pedidosPorMes || []} />
                </div>
            </div>
        </div>
    );
}

function Legend({ color, label }) {
    return (
        <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} /> {label}
        </span>
    );
}

// ── Gráfica de barras agrupadas (SVG) ────────────────────────────────────────
function BarChart({ data }) {
    const W = 340, H = 180, padB = 24, padT = 8, padL = 4;
    const groups = data.length || 1;
    const max = Math.max(1, ...data.flatMap((m) => [m.inversion, m.ingreso]));
    const gw = (W - padL) / groups;         // ancho por grupo
    const bw = Math.min(16, gw / 3);         // ancho por barra
    const chartH = H - padB - padT;
    const y = (v) => padT + chartH - (v / max) * chartH;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
            {/* rejilla horizontal */}
            {[0, 0.5, 1].map((f) => (
                <line key={f} x1={padL} x2={W} y1={padT + chartH * f} y2={padT + chartH * f}
                    stroke="rgb(var(--line))" strokeDasharray="3 3" />
            ))}
            {data.map((m, i) => {
                const gx = padL + i * gw + gw / 2;
                return (
                    <g key={i}>
                        <rect x={gx - bw - 1} y={y(m.inversion)} width={bw} height={padT + chartH - y(m.inversion)}
                            rx="2" fill="rgb(var(--accent))" />
                        <rect x={gx + 1} y={y(m.ingreso)} width={bw} height={padT + chartH - y(m.ingreso)}
                            rx="2" fill="rgb(var(--ok))" />
                        <text x={gx} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">{m.mes}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// ── Gráfica de área (SVG) ─────────────────────────────────────────────────────
function AreaChart({ data }) {
    const W = 340, H = 180, padB = 24, padT = 8, padX = 6;
    const n = data.length;
    const max = Math.max(1, ...data.map((m) => m.ingreso));
    const chartH = H - padB - padT;
    const x = (i) => padX + (n > 1 ? (i * (W - padX * 2)) / (n - 1) : (W - padX * 2) / 2);
    const y = (v) => padT + chartH - (v / max) * chartH;
    const pts = data.map((m, i) => `${x(i)},${y(m.ingreso)}`);
    const linePath = pts.length ? 'M' + pts.join(' L') : '';
    const areaPath = pts.length ? `M${x(0)},${padT + chartH} L${pts.join(' L')} L${x(n - 1)},${padT + chartH} Z` : '';

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
            <defs>
                <linearGradient id="erpArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
                </linearGradient>
            </defs>
            {[0, 0.5, 1].map((f) => (
                <line key={f} x1={padX} x2={W - padX} y1={padT + chartH * f} y2={padT + chartH * f}
                    stroke="rgb(var(--line))" strokeDasharray="3 3" />
            ))}
            {areaPath && <path d={areaPath} fill="url(#erpArea)" />}
            {linePath && <path d={linePath} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" />}
            {data.map((m, i) => (
                <g key={i}>
                    <circle cx={x(i)} cy={y(m.ingreso)} r="2.5" fill="rgb(var(--accent))" />
                    <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">{m.mes}</text>
                </g>
            ))}
        </svg>
    );
}

// ═══ PEDIDOS ═════════════════════════════════════════════════════════════════
function Pedidos({ authHeaders }) {
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null); // null | 'create' | id
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        try {
            const r = await fetch(`${API_URL}/erp/pedidos`, { headers: authHeaders });
            if (r.ok) setPedidos(await r.json());
        } catch { /* red */ } finally { setLoading(false); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);

    const numFields = ['costoProducto', 'costoEnvio', 'impuestos', 'imprevistos', 'totalPiezas', 'piezasVendidas', 'porcentajeGanancia'];

    function openCreate() { setErr(''); setForm(EMPTY); setModal('create'); }
    function openEdit(p) {
        setErr('');
        setForm({
            ...p,
            fechaPedido: new Date(p.fechaPedido).toISOString().split('T')[0],
            costoProducto: String(p.costoProducto), costoEnvio: String(p.costoEnvio),
            impuestos: String(p.impuestos), imprevistos: String(p.imprevistos),
            totalPiezas: String(p.totalPiezas), piezasVendidas: String(p.piezasVendidas),
            porcentajeGanancia: String(p.porcentajeGanancia), notas: p.notas || '',
        });
        setModal(p.id);
    }

    async function save() {
        setSaving(true); setErr('');
        const body = { ...form };
        for (const f of numFields) body[f] = Number(body[f]) || 0;
        const isEdit = modal !== 'create';
        try {
            const r = await fetch(isEdit ? `${API_URL}/erp/pedidos/${modal}` : `${API_URL}/erp/pedidos`, {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify(body),
            });
            if (!r.ok) {
                const e = await r.json().catch(() => ({}));
                throw new Error(e.error || 'No se pudo guardar');
            }
            setModal(null);
            load();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function del(id) {
        if (!confirm('¿Eliminar pedido?')) return;
        setDeleting(id);
        try {
            await fetch(`${API_URL}/erp/pedidos/${id}`, { method: 'DELETE', headers: authHeaders });
            load();
        } finally { setDeleting(null); }
    }

    const preview = calcMetrics(form);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-ink">Pedidos</h2>
                    <p className="text-sm text-muted mt-0.5">Rentabilidad por pedido</p>
                </div>
                <button onClick={openCreate} className="btn-primary flex items-center gap-2">
                    <Icon path={Ico.plus} className="w-4 h-4" /> Nuevo pedido
                </button>
            </div>

            {loading ? <Spinner /> : pedidos.length === 0 ? (
                <div className="panel p-16 text-center">
                    <div className="w-10 h-10 mx-auto mb-3 text-muted"><Icon path={Ico.box} className="w-10 h-10" /></div>
                    <p className="text-sm text-muted">Sin pedidos registrados</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {pedidos.map((p) => {
                        const m = calcMetrics(p);
                        const pct = p.totalPiezas > 0 ? Math.min(100, (p.piezasVendidas / p.totalPiezas) * 100) : 0;
                        return (
                            <div key={p.id} className="panel p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-ink">{p.proveedor}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[p.status]}`}>
                                                {STATUS_LABELS[p.status]}
                                            </span>
                                            <span className="text-xs text-muted">
                                                {new Date(p.fechaPedido).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4">
                                            <Metric label="Inversión total" value={fmt(m.inv)} />
                                            <Metric label="Costo por unidad" value={fmt(m.costoUnit)} />
                                            <Metric label="Precio de venta c/u" value={fmt(m.precioVenta)} sub={`+${p.porcentajeGanancia}% ganancia`} />
                                            <Metric label="Ingreso actual" value={fmt(m.ingresoActual)}
                                                tone={m.gananciaReal >= 0 ? 'ok' : 'bad'} sub={`${m.gananciaReal}% sobre inversión`} />
                                            <Metric label="Ingreso esperado" value={fmt(m.ingresoEsperado)} />
                                            <Metric label="Diferencia" value={fmt(m.ingresoActual - m.inv)}
                                                tone={m.ingresoActual - m.inv >= 0 ? 'ok' : 'bad'} />
                                        </div>

                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs text-muted mb-1">
                                                <span>Piezas vendidas</span>
                                                <span>{p.piezasVendidas} de {p.totalPiezas} ({p.totalPiezas - p.piezasVendidas} faltantes)</span>
                                            </div>
                                            <div className="h-2 rounded-full overflow-hidden bg-raised">
                                                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>

                                        {p.notas && <p className="text-xs text-muted mt-3 italic">{p.notas}</p>}
                                    </div>

                                    <div className="flex gap-1 shrink-0">
                                        <button onClick={() => openEdit(p)} className="p-2 rounded-control text-muted hover:text-ink hover:bg-raised cursor-pointer transition-colors">
                                            <Icon path={Ico.pencil} className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => del(p.id)} disabled={!!deleting}
                                            className="p-2 rounded-control text-bad hover:bg-bad-soft cursor-pointer transition-colors disabled:opacity-50">
                                            <Icon path={Ico.trash} className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal crear/editar ── */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={() => setModal(null)}>
                    <div className="w-full max-w-lg rounded-panel bg-surface border border-line shadow-pop max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
                            <h3 className="font-semibold text-ink">{modal === 'create' ? 'Nuevo pedido' : 'Editar pedido'}</h3>
                            <button onClick={() => setModal(null)} className="p-1.5 rounded-control text-muted hover:bg-raised cursor-pointer">
                                <Icon path={Ico.x} className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            {err && <div className="text-sm text-bad bg-bad-soft rounded-control px-3 py-2">{err}</div>}

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Proveedor">
                                    <select value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} className="field">
                                        {PROVEEDORES.map((p) => <option key={p}>{p}</option>)}
                                    </select>
                                </Field>
                                <Field label="Fecha de ingreso">
                                    <input type="date" value={form.fechaPedido} onChange={(e) => setForm({ ...form, fechaPedido: e.target.value })} className="field" />
                                </Field>
                            </div>

                            <Field label="Estado">
                                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="field">
                                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                            </Field>

                            <section>
                                <SectionTitle>Costos del pedido</SectionTitle>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Costo del pedido"><Num value={form.costoProducto} onChange={(v) => setForm({ ...form, costoProducto: v })} /></Field>
                                    <Field label="Costo de envío"><Num value={form.costoEnvio} onChange={(v) => setForm({ ...form, costoEnvio: v })} /></Field>
                                    <Field label="Impuestos"><Num value={form.impuestos} onChange={(v) => setForm({ ...form, impuestos: v })} /></Field>
                                    <Field label="Imprevistos"><Num value={form.imprevistos} onChange={(v) => setForm({ ...form, imprevistos: v })} /></Field>
                                </div>
                            </section>

                            <section>
                                <SectionTitle>Piezas</SectionTitle>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Total de piezas"><Num integer value={form.totalPiezas} onChange={(v) => setForm({ ...form, totalPiezas: v })} /></Field>
                                    <Field label="Piezas vendidas"><Num integer value={form.piezasVendidas} onChange={(v) => setForm({ ...form, piezasVendidas: v })} /></Field>
                                </div>
                            </section>

                            <section>
                                <SectionTitle>Precio de venta</SectionTitle>
                                <Field label="% Ganancia sobre costo">
                                    <Num value={form.porcentajeGanancia} onChange={(v) => setForm({ ...form, porcentajeGanancia: v })} placeholder="Ej: 30" />
                                </Field>
                            </section>

                            {(Number(form.costoProducto) > 0 || Number(form.totalPiezas) > 0) && (
                                <div className="rounded-panel p-4 bg-raised border border-line space-y-1">
                                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Cálculo automático</p>
                                    <Row label="Inversión total" value={fmt(preview.inv)} />
                                    <Row label="Costo por unidad" value={fmt(preview.costoUnit)} sub="inversión ÷ piezas" />
                                    <Row label="Precio de venta c/u" value={fmt(preview.precioVenta)} sub={`costo × (1 + ${form.porcentajeGanancia || 0}%)`} bold accent />
                                    <div className="border-t border-line-strong mt-2 pt-2 space-y-1">
                                        <Row label="Ingreso esperado (100%)" value={fmt(preview.ingresoEsperado)} />
                                        <Row label={`Ingreso actual (${form.piezasVendidas || 0} pzas)`} value={fmt(preview.ingresoActual)} />
                                        <Row label="% Ganancia real actual" value={`${preview.gananciaReal}%`} bold tone={preview.gananciaReal >= 0 ? 'ok' : 'bad'} />
                                    </div>
                                </div>
                            )}

                            <Field label="Notas (opcional)">
                                <textarea value={form.notas} rows={2} onChange={(e) => setForm({ ...form, notas: e.target.value })}
                                    className="field resize-none" placeholder="Observaciones..." />
                            </Field>
                        </div>

                        <div className="flex gap-2 px-5 pb-5">
                            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancelar</button>
                            <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
                                {saving ? 'Guardando...' : 'Guardar pedido'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
            {children}
        </div>
    );
}
function SectionTitle({ children }) {
    return <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3 border-t border-line pt-3">{children}</p>;
}
function Num({ value, onChange, integer = false, placeholder = '0' }) {
    return <input type="number" value={value} min="0" step={integer ? '1' : '0.01'}
        onChange={(e) => onChange(e.target.value)} className="field" placeholder={placeholder} />;
}
function Row({ label, value, sub, tone, bold, accent }) {
    const cls = tone ? `text-${tone}` : accent ? 'text-accent' : 'text-ink';
    return (
        <div className="flex justify-between items-baseline text-sm">
            <span className="text-muted text-xs">
                {label}{sub && <span className="ml-1 opacity-60" style={{ fontSize: 10 }}>({sub})</span>}
            </span>
            <span className={`${cls} ${bold ? 'font-semibold' : ''}`}>{value}</span>
        </div>
    );
}
function Metric({ label, value, sub, tone }) {
    const cls = tone ? `text-${tone}` : 'text-ink';
    return (
        <div>
            <p className="text-xs text-muted">{label}</p>
            <p className={`text-sm font-semibold mt-0.5 ${cls}`}>{value}</p>
            {sub && <p className={`text-xs mt-0.5 opacity-80 ${tone ? `text-${tone}` : 'text-muted'}`}>{sub}</p>}
        </div>
    );
}
