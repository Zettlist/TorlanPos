import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

const STATUS_CONFIG = {
    pendiente:  { label: 'Pendiente',  bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-400'   },
    confirmado: { label: 'Confirmado', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
    envio:      { label: 'En Envío',   bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30',    dot: 'bg-blue-400'    },
    entregado:  { label: 'Entregado',  bg: 'bg-teal-500/20',    text: 'text-teal-400',    border: 'border-teal-500/30',    dot: 'bg-teal-400'    },
    reclamo:    { label: 'Reclamo',    bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30',  dot: 'bg-orange-400'  },
    cancelado:  { label: 'Cancelado',  bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-400'     },
};

const SHIPPING_CONFIG = {
    en_espera:  { label: 'En espera de despacho', icon: '📦', bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/20'    },
    despachado: { label: 'Despachado',             icon: '🚚', bg: 'bg-violet-500/15', text: 'text-violet-300', border: 'border-violet-500/20' },
};

const CLAIM_CONFIG = {
    disputa:    { label: 'En disputa',  icon: '⚠️', bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/20' },
    resolucion: { label: 'Resuelto',    icon: '✅', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/20' },
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

function SubStatusBadge({ shippingStatus, claimStatus }) {
    if (shippingStatus && SHIPPING_CONFIG[shippingStatus]) {
        const cfg = SHIPPING_CONFIG[shippingStatus];
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                {cfg.icon} {cfg.label}
            </span>
        );
    }
    if (claimStatus && CLAIM_CONFIG[claimStatus]) {
        const cfg = CLAIM_CONFIG[claimStatus];
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                {cfg.icon} {cfg.label}
            </span>
        );
    }
    return null;
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

function OrderDetailModal({ order, onClose, onConfirm, onCancel, onRefreshOrder }) {
    const { token } = useAuth();
    const [acting, setActing] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [cancelError, setCancelError] = useState(null);
    const [showRefundConfirm, setShowRefundConfirm] = useState(false);

    // Ship form
    const [showShipForm, setShowShipForm] = useState(false);
    const [shipData, setShipData] = useState({ shipping_status: 'en_espera', tracking_number: '' });

    // Envia.com label generation
    const [generatingLabel, setGeneratingLabel] = useState(false);
    const [labelResult, setLabelResult] = useState(null);
    const [labelError, setLabelError] = useState(null);

    // Claim form
    const [showClaimForm, setShowClaimForm] = useState(false);
    const [claimData, setClaimData] = useState({ claim_status: 'disputa', claim_notes: '' });

    const status = order.web_status;
    const isPendiente  = status === 'pendiente';
    const isConfirmado = status === 'confirmado';
    const isEnvio      = status === 'envio';
    const isEntregado  = status === 'entregado';
    const isReclamo    = status === 'reclamo';

    // ── Confirm ──────────────────────────────────────────────────────
    const handleConfirm = async () => {
        setActing(true);
        const result = await onConfirm(order.id);
        setResultado(result);
        setActing(false);
        if (result?.ok) onRefreshOrder(order.id);
    };

    // ── Cancel / Refund ──────────────────────────────────────────────
    const handleCancel = async () => {
        setActing(true);
        setCancelError(null);
        const result = await onCancel(order.id);
        setActing(false);
        if (result?.ok) {
            onClose();
        } else {
            setCancelError(result?.error || 'No se pudo cancelar el pedido');
        }
    };

    const handleRefund = async () => {
        setActing(true);
        setShowRefundConfirm(false);
        const result = await onCancel(order.id);
        setActing(false);
        if (result?.ok) {
            setResultado({
                ok: true,
                motivo: result.alreadyRefunded
                    ? 'Reembolso ya existía en Stripe. Pedido marcado como cancelado.'
                    : `Reembolso procesado. ${result.refund_id ? `ID: ${result.refund_id}` : ''}`,
            });
        } else {
            setResultado({ ok: false, motivo: result?.error || 'Error al procesar el reembolso' });
        }
    };

    const needsRefund = ['confirmado', 'envio', 'entregado', 'reclamo'].includes(status);

    // ── Ship ─────────────────────────────────────────────────────────
    const [shipError, setShipError] = useState(null);
    const handleShip = async () => {
        setActing(true);
        setShipError(null);
        try {
            const res = await fetch(`${API_URL}/web-orders/${order.id}/ship`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(shipData),
            });
            const data = await res.json();
            if (res.ok) {
                setShowShipForm(false);
                await onRefreshOrder(order.id);
            } else {
                setShipError(data.error || 'Error al actualizar envío');
            }
        } catch (err) {
            setShipError(err.message || 'Error de conexión');
        }
        setActing(false);
    };

    // ── Update shipping to despachado (when already en_espera) ───────
    const handleMarkDespachado = async () => {
        setActing(true);
        try {
            const res = await fetch(`${API_URL}/web-orders/${order.id}/ship`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ shipping_status: 'despachado', tracking_number: shipData.tracking_number }),
            });
            if (res.ok) {
                setShowShipForm(false);
                await onRefreshOrder(order.id);
            }
        } catch { /* ignore */ }
        setActing(false);
    };

    // ── Deliver ──────────────────────────────────────────────────────
    const handleDeliver = async () => {
        setActing(true);
        try {
            const res = await fetch(`${API_URL}/web-orders/${order.id}/deliver`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) await onRefreshOrder(order.id);
        } catch { /* ignore */ }
        setActing(false);
    };

    // ── Claim / Resolve ───────────────────────────────────────────────
    const handleClaim = async () => {
        setActing(true);
        try {
            const res = await fetch(`${API_URL}/web-orders/${order.id}/claim`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(claimData),
            });
            if (res.ok) {
                setShowClaimForm(false);
                await onRefreshOrder(order.id);
            }
        } catch { /* ignore */ }
        setActing(false);
    };

    const handleResolve = async () => {
        setActing(true);
        try {
            const res = await fetch(`${API_URL}/web-orders/${order.id}/claim`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ claim_status: 'resolucion', claim_notes: order.claim_notes || '' }),
            });
            if (res.ok) await onRefreshOrder(order.id);
        } catch { /* ignore */ }
        setActing(false);
    };

    const isEnvia = order.shipping_method === 'envia';

    const handleGenerateLabel = async () => {
        setGeneratingLabel(true);
        setLabelError(null);
        try {
            const res = await fetch(`${API_URL}/web-orders/${order.id}/generate-label`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setLabelResult(data);
                await onRefreshOrder(order.id);
            } else {
                setLabelError(data.error || 'Error al generar etiqueta');
            }
        } catch (err) {
            setLabelError(err.message || 'Error de conexión');
        }
        setGeneratingLabel(false);
    };

    const Spinner = () => <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />;

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={!acting ? onClose : undefined}
        >
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
                            {isEnvio && <SubStatusBadge shippingStatus={order.shipping_status} />}
                            {isReclamo && <SubStatusBadge claimStatus={order.claim_status} />}
                            <ProcessTypeBadge processType={order.web_process_type} status={order.web_status} />
                            {order.shipping_method && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                                    order.shipping_method === 'envia'
                                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20'
                                        : 'bg-amber-500/15 text-amber-300 border-amber-500/20'
                                }`}>
                                    {order.shipping_method === 'envia' ? '📦 Envia.com' : '🦬 Envío Bisonte'}
                                </span>
                            )}
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

                    {/* Confirm result banner */}
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
                                <p className="text-xs mt-3 opacity-60">Cancela el pedido manualmente y contacta al cliente.</p>
                            </div>
                        ) : (
                            <div className={`rounded-xl p-4 border ${resultado.ok
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-red-500/10 border-red-500/30 text-red-300'}`}
                            >
                                <p className="font-semibold">{resultado.ok ? '✅ Pedido confirmado' : '❌ Pedido cancelado automáticamente'}</p>
                                {resultado.motivo && <p className="text-sm mt-1 opacity-80">{resultado.motivo}</p>}
                                {resultado.labelError && (
                                    <p className="text-xs mt-2 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg px-3 py-2">
                                        ⚠️ Guía Envia.com no pudo generarse: {typeof resultado.labelError === 'string' ? resultado.labelError : JSON.stringify(resultado.labelError)}. Puedes generarla desde el pedido confirmado.
                                    </p>
                                )}
                            </div>
                        )
                    )}

                    {/* Tracking number — shown for any status when available */}
                    {order.tracking_number && (
                        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                            <p className="text-xs text-violet-400 uppercase tracking-wider mb-1">Número de Guía</p>
                            <p className="font-mono text-lg font-bold text-white">{order.tracking_number}</p>
                            {order.envia_label_data && (
                                (() => {
                                    try {
                                        const ld = typeof order.envia_label_data === 'string' ? JSON.parse(order.envia_label_data) : order.envia_label_data;
                                        return ld?.label ? (
                                            <a href={ld.label} target="_blank" rel="noreferrer"
                                                className="text-xs text-cyan-400 hover:text-cyan-300 underline mt-1 block">
                                                Ver / Descargar Etiqueta PDF
                                            </a>
                                        ) : null;
                                    } catch { return null; }
                                })()
                            )}
                        </div>
                    )}

                    {/* Claim info (when in reclamo) */}
                    {isReclamo && (
                        <div className={`rounded-xl p-4 border ${
                            order.claim_status === 'resolucion'
                                ? 'bg-emerald-500/10 border-emerald-500/20'
                                : 'bg-orange-500/10 border-orange-500/20'
                        }`}>
                            <p className="text-xs uppercase tracking-wider mb-2 text-slate-400">Reclamo</p>
                            <SubStatusBadge claimStatus={order.claim_status} />
                            {order.claim_notes && (
                                <p className="text-sm text-slate-300 mt-2 leading-relaxed">{order.claim_notes}</p>
                            )}
                        </div>
                    )}

                    {/* Delivered date */}
                    {isEntregado && order.delivered_at && (
                        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 flex items-center gap-3">
                            <span className="text-2xl">🎉</span>
                            <div>
                                <p className="text-xs text-teal-400 uppercase tracking-wider">Entregado</p>
                                <p className="text-sm text-slate-300">
                                    {new Date(order.delivered_at).toLocaleDateString('es-MX', {
                                        day: '2-digit', month: 'long', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    })}
                                </p>
                            </div>
                        </div>
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
                        <div className="space-y-2 pt-3 border-t border-white/10">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Contacto</p>
                            <a href={`mailto:${order.email}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors group">
                                <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {order.email}
                            </a>
                            {order.telefono ? (
                                <a href={`tel:${order.telefono}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors group">
                                    <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {order.telefono}
                                </a>
                            ) : (
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

                    {/* ── ACCIONES ──────────────────────────────────────────────── */}

                    {/* PENDIENTE */}
                    {isPendiente && !resultado && (
                        <div className="space-y-3">
                            {/* Envia.com: info — guía se genera automáticamente al confirmar existencia */}
                            {isEnvia && (
                                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 flex items-start gap-3">
                                    <span className="text-lg flex-shrink-0">📦</span>
                                    <div>
                                        <p className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">Envío Envia.com</p>
                                        <p className="text-xs text-slate-400 mt-0.5">La guía se genera automáticamente al confirmar existencia.</p>
                                    </div>
                                </div>
                            )}
                            {cancelError && (
                                <div className="rounded-xl p-3 border bg-red-500/10 border-red-500/30 text-red-300 text-sm">
                                    <p className="font-semibold">❌ Error al cancelar</p>
                                    <p className="mt-1 opacity-80">{cancelError}</p>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleConfirm}
                                    disabled={acting}
                                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                    {acting ? <Spinner /> : (
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
                                    {cancelError ? 'Reintentar' : 'Cancelar'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* CONFIRMADO → Enviar / Cancelar */}
                    {isConfirmado && (
                        <div className="space-y-3">
                            {/* Envia.com — fallback si la guía no se generó al confirmar */}
                            {isEnvia && !order.tracking_number && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
                                    <p className="text-xs text-amber-400 font-semibold">⚠️ Guía no generada — hubo un error al confirmar</p>
                                    {labelError && (
                                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                            {typeof labelError === 'string' ? labelError : JSON.stringify(labelError)}
                                        </p>
                                    )}
                                    <button
                                        onClick={handleGenerateLabel}
                                        disabled={generatingLabel || acting}
                                        className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        {generatingLabel ? <Spinner /> : '🏷️'}
                                        {generatingLabel ? 'Generando...' : 'Generar Guía Envia.com'}
                                    </button>
                                </div>
                            )}
                            {/* Envia.com — guía lista, marcar despachado directo (sin formulario) */}
                            {isEnvia && order.tracking_number && (
                                <button
                                    onClick={async () => {
                                        setActing(true);
                                        try {
                                            const res = await fetch(`${API_URL}/web-orders/${order.id}/ship`, {
                                                method: 'PUT',
                                                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', cache: 'no-store' },
                                                body: JSON.stringify({ shipping_status: 'despachado', tracking_number: order.tracking_number }),
                                            });
                                            if (res.ok) await onRefreshOrder(order.id);
                                        } catch { /* ignore */ }
                                        setActing(false);
                                    }}
                                    disabled={acting}
                                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                    {acting ? <Spinner /> : null}
                                    🚚 Marcar como Despachado
                                </button>
                            )}
                            {!isEnvia && !showShipForm ? (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowShipForm(true)}
                                        disabled={acting}
                                        className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                        </svg>
                                        Preparar Envío
                                    </button>
                                </div>
                            ) : !isEnvia && (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-4">
                                    <p className="text-sm font-semibold text-blue-300">Preparar Envío</p>
                                    {/* Sub-status */}
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { value: 'en_espera',  label: '📦 En espera',  desc: 'Listo para despachar' },
                                            { value: 'despachado', label: '🚚 Despachado',  desc: 'Ya fue enviado' },
                                        ].map(({ value, label, desc }) => (
                                            <button
                                                key={value}
                                                onClick={() => setShipData(prev => ({ ...prev, shipping_status: value }))}
                                                className={`p-3 rounded-xl border text-left transition-all ${
                                                    shipData.shipping_status === value
                                                        ? 'border-blue-500 bg-blue-500/20'
                                                        : 'border-white/10 bg-white/5 hover:border-white/20'
                                                }`}
                                            >
                                                <p className="text-sm font-medium">{label}</p>
                                                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                    {/* Tracking */}
                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">
                                            Número de Guía {shipData.shipping_status === 'en_espera' ? '(opcional)' : ''}
                                        </label>
                                        <input
                                            type="text"
                                            value={shipData.tracking_number}
                                            onChange={(e) => setShipData(prev => ({ ...prev, tracking_number: e.target.value }))}
                                            placeholder="Ej. 1Z999AA10123456784"
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500/50"
                                        />
                                    </div>
                                    {shipError && (
                                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{shipError}</p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleShip}
                                            disabled={acting}
                                            className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                                        >
                                            {acting ? <Spinner /> : null}
                                            {shipData.shipping_status === 'despachado' ? '🚚 Confirmar Despacho' : '📦 Confirmar En Espera'}
                                        </button>
                                        <button
                                            onClick={() => { setShowShipForm(false); setShipError(null); }}
                                            disabled={acting}
                                            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ENVÍO → Marcar despachado / Entregar / Reclamo */}
                    {isEnvio && (
                        <div className="space-y-3">
                            {order.shipping_status === 'en_espera' && !showShipForm && (
                                <button
                                    onClick={() => { setShowShipForm(true); setShipData(prev => ({ ...prev, shipping_status: 'despachado' })); }}
                                    disabled={acting}
                                    className="w-full py-3 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                    <span>🚚</span> Marcar como Despachado
                                </button>
                            )}

                            {order.shipping_status === 'en_espera' && showShipForm && (
                                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 space-y-3">
                                    <p className="text-sm font-semibold text-violet-300">🚚 Marcar como Despachado</p>
                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">Número de Guía (opcional)</label>
                                        <input
                                            type="text"
                                            value={shipData.tracking_number}
                                            onChange={(e) => setShipData(prev => ({ ...prev, tracking_number: e.target.value }))}
                                            placeholder="Ej. 1Z999AA10123456784"
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:border-violet-500/50"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleMarkDespachado}
                                            disabled={acting}
                                            className="flex-1 py-2.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                                        >
                                            {acting ? <Spinner /> : null}
                                            Confirmar Despacho
                                        </button>
                                        <button
                                            onClick={() => setShowShipForm(false)}
                                            disabled={acting}
                                            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!showShipForm && !showClaimForm && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleDeliver}
                                        disabled={acting}
                                        className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                                    >
                                        {acting ? <Spinner /> : <span>🎉</span>}
                                        Marcar Entregado
                                    </button>
                                    <button
                                        onClick={() => { setShowClaimForm(true); setClaimData({ claim_status: 'disputa', claim_notes: '' }); }}
                                        disabled={acting}
                                        className="px-5 py-3 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-50 text-orange-400 border border-orange-500/30 rounded-xl font-semibold transition-colors"
                                    >
                                        Reclamo
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ENTREGADO → Reclamo */}
                    {isEntregado && !showClaimForm && (
                        <button
                            onClick={() => { setShowClaimForm(true); setClaimData({ claim_status: 'disputa', claim_notes: '' }); }}
                            disabled={acting}
                            className="w-full py-3 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-50 text-orange-400 border border-orange-500/30 rounded-xl font-semibold transition-colors"
                        >
                            ⚠️ Abrir Reclamo
                        </button>
                    )}

                    {/* Claim form (shared for envio + entregado) */}
                    {(isEnvio || isEntregado) && showClaimForm && (
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-4">
                            <p className="text-sm font-semibold text-orange-300">⚠️ Abrir Reclamo</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'disputa',    label: '⚠️ Disputa',   desc: 'En proceso de resolución' },
                                    { value: 'resolucion', label: '✅ Resolución', desc: 'Caso ya resuelto' },
                                ].map(({ value, label, desc }) => (
                                    <button
                                        key={value}
                                        onClick={() => setClaimData(prev => ({ ...prev, claim_status: value }))}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            claimData.claim_status === value
                                                ? 'border-orange-500 bg-orange-500/20'
                                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-sm font-medium">{label}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Notas del reclamo (opcional)</label>
                                <textarea
                                    value={claimData.claim_notes}
                                    onChange={(e) => setClaimData(prev => ({ ...prev, claim_notes: e.target.value }))}
                                    placeholder="Describe el problema o la resolución..."
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-orange-500/50 resize-none"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleClaim}
                                    disabled={acting}
                                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    {acting ? <Spinner /> : null}
                                    Registrar Reclamo
                                </button>
                                <button
                                    onClick={() => setShowClaimForm(false)}
                                    disabled={acting}
                                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* RECLAMO → Resolver disputa */}
                    {isReclamo && order.claim_status === 'disputa' && !showClaimForm && (
                        <div className="space-y-3">
                            <button
                                onClick={handleResolve}
                                disabled={acting}
                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                {acting ? <Spinner /> : <span>✅</span>}
                                Marcar como Resuelto
                            </button>
                            <button
                                onClick={() => { setShowClaimForm(true); setClaimData({ claim_status: order.claim_status, claim_notes: order.claim_notes || '' }); }}
                                disabled={acting}
                                className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                Editar notas del reclamo
                            </button>
                        </div>
                    )}

                    {/* Reclamo edit form */}
                    {isReclamo && showClaimForm && (
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-4">
                            <p className="text-sm font-semibold text-orange-300">Editar Reclamo</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'disputa',    label: '⚠️ Disputa',   desc: 'En proceso' },
                                    { value: 'resolucion', label: '✅ Resolución', desc: 'Resuelto' },
                                ].map(({ value, label, desc }) => (
                                    <button
                                        key={value}
                                        onClick={() => setClaimData(prev => ({ ...prev, claim_status: value }))}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            claimData.claim_status === value
                                                ? 'border-orange-500 bg-orange-500/20'
                                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-sm font-medium">{label}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Notas</label>
                                <textarea
                                    value={claimData.claim_notes}
                                    onChange={(e) => setClaimData(prev => ({ ...prev, claim_notes: e.target.value }))}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-orange-500/50 resize-none"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleClaim}
                                    disabled={acting}
                                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    {acting ? <Spinner /> : null}
                                    Guardar
                                </button>
                                <button
                                    onClick={() => setShowClaimForm(false)}
                                    disabled={acting}
                                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ZONA DE PELIGRO — Cancelar y reembolsar (post-confirmado) */}
                    {needsRefund && !showRefundConfirm && !resultado && !showShipForm && !showClaimForm && (
                        <div className="pt-2 border-t border-white/5">
                            <button
                                onClick={() => setShowRefundConfirm(true)}
                                disabled={acting}
                                className="w-full py-2.5 text-xs text-red-500/70 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-xl transition-all disabled:opacity-30"
                            >
                                💳 Cancelar pedido y reembolsar al cliente
                            </button>
                        </div>
                    )}

                    {/* Confirmación de reembolso */}
                    {showRefundConfirm && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <span className="text-2xl flex-shrink-0">⚠️</span>
                                <div>
                                    <p className="font-semibold text-red-300">¿Cancelar y reembolsar?</p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Se procesará un reembolso completo de{' '}
                                        <strong className="text-white">${Number(order.total).toFixed(2)}</strong>{' '}
                                        vía Stripe. Esta acción no se puede deshacer.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleRefund}
                                    disabled={acting}
                                    className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    {acting ? <Spinner /> : null}
                                    Confirmar Reembolso
                                </button>
                                <button
                                    onClick={() => setShowRefundConfirm(false)}
                                    disabled={acting}
                                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                                >
                                    No, volver
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────

const STAT_ITEMS = [
    { key: 'pendiente',  label: 'Pendientes',  color: 'from-amber-400 to-orange-400'   },
    { key: 'confirmado', label: 'Confirmados', color: 'from-emerald-400 to-teal-400'   },
    { key: 'envio',      label: 'En Envío',    color: 'from-blue-400 to-indigo-400'    },
    { key: 'entregado',  label: 'Entregados',  color: 'from-teal-400 to-cyan-400'      },
    { key: 'reclamo',    label: 'Reclamos',    color: 'from-orange-400 to-amber-400'   },
    { key: 'cancelado',  label: 'Cancelados',  color: 'from-red-400 to-pink-400'       },
];

const FILTERS = [
    { value: 'pendiente',  label: 'Pendientes',  activeBg: 'bg-amber-500/20 border-amber-500/40'   },
    { value: 'confirmado', label: 'Confirmados', activeBg: 'bg-emerald-500/20 border-emerald-500/40' },
    { value: 'envio',      label: 'Envío',        activeBg: 'bg-blue-500/20 border-blue-500/40'     },
    { value: 'entregado',  label: 'Entregados',  activeBg: 'bg-teal-500/20 border-teal-500/40'     },
    { value: 'reclamo',    label: 'Reclamos',     activeBg: 'bg-orange-500/20 border-orange-500/40' },
    { value: 'cancelado',  label: 'Cancelados',  activeBg: 'bg-red-500/20 border-red-500/40'       },
    { value: '',           label: 'Todos',        activeBg: 'bg-primary-500/20 border-primary-500/40' },
];

export default function WebOrders() {
    const { token } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pendiente');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [counts, setCounts] = useState({});

    const fetchOrders = useCallback(async (status = filter) => {
        setLoading(true);
        try {
            const params = status ? `?status=${status}` : '';
            const res = await fetch(`${API_URL}/web-orders${params}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            const data = await res.json();
            setOrders(data.orders || []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, [token, filter]);

    const fetchCounts = useCallback(async () => {
        try {
            const statuses = ['', 'pendiente', 'confirmado', 'envio', 'entregado', 'reclamo', 'cancelado'];
            const results = await Promise.all(
                statuses.map(s =>
                    fetch(`${API_URL}/web-orders${s ? `?status=${s}` : ''}`, {
                        headers: { Authorization: `Bearer ${token}` },
                        cache: 'no-store',
                    }).then(r => r.json()).then(d => ({ key: s || 'total', count: d.total || 0 }))
                )
            );
            const c = {};
            results.forEach(({ key, count }) => { c[key] = count; });
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
            const data = await res.json();
            setSelectedOrder(data);
        } catch { /* ignore */ }
        finally { setDetailLoading(false); }
    };

    const handleConfirm = async (id) => {
        const res = await fetch(`${API_URL}/web-orders/${id}/confirm`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (res.status === 409 && data.stockInsuficiente) {
            return { ok: false, stockInsuficiente: true, motivo: data.mensaje, advertencias: data.advertencias };
        }

        setOrders(prev => prev.filter(o => o.id !== id));
        if (data.autoCancelados?.length) {
            const ids = data.autoCancelados.map(o => o.id);
            setOrders(prev => prev.filter(o => !ids.includes(o.id)));
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
        const res = await fetch(`${API_URL}/web-orders/${id}/cancel`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
            setOrders(prev => prev.filter(o => o.id !== id));
            fetchCounts();
            return { ok: true };
        } else {
            return { ok: false, error: data.error || 'Error al cancelar' };
        }
    };

    const handleRefreshOrder = async (id) => {
        await openDetail(id);
        fetchOrders();
        fetchCounts();
    };

    const pendienteCount = counts.pendiente ?? 0;
    const reclamoCount   = counts.reclamo ?? 0;

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
                        {pendienteCount > 0 && (
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                                {pendienteCount}
                            </span>
                        )}
                        {reclamoCount > 0 && (
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-xs font-bold">
                                {reclamoCount}
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Pedidos desde Bisonte Shop</p>
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

            {/* Stats grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {STAT_ITEMS.map(({ key, label, color }) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={`glass-card-dark rounded-xl p-3 text-center transition-all border ${filter === key ? 'border-white/20 bg-white/[0.07]' : 'border-transparent hover:border-white/10'}`}
                    >
                        <p className={`text-2xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                            {counts[key] ?? 0}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
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
                        {value === 'pendiente' && pendienteCount > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                                {pendienteCount}
                            </span>
                        )}
                        {value === 'reclamo' && reclamoCount > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                                {reclamoCount}
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
                                        {order.web_status === 'envio' && (
                                            <SubStatusBadge shippingStatus={order.shipping_status} />
                                        )}
                                        {order.web_status === 'reclamo' && (
                                            <SubStatusBadge claimStatus={order.claim_status} />
                                        )}
                                        <ProcessTypeBadge processType={order.web_process_type} status={order.web_status} />
                                        {order.conflicto && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                                </svg>
                                                Sin stock suficiente
                                            </span>
                                        )}
                                        {order.tracking_number && (
                                            <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                                                {order.tracking_number}
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
                    onRefreshOrder={handleRefreshOrder}
                />
            )}
        </div>
    );
}
