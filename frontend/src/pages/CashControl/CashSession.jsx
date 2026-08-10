import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
// Copia desincronizada de la URL del API: apuntaba al 3000 y el backend
// escucha en el 3001. Ver src/config.js.
import { API_URL } from '../../config';

export default function CashSession() {
    const { token, user, isEmpresaAdmin } = useAuth();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [openingAmount, setOpeningAmount] = useState('');
    const [declaredAmount, setDeclaredAmount] = useState('');
    const [closeResult, setCloseResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchCurrentSession();
        if (isEmpresaAdmin()) {
            fetchHistory();
        }
    }, []);

    const fetchCurrentSession = async () => {
        try {
            const response = await fetch(`${API_URL}/cash/current`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setSession(data.session);
        } catch (err) {
            console.error('Error fetching session:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await fetch(`${API_URL}/cash/history?limit=10`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setHistory(data);
        } catch (err) {
            console.error('Error fetching history:', err);
        }
    };

    const handleOpenCash = async () => {
        setActionLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_URL}/cash/open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ opening_amount: parseFloat(openingAmount) || 0 })
            });

            const data = await response.json();

            if (response.ok) {
                setShowOpenModal(false);
                setOpeningAmount('');
                fetchCurrentSession();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al abrir caja');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCloseCash = async () => {
        setActionLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_URL}/cash/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ declared_amount: parseFloat(declaredAmount) || 0 })
            });

            const data = await response.json();

            if (response.ok) {
                setCloseResult(data);
                setSession(null);
                fetchHistory();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al cerrar caja');
        } finally {
            setActionLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleString('es-MX', {
            dateStyle: 'short',
            timeStyle: 'short'
        });
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-ink">Control de Caja</h1>
                <p className="text-muted">Gestiona la apertura y cierre de caja</p>
            </div>

            {error && (
                <div className="bg-bad-soft text-bad border border-bad/30 p-4 rounded-lg mb-6">
                    {error}
                    <button onClick={() => setError('')} className="float-right hover:text-ink">&times;</button>
                </div>
            )}

            {/* Close Result Modal */}
            {closeResult && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="glass-card-dark p-8 max-w-md w-full border border-line text-center">
                        {closeResult.status === 'correcto' ? (
                            <>
                                <div className="text-6xl mb-4">✅</div>
                                <h2 className="text-2xl font-bold text-ok mb-4">Caja Cerrada Correctamente</h2>
                                <p className="text-ink">El arqueo coincide perfectamente.</p>
                            </>
                        ) : closeResult.status === 'revision_requerida' ? (
                            <>
                                <div className="text-6xl mb-4">⚠️</div>
                                <h2 className="text-2xl font-bold text-warn mb-4">Revisión Requerida</h2>
                                <p className="text-ink">{closeResult.message}</p>
                            </>
                        ) : (
                            <>
                                <div className="text-6xl mb-4">📊</div>
                                <h2 className="text-2xl font-bold text-blue-700 mb-4">Caja Cerrada con Diferencia</h2>
                                <div className="bg-surface rounded-lg p-4 mb-4 text-left">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-muted">Esperado:</span>
                                        <span className="text-ink">{formatCurrency(closeResult.expected_amount)}</span>
                                    </div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-muted">Declarado:</span>
                                        <span className="text-ink">{formatCurrency(closeResult.declared_amount)}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-line pt-2">
                                        <span className="text-muted">Diferencia:</span>
                                        <span className={closeResult.difference > 0 ? 'text-ok' : 'text-bad'}>
                                            {closeResult.difference > 0 ? '+' : ''}{formatCurrency(closeResult.difference)}
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}
                        <button
                            onClick={() => { setCloseResult(null); setShowCloseModal(false); setDeclaredAmount(''); }}
                            className="btn-primary mt-4"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}

            {/* Current Session Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card-dark p-6">
                    <h2 className="text-lg font-semibold text-ink mb-4">Estado Actual</h2>

                    {session ? (
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                                <span className="text-ok font-medium">Caja Abierta</span>
                            </div>

                            <div className="bg-surface rounded-lg p-4 mb-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-muted text-sm">Monto Inicial</p>
                                        <p className="text-xl font-bold text-ink">{formatCurrency(session.opening_amount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted text-sm">Ventas en Efectivo</p>
                                        <p className="text-xl font-bold text-accent">{formatCurrency(session.current_sales_total)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted text-sm">Abierta por</p>
                                        <p className="text-ink">{session.opened_by_username}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted text-sm">Desde</p>
                                        <p className="text-ink">{formatDate(session.opened_at)}</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowCloseModal(true)}
                                className="w-full px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold rounded-control shadow-lg hover:shadow-xl transition-all"
                            >
                                Cerrar Caja
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                                <span className="text-muted font-medium">Caja Cerrada</span>
                            </div>

                            <p className="text-muted mb-4">
                                Abre la caja para comenzar a registrar ventas.
                            </p>

                            <button
                                onClick={() => setShowOpenModal(true)}
                                className="w-full btn-primary"
                            >
                                Abrir Caja
                            </button>
                        </div>
                    )}
                </div>

                {/* History (Admin Only) */}
                {isEmpresaAdmin() && (
                    <div className="glass-card-dark p-6">
                        <h2 className="text-lg font-semibold text-ink mb-4">Historial Reciente</h2>

                        {history.length === 0 ? (
                            <p className="text-muted">No hay registros de caja anteriores.</p>
                        ) : (
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                {history.map((h) => (
                                    <div key={h.id} className="bg-surface rounded-lg p-3 flex justify-between items-center">
                                        <div>
                                            <p className="text-sm text-ink">{h.opened_by_username}</p>
                                            <p className="text-xs text-muted">{formatDate(h.opened_at)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-ink">{formatCurrency(h.opening_amount)}</p>
                                            {h.status === 'closed' && (
                                                <span className={`text-xs ${h.difference === 0 ? 'text-ok' : 'text-warn'}`}>
                                                    {h.difference === 0 ? '✓ OK' : `Dif: ${formatCurrency(h.difference)}`}
                                                </span>
                                            )}
                                            {h.status === 'open' && (
                                                <span className="text-xs text-ok">Abierta</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Open Modal */}
            {showOpenModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="glass-card-dark p-6 max-w-md w-full border border-line">
                        <h2 className="text-xl font-bold text-ink mb-4">Abrir Caja</h2>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-ink mb-2">
                                Monto Inicial en Caja
                            </label>
                            <input
                                type="number"
                                value={openingAmount}
                                onChange={(e) => setOpeningAmount(e.target.value)}
                                className="input-dark text-2xl text-center"
                                placeholder="0.00"
                                autoFocus
                            />
                            <p className="text-muted text-sm mt-2">
                                Ingresa el efectivo con el que inicias el día
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowOpenModal(false)}
                                className="flex-1 px-4 py-3 text-ink hover:bg-raised rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleOpenCash}
                                disabled={actionLoading}
                                className="flex-1 btn-primary"
                            >
                                {actionLoading ? 'Abriendo...' : 'Abrir Caja'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Modal */}
            {showCloseModal && !closeResult && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="glass-card-dark p-6 max-w-md w-full border border-line">
                        <h2 className="text-xl font-bold text-ink mb-4">Cerrar Caja</h2>

                        <div className="bg-warn-soft border border-warn/30 rounded-lg p-4 mb-4">
                            <p className="text-warn text-sm">
                                <strong>Corte Ciego:</strong> Cuenta el efectivo físico en caja y registra el total.
                                El sistema validará automáticamente.
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-ink mb-2">
                                Monto Declarado (Efectivo Contado)
                            </label>
                            <input
                                type="number"
                                value={declaredAmount}
                                onChange={(e) => setDeclaredAmount(e.target.value)}
                                className="input-dark text-2xl text-center"
                                placeholder="0.00"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowCloseModal(false); setDeclaredAmount(''); }}
                                className="flex-1 px-4 py-3 text-ink hover:bg-raised rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCloseCash}
                                disabled={actionLoading}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold rounded-control"
                            >
                                {actionLoading ? 'Cerrando...' : 'Confirmar Cierre'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
