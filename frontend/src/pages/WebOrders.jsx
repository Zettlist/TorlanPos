import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

function OrderDetailModal({ order, onClose }) {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-slate-800 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-white/10">
                    <div>
                        <h2 className="text-xl font-bold">Pedido #{order.id}</h2>
                        <p className="text-sm text-slate-400 mt-0.5">
                            {new Date(order.created_at).toLocaleDateString('es-MX', {
                                day: '2-digit', month: 'long', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Cliente */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cliente</p>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                                {order.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                            </div>
                            <div>
                                <p className="font-medium">{order.nombre} {order.apellido}</p>
                                <p className="text-sm text-slate-400">{order.email}</p>
                                {order.client_code && (
                                    <p className="text-xs text-slate-500 font-mono mt-0.5">{order.client_code}</p>
                                )}
                            </div>
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
                            {order.items?.map((item) => (
                                <div key={item.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
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
                                        <p className="text-xs text-slate-400 mt-0.5">x{item.quantity}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-semibold text-sm">${(item.price * item.quantity).toFixed(2)}</p>
                                        <p className="text-xs text-slate-500">${Number(item.price).toFixed(2)} c/u</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Desglose */}
                    <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-slate-400">
                            <span>Subtotal</span>
                            <span>${Number(order.subtotal).toFixed(2)}</span>
                        </div>
                        {Number(order.discount) > 0 && (
                            <div className="flex justify-between text-emerald-400">
                                <span>Descuento</span>
                                <span>-${Number(order.discount).toFixed(2)}</span>
                            </div>
                        )}
                        {Number(order.surcharge) > 0 && (
                            <div className="flex justify-between text-slate-400">
                                <span>Envío</span>
                                <span>${Number(order.surcharge).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-base pt-2 border-t border-white/10">
                            <span>Total</span>
                            <span>${Number(order.total).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function WebOrders() {
    const { token } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [total, setTotal] = useState(0);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/web-orders`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setOrders(data.orders || []);
            setTotal(data.total || 0);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const openDetail = async (id) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`${API_URL}/web-orders/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setSelectedOrder(data);
        } catch {
            // ignore
        } finally {
            setDetailLoading(false);
        }
    };

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);

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
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Pedidos confirmados desde Bisonte Shop</p>
                </div>
                <button
                    onClick={fetchOrders}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Actualizar
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="glass-card-dark rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                        {total}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Pedidos totales</p>
                </div>
                <div className="glass-card-dark rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                        ${totalRevenue.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Ingresos web</p>
                </div>
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
                    <p className="text-slate-500 text-sm mt-1">Aún no hay pedidos confirmados en la tienda web</p>
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
                                    <p className="font-semibold text-sm">
                                        {order.nombre ? `${order.nombre} ${order.apellido}` : `Pedido #${order.id}`}
                                    </p>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">
                                        {order.email ?? 'Sin email registrado'}
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
                <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
            )}
        </div>
    );
}
