import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

const STATUS_CONFIG = {
    pendiente:  { label: 'Pendiente',  bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-400'   },
    confirmado: { label: 'Confirmado', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
    cancelado:  { label: 'Cancelado',  bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-400'     },
};

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendiente;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

function ProcessTypeBadge({ processType, status }) {
    if (!processType || status === 'pendiente') return null;
    const isAuto = processType === 'auto';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            isAuto
                ? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
        }`}>
            {isAuto ? (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ) : (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            )}
            {isAuto ? 'Automático' : 'Manual'}
        </span>
    );
}

function OrderDetailModal({ order, onClose, onConfirm, onCancel }) {
    const [acting, setActing] = useState(false);
    const [resultado, setResultado] = useState(null); // { ok, mensaje }

    const handleConfirm = async () => {
        setActing(true);
        const result = await onConfirm(order.id);
        setResultado(result);
        setActing(false);
    };

    const handleCancel = async () => {
        setActing(true);
        await onCancel(order.id);
        setActing(false);
        onClose();
    };

    const isPendiente = order.web_status === 'pendiente';

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={!acting ? onClose : undefined}>
            <div
                className="bg-slate-800 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-white/10">
                    <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h2 className="text-xl font-bold">Pedido #{order.id}</h2>
                            <StatusBadge status={order.web_status} />
                            <ProcessTypeBadge processType={order.web_process_type} status={order.web_status} />
                        </div>
                        <p className="text-sm text-slate-400">
                            {new Date(order.created_at).toLocaleDateString('es-MX', {
                                day: '2-digit', month: 'long', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </p>
                    </div>
                    <button onClick={onClose} disabled={acting} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Resultado de confirmación */}
                    {resultado && (
                        resultado.stockInsuficiente ? (
                            <div className="rounded-xl p-4 border bg-amber-500/10 border-amber-500/30 text-amber-300">
                                <p className="font-semibold">⚠️ Stock insuficiente — no se confirmó</p>
                                <p className="text-sm mt-1 opacity-80">{resultado.motivo}</p>
                                {resultado.advertencias?.length > 0 && (
                                    <ul className="mt-2 space-y-1">
                                        {resultado.advertencias.map((a, i) => (
                                            <li key={i} className="text-xs opacity-70">• {a}</li>
                                        ))}
                                    </ul>
                                )}
                                <p className="text-xs mt-3 opacity-60">Cancela el pedido manualmente y contacta al cliente para avisar.</p>
                            </div>
                        ) : (
                            <div className={`rounded-xl p-4 border ${resultado.ok
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-red-500/10 border-red-500/30 text-red-300'}`}
                            >
                                <p className="font-semibold">{resultado.ok ? '✅ Pedido confirmado' : '❌ Pedido cancelado automáticamente'}</p>
                                {resultado.motivo && <p className="text-sm mt-1 opacity-80">{resultado.motivo}</p>}
                            </div>
                        )
                    )}

                    {/* Cliente */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cliente</p>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                                {order.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                            </div>
                            <div>
                                <p className="font-medium">{order.nombre} {order.apellido}</p>
                                {order.client_code && <p className="text-xs text-slate-500 font-mono mt-0.5">{order.client_code}</p>}
                            </div>
                        </div>
                        {/* Contacto */}
                        <div className="space-y-2 pt-3 border-t border-white/10">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Contacto</p>
                            <a href={`mailto:${order.email}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors group">
                                <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {order.email}
                            </a>
                            {order.telefono && (
                                <a href={`tel:${order.telefono}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors group">
                                    <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {order.telefono}
                                </a>
                            )}
                            {!order.telefono && (
                                <p className="flex items-center gap-2 text-sm text-slate-500 italic">
                                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    Sin teléfono registrado
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Dirección */}
                    {order.calle && (
                        <div className="bg-white/5 rounded-xl p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Dirección de Entrega</p>
                            <div className="flex gap-3">
                                <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <div className="text-sm space-y-0.5">
                                    {order.nombre_recibe && <p className="font-medium">{order.nombre_recibe}</p>}
                                    <p className="text-slate-300">{order.calle} {order.numero}</p>
                                    <p className="text-slate-400">{order.colonia}, {order.municipio}</p>
                                    <p className="text-slate-400">{order.estado_entrega} CP {order.cp}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Productos */}
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Productos</p>
                        <div className="space-y-2">
                            {order.items?.map((item) => {
                                const stockInsuficiente = isPendiente && item.alcanza === false;
                                return (
                                    <div key={item.id} className={`flex items-center gap-3 rounded-xl p-3 ${stockInsuficiente ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5'}`}>
                                        {item.image_url ? (
                                            <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-white/10" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{item.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="text-xs text-slate-400">x{item.quantity}</span>
                                                {isPendiente && (
                                                    <>
                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${!item.alcanza ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                            Disponible: {item.disponible ?? item.stock}
                                                        </span>
                                                        {item.reservado_anteriores > 0 && (
                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                                                {item.reservado_anteriores} reservado(s) por órdenes anteriores
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-semibold text-sm">${(item.price * item.quantity).toFixed(2)}</p>
                                            <p className="text-xs text-slate-500">${Number(item.price).toFixed(2)} c/u</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Desglose */}
                    <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-slate-400">
                            <span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span>
                        </div>
                        {Number(order.discount) > 0 && (
                            <div className="flex justify-between text-emerald-400">
                                <span>Descuento</span><span>-${Number(order.discount).toFixed(2)}</span>
                            </div>
                        )}
                        {Number(order.surcharge) > 0 && (
                            <div className="flex justify-between text-slate-400">
                                <span>Envío</span><span>${Number(order.surcharge).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-base pt-2 border-t border-white/10">
                            <span>Total</span><span>${Number(order.total).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Acciones (solo para pendientes y sin resultado aún) */}
                    {isPendiente && !resultado && (
                        <div className="flex gap-3">
                            <button
                                onClick={handleConfirm}
                                disabled={acting}
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                {acting ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                Confirmar Existencia
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={acting}
                                className="px-5 py-3 bg-white/5 hover:bg-red-500/20 disabled:opacity-50 text-red-400 hover:text-red-300 border border-white/10 rounded-xl font-semibold transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function WebOrders() {
    const { token } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pendiente');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [counts, setCounts] = useState({ pendiente: 0, confirmado: 0, cancelado: 0, total: 0 });

    const fetchOrders = useCallback(async (status = filter) => {
        setLoading(true);
        try {
            const params = status ? `?status=${status}` : '';
            const res = await fetch(`${API_URL}/web-orders${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setOrders(data.orders || []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, [token, filter]);

    // Fetch counts for all statuses
    const fetchCounts = useCallback(async () => {
        try {
            const all = await Promise.all(
                ['', 'pendiente', 'confirmado', 'cancelado'].map(s =>
                    fetch(`${API_URL}/web-orders${s ? `?status=${s}` : ''}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(r => r.json()).then(d => ({ status: s || 'total', count: d.total || 0 }))
                )
            );
            const c = {};
            all.forEach(({ status, count }) => { c[status] = count; });
            setCounts(c);
        } catch { /* ignore */ }
    }, [token]);

    useEffect(() => {
        fetchOrders();
        fetchCounts();
    }, [filter]);

    const openDetail = async (id) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`${API_URL}/web-orders/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSelectedOrder(await res.json());
        } catch { /* ignore */ }
        finally { setDetailLoading(false); }
    };

    const handleConfirm = async (id) => {
        const res = await fetch(`${API_URL}/web-orders/${id}/confirm`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        // 409 = stock insuficiente (sin conflicto FIFO) → no auto-cancelar, solo advertir
        if (res.status === 409 && data.stockInsuficiente) {
            return {
                ok: false,
                stockInsuficiente: true,
                motivo: data.mensaje,
                advertencias: data.advertencias,
            };
        }

        // Remove confirmed/cancelled order from current list and refresh counts
        setOrders(prev => prev.filter(o => o.id !== id));
        setSelectedOrder(prev => prev ? { ...prev, web_status: data.confirmado ? 'confirmado' : 'cancelado' } : null);
        // Also remove any auto-cancelled orders from the list
        if (data.autoCancelados?.length) {
            const cancelledIds = data.autoCancelados.map(o => o.id);
            setOrders(prev => prev.filter(o => !cancelledIds.includes(o.id)));
        }
        fetchCounts();
        return {
            ok: data.confirmado,
            motivo: data.motivo || (data.autoCancelados?.length
                ? `Confirmado. ${data.autoCancelados.length} pedido(s) posterior(es) cancelado(s) automáticamente por falta de stock.`
                : null),
        };
    };

    const handleCancel = async (id) => {
        await fetch(`${API_URL}/web-orders/${id}/cancel`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
        });
        setOrders(prev => prev.filter(o => o.id !== id));
        fetchCounts();
    };

    const FILTERS = [
        { value: 'pendiente',  label: 'Pendientes',  color: 'text-amber-400',   activeBg: 'bg-amber-500/20 border-amber-500/40' },
        { value: 'confirmado', label: 'Confirmados', color: 'text-emerald-400', activeBg: 'bg-emerald-500/20 border-emerald-500/40' },
        { value: 'cancelado',  label: 'Cancelados',  color: 'text-red-400',     activeBg: 'bg-red-500/20 border-red-500/40' },
        { value: '',           label: 'Todos',        color: 'text-slate-300',   activeBg: 'bg-primary-500/20 border-primary-500/40' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                        </span>
                        Pedidos Página Web
                        {counts.pendiente > 0 && (
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                                {counts.pendiente}
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Pedidos confirmados desde Bisonte Shop</p>
                </div>
                <button
                    onClick={() => { fetchOrders(); fetchCounts(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Actualizar
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { key: 'pendiente',  label: 'Pendientes',  color: 'from-amber-400 to-orange-400' },
                    { key: 'confirmado', label: 'Confirmados', color: 'from-emerald-400 to-teal-400' },
                    { key: 'cancelado',  label: 'Cancelados',  color: 'from-red-400 to-pink-400' },
                ].map(({ key, label, color }) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={`glass-card-dark rounded-xl p-4 text-center transition-all border ${filter === key ? 'border-white/20 bg-white/[0.07]' : 'border-transparent'}`}
                    >
                        <p className={`text-2xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                            {counts[key] ?? 0}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{label}</p>
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
                {FILTERS.map(({ value, label, activeBg }) => (
                    <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                            filter === value
                                ? `${activeBg} text-white`
                                : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                        }`}
                    >
                        {label}
                        {value === 'pendiente' && counts.pendiente > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                                {counts.pendiente}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Lista */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
                </div>
            ) : orders.length === 0 ? (
                <div className="glass-card-dark rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                    </div>
                    <p className="text-slate-400 font-medium">Sin pedidos</p>
                    <p className="text-slate-500 text-sm mt-1">
                        No hay pedidos {filter ? `"${STATUS_CONFIG[filter]?.label?.toLowerCase()}"` : ''} en este momento
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {orders.map((order) => (
                        <button
                            key={order.id}
                            onClick={() => openDetail(order.id)}
                            disabled={detailLoading}
                            className="w-full glass-card-dark rounded-xl p-4 hover:bg-white/[0.07] transition-colors text-left border border-white/5 hover:border-white/10"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                                    {order.nombre?.charAt(0)?.toUpperCase() ?? '#'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-mono text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
                                            #{order.id}
                                        </span>
                                        <p className="font-semibold text-sm">
                                            {order.nombre ? `${order.nombre} ${order.apellido}` : `Pedido #${order.id}`}
                                        </p>
                                        <StatusBadge status={order.web_status} />
                                        <ProcessTypeBadge processType={order.web_process_type} status={order.web_status} />
                                        {order.conflicto && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                                </svg>
                                                Sin stock suficiente
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">
                                        {order.email ?? 'Sin email'}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0 hidden sm:block">
                                    <p className="font-bold">${Number(order.total).toFixed(2)}</p>
                                    <p className="text-xs text-slate-500">
                                        {order.total_items} {order.total_items === 1 ? 'producto' : 'productos'}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0 hidden md:block">
                                    <p className="text-xs text-slate-400">
                                        {new Date(order.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {selectedOrder && (
                <OrderDetailModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}
        </div>
    );
}
