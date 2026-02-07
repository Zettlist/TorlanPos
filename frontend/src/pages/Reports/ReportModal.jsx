import { useAuth } from '../../context/AuthContext';

export default function ReportModal({ report, onClose }) {
    const { user } = useAuth();
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount || 0);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        try {
            if (report.type === 'monthly') {
                if (!dateStr.includes('-')) return dateStr;
                const [year, month] = dateStr.split('-');
                const date = new Date(year, parseInt(month) - 1, 1);
                if (isNaN(date.getTime())) return dateStr;
                return new Intl.DateTimeFormat('es-MX', {
                    month: 'long',
                    year: 'numeric'
                }).format(date);
            } else {
                const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
                const date = new Date(cleanDate + 'T00:00:00');
                if (isNaN(date.getTime())) return cleanDate;
                return new Intl.DateTimeFormat('es-MX', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }).format(date);
            }
        } catch (e) {
            console.error('Date error:', e);
            return dateStr;
        }
    };

    const formatDateTime = (dateTimeStr) => {
        if (!dateTimeStr) return 'N/A';
        try {
            const date = new Date(dateTimeStr);
            if (isNaN(date.getTime())) return dateTimeStr;
            return new Intl.DateTimeFormat('es-MX', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch (e) {
            return dateTimeStr;
        }
    };

    const handlePrint = () => {
        // Ensure DOM is fully loaded before printing
        setTimeout(() => {
            window.print();
        }, 100);
    };

    const handleExportPDF = async () => {
        // Export as PDF using browser print dialog
        setTimeout(() => {
            window.print();
        }, 100);
    };

    const { metrics, teamPerformance, cashSessions, topProducts, stockAlerts, paymentBreakdown } = report;
    const period = report.date || report.month;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in modal-overlay">
            <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col modal-content">
                {/* Header */}
                <div className="bg-gradient-to-r from-primary-600 to-accent-600 p-6 flex items-center justify-between print:hidden">
                    <div>
                        <h2 className="text-2xl font-bold text-white capitalize">
                            📊 Reporte de Ventas - {formatDate(period)}
                        </h2>
                        <p className="text-primary-100 text-sm mt-1">
                            Reporte {report.type === 'daily' ? 'Diario' : 'Mensual'} Completo
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleExportPDF}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-2"
                            title="Exportar a PDF"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            PDF
                        </button>
                        <button
                            onClick={handlePrint}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-2"
                            title="Imprimir"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Imprimir
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg transition-colors"
                        >
                            ✕ Cerrar
                        </button>
                    </div>
                </div>

                {/* Print Header - Professional institutional header */}
                <div className="print-header hidden print:block">
                    <div style={{
                        padding: '20px',
                        borderBottom: '3px solid #000',
                        marginBottom: '20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                    }}>
                        <div>
                            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#000', margin: 0 }}>📚 Bisonte Manga</h1>
                            <p style={{ fontSize: '13px', color: '#555', margin: '3px 0 0 0' }}>Sistema de Punto de Venta</p>
                        </div>
                        <div style={{
                            textAlign: 'right',
                            border: '1px solid #ddd',
                            padding: '10px 15px',
                            backgroundColor: '#f8f8f8',
                            borderRadius: '4px'
                        }}>
                            <p style={{ fontSize: '12px', color: '#000', margin: '0 0 5px 0', fontWeight: 'bold' }}>REPORTE DE AUDITORÍA</p>
                            <p style={{ fontSize: '11px', color: '#666', margin: '2px 0' }}><strong>Periodo:</strong> {formatDate(period)}</p>
                            <p style={{ fontSize: '11px', color: '#666', margin: '2px 0' }}><strong>Generado:</strong> {new Date().toLocaleString('es-MX')}</p>
                            <p style={{ fontSize: '11px', color: '#666', margin: '2px 0' }}><strong>Usuario:</strong> {user?.username || 'Sistema'}</p>
                        </div>
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 printable-report">
                    {/* 1. RESUMEN EJECUTIVO - KPI Grid */}
                    <section className="audit-section">
                        <h2 className="section-title">
                            <span className="section-icon print:hidden">📊</span>
                            Resumen Ejecutivo
                        </h2>
                        <hr className="section-divider" />

                        <div className="kpi-grid">
                            <div className="kpi-card kpi-primary">
                                <p className="kpi-label">Ventas Totales</p>
                                <p className="kpi-value">{formatCurrency(metrics.totalSales)}</p>
                                <p className="kpi-context">{metrics.transactionCount} transacciones</p>
                            </div>
                            <div className="kpi-card kpi-success">
                                <p className="kpi-label">Ganancia Neta</p>
                                <p className="kpi-value">{formatCurrency(metrics.profit)}</p>
                                <p className="kpi-context">Margen: {metrics.profitMargin.toFixed(1)}%</p>
                            </div>
                            <div className="kpi-card kpi-info">
                                <p className="kpi-label">Ticket Promedio</p>
                                <p className="kpi-value">{formatCurrency(metrics.averageTicket)}</p>
                                <p className="kpi-context">Por venta</p>
                            </div>
                            <div className="kpi-card kpi-warning">
                                <p className="kpi-label">Inversión Total</p>
                                <p className="kpi-value">{formatCurrency(metrics.totalCost)}</p>
                                <p className="kpi-context">Costo de productos</p>
                            </div>
                            <div className="kpi-card bg-red-500/10 border-red-500/30">
                                <p className="kpi-label !text-red-400">Pago a Proveedores</p>
                                <p className="kpi-value !text-red-200">{formatCurrency(metrics.totalSupplierDebt)}</p>
                                <p className="kpi-context !text-red-400/70">Deuda generada</p>
                            </div>
                        </div>

                        {/* Goal Progress (Monthly only) */}
                        {report.goal && (
                            <div className="mt-6 glass-card-dark p-4">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-slate-400">Meta del Mes</span>
                                    <span className="font-bold text-primary-400">{formatCurrency(report.goal)}</span>
                                </div>
                                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all rounded-full ${(metrics.totalSales / report.goal) * 100 >= 100
                                            ? 'bg-green-500'
                                            : 'bg-primary-500'
                                            }`}
                                        style={{ width: `${Math.min((metrics.totalSales / report.goal) * 100, 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-400 mt-1 text-right">
                                    {((metrics.totalSales / report.goal) * 100).toFixed(1)}% completado
                                </p>
                            </div>
                        )}
                    </section>

                    {/* 2. BLOQUE 2: Desempeño del Equipo */}
                    <section className="audit-section">
                        <h2 className="section-title">
                            <span className="section-icon print:hidden">👥</span>
                            Desempeño del Equipo
                        </h2>
                        <hr className="section-divider" />

                        <div className="glass-card-dark overflow-hidden">
                            <table className="data-table w-full">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left p-3 text-sm font-medium text-slate-400">Empleado</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-400">Ventas</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-400">Total</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-400">Contribución</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {teamPerformance.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="p-6 text-center text-slate-500">
                                                No hay datos de ventas
                                            </td>
                                        </tr>
                                    ) : (
                                        teamPerformance.map((member, idx) => (
                                            <tr key={member.userId} className="border-b border-white/5">
                                                <td className="p-3 font-medium">
                                                    <span className="print:hidden">{idx === 0 && '🏆'}</span>
                                                    {member.username}
                                                </td>
                                                <td className="p-3 text-right">{member.salesCount}</td>
                                                <td className="p-3 text-right font-semibold text-primary-400">
                                                    {formatCurrency(member.salesTotal)}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-primary-500 rounded-full"
                                                                style={{
                                                                    width: `${(member.salesTotal / metrics.totalSales) * 100}%`
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="text-sm text-slate-400">
                                                            {((member.salesTotal / metrics.totalSales) * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 3. BLOQUE 1: Operación de Cajas */}
                    <section className="audit-section">
                        <h2 className="section-title">
                            <span className="section-icon print:hidden">💵</span>
                            Operación de Cajas
                        </h2>
                        <hr className="section-divider" />
                        <div className="glass-card-dark overflow-hidden">
                            <table className="data-table w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left p-3 font-medium text-slate-400">Usuario</th>
                                        <th className="text-right p-3 font-medium text-slate-400">Apertura</th>
                                        <th className="text-right p-3 font-medium text-slate-400">Cierre</th>
                                        <th className="text-right p-3 font-medium text-slate-400">Esperado</th>
                                        <th className="text-right p-3 font-medium text-slate-400">Declarado</th>
                                        <th className="text-right p-3 font-medium text-slate-400">Diferencia</th>
                                        <th className="text-center p-3 font-medium text-slate-400">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cashSessions.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="p-6 text-center text-slate-500">
                                                No hay cajas registradas
                                            </td>
                                        </tr>
                                    ) : (
                                        cashSessions.map((session) => (
                                            <tr key={session.id} className="border-b border-white/5">
                                                <td className="p-3">{session.username}</td>
                                                <td className="p-3 text-right text-xs text-slate-400">
                                                    {formatDateTime(session.opened_at)}
                                                </td>
                                                <td className="p-3 text-right text-xs text-slate-400">
                                                    {session.closed_at ? formatDateTime(session.closed_at) : 'Abierta'}
                                                </td>
                                                <td className="p-3 text-right">
                                                    {formatCurrency(session.expected_amount)}
                                                </td>
                                                <td className="p-3 text-right">
                                                    {formatCurrency(session.declared_amount)}
                                                </td>
                                                <td className={`p-3 text-right font-bold ${session.difference === 0
                                                    ? 'text-green-400'
                                                    : session.difference > 0
                                                        ? 'text-accent-400'
                                                        : 'text-red-400'
                                                    }`}>
                                                    {session.difference > 0 && '+'}
                                                    {formatCurrency(session.difference)}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {session.auto_closed ? (
                                                        <span className="text-xs px-2 py-1 bg-orange-500/20 text-orange-300 rounded">
                                                            🤖 Auto
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded">
                                                            ✓ Manual
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 4. BLOQUE 3: Métodos de Pago */}
                    <section className="audit-section">
                        <h2 className="section-title">
                            <span className="section-icon print:hidden">💳</span>
                            Métodos de Pago
                        </h2>
                        <hr className="section-divider" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="glass-card-dark p-4 border-l-4 border-green-500">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-slate-400"><span className="print:hidden">💵</span> Efectivo</span>
                                    <span className="text-2xl font-bold text-green-400">
                                        {formatCurrency(paymentBreakdown.cash)}
                                    </span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full"
                                        style={{
                                            width: `${(paymentBreakdown.cash / metrics.totalSales) * 100}%`
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {((paymentBreakdown.cash / metrics.totalSales) * 100).toFixed(1)}% del total
                                </p>
                            </div>
                            <div className="glass-card-dark p-4 border-l-4 border-blue-500">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-slate-400"><span className="print:hidden">💳</span> Tarjeta</span>
                                    <span className="text-2xl font-bold text-blue-400">
                                        {formatCurrency(paymentBreakdown.card)}
                                    </span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 rounded-full"
                                        style={{
                                            width: `${(paymentBreakdown.card / metrics.totalSales) * 100}%`
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {((paymentBreakdown.card / metrics.totalSales) * 100).toFixed(1)}% del total
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 5. BLOQUE 4: Análisis de Inventario */}
                    <section className="audit-section">
                        <h2 className="section-title">
                            <span className="section-icon print:hidden">📦</span>
                            Análisis de Inventario
                        </h2>
                        <hr className="section-divider" />

                        {/* Top Products */}
                        <div className="mb-6 avoid-break">
                            <h3 className="subsection-title"><span className="print:hidden">🏆</span> Top 5 Productos Más Vendidos</h3>
                            <div className="glass-card-dark divide-y divide-white/5">
                                {topProducts.length === 0 ? (
                                    <p className="p-6 text-center text-slate-500">
                                        No hay datos de productos
                                    </p>
                                ) : (
                                    topProducts.slice(0, 5).map((product, idx) => (
                                        <div key={product.productId} className="p-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl print:hidden">
                                                    {idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•'}
                                                </span>
                                                <div>
                                                    <p className="font-medium">{product.productName}</p>
                                                    <p className="text-xs text-slate-400">
                                                        {product.quantitySold} unidades vendidas
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="font-bold text-primary-400">
                                                {formatCurrency(product.revenue)}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Stock Alerts */}
                        <div className="avoid-break">
                            <h3 className="subsection-title"><span className="print:hidden">⚠️</span> Alertas de Stock Crítico</h3>
                            {stockAlerts.length === 0 ? (
                                <div className="glass-card-dark p-4 text-center text-slate-500">
                                    ✅ Sin alertas - todo en stock
                                </div>
                            ) : (
                                <div className="glass-card-dark divide-y divide-white/5">
                                    {stockAlerts.map((alert) => (
                                        <div key={alert.productId} className="p-3 flex items-center justify-between bg-red-500/10">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl print:hidden">🚨</span>
                                                <div>
                                                    <p className="font-medium text-red-300">{alert.productName}</p>
                                                    <p className="text-xs text-red-400">
                                                        Stock actual: {alert.currentStock} · Última venta: {formatDateTime(alert.lastSoldAt)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Print Styles */}
                <style jsx>{`
                    /* Screen styles for report structure */
                    .audit-section {
                        margin-bottom: 2rem;
                    }

                    .section-title {
                        font-size: 1.25rem;
                        font-weight: bold;
                        margin-bottom: 0.75rem;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                    }

                    .section-icon {
                        font-size: 1.5rem;
                    }

                    .section-divider {
                        border: none;
                        border-top: 2px solid rgba(255, 255, 255, 0.2);
                        margin: 1rem 0 1.5rem 0;
                    }

                    .subsection-title {
                        font-size: 1rem;
                        font-weight: 600;
                        margin-bottom: 0.75rem;
                        color: rgba(203, 213, 225, 1);
                    }

                    .kpi-grid {
                        display: grid;
                        grid-template-columns: repeat(5, 1fr);
                        gap: 1rem;
                        margin-bottom: 1.5rem;
                    }

                    .kpi-card {
                        background: rgba(15, 23, 42, 0.5);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(148, 163, 184, 0.3);
                        border-radius: 0.75rem;
                        padding: 1.25rem;
                        text-align: center;
                    }

                    .kpi-label {
                        font-size: 0.875rem;
                        color: rgba(148, 163, 184, 1);
                        margin-bottom: 0.5rem;
                        font-weight: 500;
                    }

                    .kpi-value {
                        font-size: 2rem;
                        font-weight: bold;
                        color: white;
                        margin: 0.5rem 0;
                    }

                    .kpi-context {
                        font-size: 0.75rem;
                        color: rgba(148, 163, 184, 0.7);
                        margin-top: 0.25rem;
                    }

                    .data-table {
                        width: 100%;
                    }

                    @media print {
                        /* Font */
                        body {
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                        }

                        /* Show only printable content */
                        body * {
                            visibility: hidden;
                        }
                        
                        /* But show our modal content */
                        .modal-overlay,
                        .modal-overlay * {
                            visibility: visible !important;
                        }
                        

                        
                        .modal-overlay {
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            width: 100% !important;
                            height: auto !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            background: white !important;
                            z-index: 9999 !important;
                            display: block !important;
                        }

                        .modal-content {
                            box-shadow: none !important;
                            border: none !important;
                            border-radius: 0 !important;
                            max-width: none !important;
                            max-height: none !important;
                            width: 100% !important;
                            height: auto !important;
                            overflow: visible !important;
                            background: white !important;
                            display: block !important; /* Block is better for printing than flex */
                        }

                        .printable-report {
                            position: relative !important; /* Relative to flow */
                            width: 100% !important;
                            background: white !important;
                            padding: 20px 40px !important;
                            display: block !important;
                        }
                        
                        .print-header {
                            position: relative !important;
                            width: 100% !important;
                            margin-bottom: 30px !important;
                            display: block !important;
                            border-bottom: 2px solid #000 !important;
                        }

                        /* Audit sections */
                        .audit-section {
                            page-break-inside: avoid;
                            margin-bottom: 30px !important;
                        }

                        .section-title {
                            font-size: 18px !important;
                            font-weight: bold !important;
                            color: #000 !important;
                            margin-bottom: 8px !important;
                            border-bottom: none !important;
                        }

                        .section-icon {
                            margin-right: 8px;
                        }

                        .section-divider {
                            border: none !important;
                            border-top: 2px solid #000 !important;
                            margin: 10px 0 15px 0 !important;
                        }

                        .subsection-title {
                            font-size: 14px !important;
                            font-weight: 600 !important;
                            color: #333 !important;
                            margin: 15px 0 10px 0 !important;
                        }

                        /* KPI Grid - optimized for print */
                        .kpi-grid {
                            display: grid !important;
                            grid-template-columns: repeat(5, 1fr) !important;
                            gap: 15px !important;
                            margin-bottom: 25px !important;
                            page-break-inside: avoid;
                        }

                        .kpi-card {
                            border: 2px solid #000 !important;
                            border-radius: 4px !important;
                            padding: 15px !important;
                            background: white !important;
                            text-align: center !important;
                        }

                        .kpi-label {
                            font-size: 11px !important;
                            color: #666 !important;
                            margin-bottom: 5px !important;
                            font-weight: 600 !important;
                            text-transform: uppercase;
                        }

                        .kpi-value {
                            font-size: 24px !important;
                            font-weight: bold !important;
                            color: #000 !important;
                            margin: 8px 0 !important;
                        }

                        .kpi-context {
                            font-size: 10px !important;
                            color: #999 !important;
                            margin-top: 3px !important;
                        }

                        /* Ensure text is black */
                        .printable-report *,
                        .print-header * {
                            color: #000000 !important;
                            background: transparent !important;
                        }
                        
                        /* Table styling */
                        .data-table,
                        table {
                            border-collapse: collapse !important;
                            width: 100% !important;
                            page-break-inside: avoid;
                        }
                        
                        .data-table th,
                        .data-table td,
                        th, td {
                            border: 1px solid #000 !important;
                            padding: 12px 8px !important;
                            text-align: left !important;
                            font-size: 11px !important;
                        }
                        
                        .data-table th,
                        th {
                            background-color: #f0f0f0 !important;
                            font-weight: bold !important;
                            font-size: 10px !important;
                            text-transform: uppercase;
                        }
                        
                        /* Card styling for print */
                        .glass-card-dark {
                            background: white !important;
                            border: 1px solid #eee !important;
                            margin-bottom: 10px !important;
                            padding: 0 !important;
                        }
                        
                        /* Hide unwanted elements */
                        .print\\:hidden,
                        .section-icon,
                        .text-2xl.print\\:hidden {
                            display: none !important;
                        }

                        /* COMPACT MODE OVERRIDES */
                        .printable-report {
                            padding: 0 30px !important;
                            font-size: 10px !important;
                        }

                        .kpi-grid {
                            gap: 8px !important;
                            margin-bottom: 15px !important;
                        }

                        .kpi-card {
                            padding: 8px !important;
                            border: 1px solid #ccc !important;
                        }

                        .kpi-value {
                            font-size: 16px !important;
                            margin: 4px 0 !important;
                        }

                        /* Section spacing */
                        .audit-section {
                            margin-bottom: 20px !important;
                            display: block !important;
                            /* Removed page-break-inside: avoid to allow long sections to split */
                        }

                        .section-title {
                            break-after: avoid;
                            page-break-after: avoid;
                        }

                        .data-table th,
                        .data-table td,
                        th, td {
                            padding: 4px 8px !important;
                            font-size: 10px !important;
                            border-bottom: 1px solid #ccc !important;
                        }
                        
                        /* Avoid breaking items that shouldn't break */
                        .kpi-grid,
                        tr,
                        .kpi-card, 
                        .subsection-title {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
}
