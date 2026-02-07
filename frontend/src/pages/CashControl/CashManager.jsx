
import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

export default function CashManager() {
    const { user, token, isEmpresaAdmin, isGlobalAdmin } = useAuth();
    const [activeSession, setActiveSession] = useState(null);
    const [activeSessionsList, setActiveSessionsList] = useState([]); // For manager
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('active'); // 'active', 'history'

    // Forms
    const [openingAmount, setOpeningAmount] = useState('');
    const [declaredAmount, setDeclaredAmount] = useState('');
    const [closingNotes, setClosingNotes] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Details Modal
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedSessionDetails, setSelectedSessionDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Ticket View
    const [showTicket, setShowTicket] = useState(false);
    const [ticketData, setTicketData] = useState(null);
    const [loadingTicket, setLoadingTicket] = useState(false);

    useEffect(() => {
        if (view === 'active') fetchCurrentSession();
        if (view === 'history') fetchHistory();
        if (view === 'manager_active') fetchActiveSessionsList();
    }, [view]);

    const fetchCurrentSession = async () => {
        try {
            const response = await fetch(`${API_URL}/cash-sessions/current`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setActiveSession(data.session);
            }
        } catch (error) {
            console.error('Error fetching session:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await fetch(`${API_URL}/cash-sessions/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setHistory(data);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const fetchActiveSessionsList = async () => {
        try {
            const response = await fetch(`${API_URL}/cash-sessions/active-list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setActiveSessionsList(data);
            }
        } catch (error) {
            console.error('Error fetching active sessions list:', error);
        }
    };

    const handleViewDetails = async (sessionId) => {
        setLoadingDetails(true);
        setDetailsModalOpen(true);
        try {
            const response = await fetch(`${API_URL}/cash-sessions/session/${sessionId}/details`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSelectedSessionDetails(data);
            } else {
                setError('Error al cargar detalles');
            }
        } catch (error) {
            console.error('Error fetching details:', error);
            setError('Error de conexión');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleViewTicket = async (saleId) => {
        setLoadingTicket(true);
        setShowTicket(true);
        try {
            const response = await fetch(`${API_URL}/sales/${saleId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setTicketData({
                    id: data.id,
                    date: new Date(data.created_at),
                    items: data.items.map(item => ({ ...item, price: Number(item.price) })),
                    total: Number(data.total),
                    paymentMethod: data.payment_method,
                    cardType: null, // Info not strictly needed for history view or could be added to backend
                    bank: null,
                    amountReceived: 0, // Not stored in sales table currently, would need schema change
                    change: 0,
                    cashier: data.cashier
                });
            } else {
                console.error('Error loading ticket');
                setShowTicket(false);
            }
        } catch (error) {
            console.error('Error details:', error);
            setShowTicket(false);
        } finally {
            setLoadingTicket(false);
        }
    };

    const handleOpenSession = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const response = await fetch(`${API_URL}/cash-sessions/open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ opening_amount: parseFloat(openingAmount) })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            setSuccess('Caja abierta correctamente');
            setOpeningAmount('');
            fetchCurrentSession();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleCloseSession = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const response = await fetch(`${API_URL}/cash-sessions/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    declared_amount: parseFloat(declaredAmount),
                    notes: closingNotes
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            if (data.status === 'discrepancia') {
                setSuccess(`Caja cerrada con discrepancia: ${data.message} (${data.difference > 0 ? '+' : ''}${data.difference})`);
            } else {
                setSuccess('Caja cerrada correctamente (Cuadre perfecto)');
            }

            setActiveSession(null);
            setDeclaredAmount('');
            setClosingNotes('');
            // Switch to history to see it
            if (view === 'history') fetchHistory();
        } catch (err) {
            setError(err.message);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-400">Cargando...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Control de Caja</h1>
                <div className="flex bg-white/5 rounded-lg p-1">
                    <button
                        onClick={() => setView('active')}
                        className={`px-4 py-2 rounded-md text-sm transition-colors ${view === 'active' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        Mi Caja
                    </button>
                    {(isEmpresaAdmin() || isGlobalAdmin()) && (
                        <button
                            onClick={() => setView('manager_active')}
                            className={`px-4 py-2 rounded-md text-sm transition-colors ${view === 'manager_active' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            Supervisión
                        </button>
                    )}
                    <button
                        onClick={() => setView('history')}
                        className={`px-4 py-2 rounded-md text-sm transition-colors ${view === 'history' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        Historial
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/20 text-red-300 rounded-xl border border-red-500/30">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-4 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-500/30">
                    {success}
                </div>
            )}

            {view === 'active' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {!activeSession ? (
                        <div className="glass-card p-8 text-center space-y-6 md:col-span-2 max-w-lg mx-auto w-full">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold mb-2">Caja Cerrada</h2>
                                <p className="text-slate-400">Debes abrir caja para comenzar a registrar ventas en efectivo.</p>
                            </div>
                            <form onSubmit={handleOpenSession} className="text-left space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Fondo Inicial ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={openingAmount}
                                        onChange={e => setOpeningAmount(e.target.value)}
                                        className="input-glass"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                                <button type="submit" className="btn-primary w-full">
                                    Abrir Caja
                                </button>
                            </form>
                        </div>
                    ) : (
                        <>
                            {/* Stats Card */}
                            <div className="glass-card p-6 space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                        Caja Abierta
                                    </h2>
                                    <span className="text-sm text-slate-400">
                                        {new Date(activeSession.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-white/5 rounded-xl">
                                        <p className="text-sm text-slate-400 mb-1">Fondo Inicial</p>
                                        <p className="text-2xl font-bold">${Number(activeSession.opening_amount).toFixed(2)}</p>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-xl">
                                        <p className="text-sm text-slate-400 mb-1">Ventas (Efectivo)</p>
                                        <p className="text-2xl font-bold text-emerald-400">
                                            ${Number(activeSession.current_sales_total).toFixed(2)}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">Acumulado en sesión</p>
                                    </div>
                                </div>

                                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-blue-300 font-medium">Total Esperado en Caja</span>
                                        <span className="text-2xl font-bold text-blue-300">
                                            ${Number(activeSession.current_expected).toFixed(2)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-blue-300/60 text-right">Fondo + Ventas</p>
                                </div>
                            </div>

                            {/* Close Form */}
                            <div className="glass-card p-6">
                                <h2 className="text-lg font-semibold mb-4">Corte de Caja (Cierre)</h2>
                                <form onSubmit={handleCloseSession} className="space-y-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">Efectivo Contado ($)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={declaredAmount}
                                            onChange={e => setDeclaredAmount(e.target.value)}
                                            className="input-glass"
                                            placeholder="Monto real en caja"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">Notas (Opcional)</label>
                                        <textarea
                                            value={closingNotes}
                                            onChange={e => setClosingNotes(e.target.value)}
                                            className="input-glass min-h-[80px]"
                                            placeholder="Observaciones sobre diferencias..."
                                        />
                                    </div>
                                    <div className="pt-2">
                                        <button type="submit" className="btn-danger w-full flex items-center justify-center gap-2">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                            Realizar Corte y Cerrar
                                        </button>
                                        <p className="text-xs text-center text-slate-500 mt-2">
                                            Esta acción generará el reporte final del turno.
                                        </p>
                                    </div>
                                </form>
                            </div>
                        </>
                    )}
                </div>
            )}

            {view === 'history' && (
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-white/5">
                                <tr>
                                    <th className="table-header">Fecha</th>
                                    <th className="table-header">Empleado</th>
                                    <th className="table-header text-right">Inicial</th>
                                    <th className="table-header text-right">Final</th>
                                    <th className="table-header text-right">Diferencia</th>
                                    <th className="table-header text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8 text-slate-500">
                                            No hay historial disponible
                                        </td>
                                    </tr>
                                ) : (
                                    history.map((session) => (
                                        <tr key={session.id} className="hover:bg-white/5 transition-colors">
                                            <td className="table-cell">
                                                {new Date(session.opened_at).toLocaleDateString('es-MX')}
                                                <span className="block text-xs text-slate-500">
                                                    {new Date(session.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </td>
                                            <td className="table-cell font-medium">
                                                {session.opened_by_username}
                                            </td>
                                            <td className="table-cell text-right">
                                                ${Number(session.opening_amount).toFixed(2)}
                                            </td>
                                            <td className="table-cell text-right">
                                                {session.status === 'closed' ? (
                                                    session.declared_amount !== undefined ? `$${Number(session.declared_amount).toFixed(2)}` : '***'
                                                ) : '-'}
                                            </td>
                                            <td className="table-cell text-right">
                                                {session.status === 'closed' ? (
                                                    session.difference !== undefined ? (
                                                        <span className={session.difference === 0 ? 'text-slate-400' : session.difference > 0 ? 'text-blue-400' : 'text-red-400'}>
                                                            {session.difference > 0 ? '+' : ''}{Number(session.difference).toFixed(2)}
                                                        </span>
                                                    ) : (
                                                        session.has_discrepancy ? <span className="text-amber-400 text-xs">Revisar</span> : <span className="text-emerald-500 text-xs">OK</span>
                                                    )
                                                ) : '-'}
                                            </td>
                                            <td className="table-center">
                                                {session.status === 'open' ? (
                                                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                                                        Abierta
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                                                        Cerrada
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {view === 'manager_active' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-xl">
                            <h3 className="text-emerald-400 font-semibold mb-1">Cajas Abiertas</h3>
                            <p className="text-3xl font-bold text-white">{activeSessionsList.length}</p>
                        </div>
                    </div>

                    <div className="glass-card overflow-hidden">
                        <div className="p-4 border-b border-white/5">
                            <h3 className="font-semibold">Detalle de Sesiones Activas</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="table-header">Empleado</th>
                                        <th className="table-header">Apertura</th>
                                        <th className="table-header text-right">Fondo Inicial</th>
                                        <th className="table-header text-right">Ventas (Efec)</th>
                                        <th className="table-header text-right">Total Esperado</th>
                                        <th className="table-header text-center">Estado</th>
                                        <th className="table-header text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {activeSessionsList.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="text-center py-8 text-slate-500">
                                                No hay cajas abiertas actualmente
                                            </td>
                                        </tr>
                                    ) : (
                                        activeSessionsList.map((session) => (
                                            <tr key={session.id} className="hover:bg-white/5 transition-colors">
                                                <td className="table-cell font-medium">
                                                    {session.opened_by_username}
                                                </td>
                                                <td className="table-cell">
                                                    {new Date(session.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="table-cell text-right">
                                                    ${Number(session.opening_amount).toFixed(2)}
                                                </td>
                                                <td className="table-cell text-right text-emerald-400">
                                                    ${Number(session.current_sales_total).toFixed(2)}
                                                </td>
                                                <td className="table-cell text-right font-bold">
                                                    ${Number(session.current_expected).toFixed(2)}
                                                </td>
                                                <td className="table-center">
                                                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs animate-pulse">
                                                        En Curso
                                                    </span>
                                                </td>
                                                <td className="table-center">
                                                    <button
                                                        onClick={() => handleViewDetails(session.id)}
                                                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                        title="Ver Detalles"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}


            {/* Details Modal */}
            {
                detailsModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-[#1a1f37] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
                            <div className="sticky top-0 bg-[#1a1f37] border-b border-white/10 p-4 flex items-center justify-between z-10">
                                <h3 className="text-xl font-bold text-white">Detalle de Sesión</h3>
                                <button
                                    onClick={() => setDetailsModalOpen(false)}
                                    className="text-slate-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                {loadingDetails ? (
                                    <div className="text-center py-12">
                                        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                        <p className="text-slate-400">Cargando detalles...</p>
                                    </div>
                                ) : selectedSessionDetails ? (
                                    <>
                                        {/* Header Info */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-white/5 rounded-xl">
                                                <p className="text-sm text-slate-500">Empleado</p>
                                                <p className="text-lg font-medium text-white">{selectedSessionDetails.session.opened_by_username}</p>
                                            </div>
                                            <div className="p-4 bg-white/5 rounded-xl">
                                                <p className="text-sm text-slate-500">Apertura</p>
                                                <p className="text-lg font-medium text-white">
                                                    {new Date(selectedSessionDetails.session.opened_at).toLocaleString('es-MX')}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Financial Summary */}
                                        <div className="p-6 bg-slate-800/50 rounded-xl border border-white/5 space-y-4">
                                            <h4 className="font-semibold text-emerald-400 mb-2">Resumen Financiero</h4>
                                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                <span className="text-slate-400">Fondo Inicial</span>
                                                <span className="font-mono text-lg">${Number(selectedSessionDetails.session.opening_amount).toFixed(2)}</span>
                                            </div>

                                            {/* Sales Breakdown */}
                                            <div className="space-y-2">
                                                <p className="text-sm text-slate-500 font-medium">Ventas por Método:</p>
                                                {selectedSessionDetails.summary.payment_breakdown.map(item => (
                                                    <div key={item.payment_method} className="flex justify-between items-center pl-4">
                                                        <span className="text-slate-300 capitalize">
                                                            {item.payment_method === 'cash' ? 'Efectivo' :
                                                                item.payment_method === 'card' ? 'Tarjeta' : item.payment_method}
                                                        </span>
                                                        <span className="font-mono text-white">
                                                            ${Number(item.total).toFixed(2)}
                                                            <span className="text-xs text-slate-500 ml-2">({item.count} ops)</span>
                                                        </span>
                                                    </div>
                                                ))}
                                                {selectedSessionDetails.summary.payment_breakdown.length === 0 && (
                                                    <p className="text-sm text-slate-500 italic pl-4">No hay ventas registradas</p>
                                                )}
                                            </div>

                                            <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-2">
                                                <span className="text-blue-300 font-bold">Total Esperado en Caja (Efectivo)</span>
                                                <span className="font-mono text-xl text-blue-300 font-bold">
                                                    ${Number(selectedSessionDetails.session.calculated_expected).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Withdrawals Section (Placeholder) */}
                                        {/* 
                                    <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                                        <h4 className="font-semibold text-red-400 mb-2">Retiros de Caja</h4>
                                        <p className="text-sm text-slate-500">No hay retiros registrados.</p>
                                    </div>
                                    */}

                                        {/* Recent Transactions */}
                                        <div>
                                            <h4 className="font-semibold text-white mb-3">Últimas Transacciones</h4>
                                            <div className="overflow-hidden rounded-lg border border-white/5">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-white/5">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left text-slate-400">Hora</th>
                                                            <th className="px-3 py-2 text-left text-slate-400">Método</th>
                                                            <th className="px-3 py-2 text-right text-slate-400">Total</th>
                                                            <th className="px-3 py-2 text-center text-slate-400">Acciones</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5">
                                                        {selectedSessionDetails.recent_sales.map(tx => (
                                                            <tr key={tx.id} className="hover:bg-white/5">
                                                                <td className="px-3 py-2 text-slate-300">
                                                                    {new Date(tx.created_at).toLocaleTimeString('es-MX')}
                                                                </td>
                                                                <td className="px-3 py-2 capitalize text-slate-300">
                                                                    {tx.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'}
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-mono text-white">
                                                                    ${Number(tx.total).toFixed(2)}
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <button
                                                                        onClick={() => handleViewTicket(tx.id)}
                                                                        disabled={loadingTicket}
                                                                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                                                        title="Ver Ticket"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                        </svg>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {selectedSessionDetails.recent_sales.length === 0 && (
                                                            <tr>
                                                                <td colSpan="3" className="px-3 py-4 text-center text-slate-500">
                                                                    Sin transacciones
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center text-red-400">
                                        No se pudo cargar la información de la sesión.
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-white/10 bg-[#1a1f37]/50 sticky bottom-0 text-right">
                                <button
                                    onClick={() => setDetailsModalOpen(false)}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Ticket Modal (Reusable) */}
            {
                showTicket && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white text-gray-900 w-full max-w-sm rounded-lg shadow-2xl animate-scale-in overflow-hidden relative">
                            <button
                                onClick={() => setShowTicket(false)}
                                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 z-10"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            {!ticketData ? (
                                <div className="p-8 text-center">
                                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                    <p className="text-sm text-gray-500">Cargando ticket...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Ticket Header */}
                                    <div className="bg-gray-100 p-4 text-center border-b-2 border-dashed border-gray-300">
                                        <h2 className="text-xl font-bold">TORLAN POS</h2>
                                        <p className="text-sm text-gray-600">Ticket de Venta #{ticketData.id}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {ticketData.date.toLocaleDateString('es-MX')} - {ticketData.date.toLocaleTimeString('es-MX')}
                                        </p>
                                    </div>

                                    {/* Ticket Items */}
                                    <div className="p-4 border-b-2 border-dashed border-gray-300 max-h-[40vh] overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-gray-500 text-xs">
                                                    <th className="text-left py-1">CANT.</th>
                                                    <th className="text-left py-1">PRODUCTO</th>
                                                    <th className="text-right py-1">PRECIO</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ticketData.items.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td className="py-1">{item.quantity}</td>
                                                        <td className="py-1">{item.name}</td>
                                                        <td className="py-1 text-right">${(item.price * item.quantity).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Ticket Footer */}
                                    <div className="p-4 bg-gray-50">
                                        <div className="flex justify-between text-lg font-bold mb-2">
                                            <span>TOTAL:</span>
                                            <span>${ticketData.total.toFixed(2)} MXN</span>
                                        </div>

                                        <div className="text-sm text-gray-600 space-y-1">
                                            <div className="flex justify-between">
                                                <span>Método de pago:</span>
                                                <span className="font-medium capitalize">
                                                    {ticketData.paymentMethod === 'cash' ? 'Efectivo' : ticketData.paymentMethod}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
                                            <p>Atendió: {ticketData.cashier}</p>
                                            <p className="mt-2">¡Gracias por su compra!</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )
            }
        </div>
    );
}
