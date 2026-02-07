import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import ReportModal from './ReportModal';

export default function SalesReports() {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'monthly'
    const [dailyData, setDailyData] = useState([]);
    const [monthlyData, setMonthlyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // Filters
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    useEffect(() => {
        fetchData();
    }, [activeTab, selectedMonth, selectedYear]);

    const fetchData = async () => {
        try {
            setLoading(true);
            if (activeTab === 'daily') {
                const month = selectedMonth || getCurrentMonth();
                const response = await fetch(`${API_URL}/reports/daily?month=${month}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setDailyData(data.data);
                }
            } else {
                const response = await fetch(`${API_URL}/reports/monthly?year=${selectedYear}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setMonthlyData(data.data);
                }
            }
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const getCurrentMonth = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    };

    const openDetailedReport = async (date, type) => {
        try {
            const endpoint = type === 'daily'
                ? `${API_URL}/reports/detailed-daily/${date}`
                : `${API_URL}/reports/detailed-monthly/${date}`;

            const response = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setSelectedReport({ ...data, type });
                setShowModal(true);
            }
        } catch (error) {
            console.error('Error fetching detailed report:', error);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Fecha inválida';
        try {
            // Handle if dateStr is already ISO
            const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
            const date = new Date(cleanDate + 'T00:00:00');
            if (isNaN(date.getTime())) return cleanDate;

            return new Intl.DateTimeFormat('es-MX', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }).format(date);
        } catch (e) {
            console.error('Date error:', e);
            return dateStr || 'Fecha inválida';
        }
    };

    const formatMonth = (monthStr) => {
        if (!monthStr || !monthStr.includes('-')) return monthStr;
        try {
            const [year, month] = monthStr.split('-');
            const date = new Date(year, parseInt(month) - 1, 1);
            if (isNaN(date.getTime())) return monthStr;

            return new Intl.DateTimeFormat('es-MX', {
                month: 'long',
                year: 'numeric'
            }).format(date);
        } catch (e) {
            return monthStr;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold mb-2">📊 Reportes de Ventas</h1>
                <p className="text-slate-400">Auditoría y análisis histórico para toma de decisiones estratégicas</p>
            </div>

            {/* Tabs Navigation */}
            <div className="glass-card-dark p-1 inline-flex gap-2 rounded-xl">
                <button
                    onClick={() => setActiveTab('daily')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'daily'
                        ? 'bg-primary-500 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    📅 Diario
                </button>
                <button
                    onClick={() => setActiveTab('monthly')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'monthly'
                        ? 'bg-primary-500 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    📆 Mensual
                </button>
            </div>

            {/* Filters */}
            <div className="glass-card-dark p-4 flex gap-4 items-center">
                {activeTab === 'daily' ? (
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">Mes</label>
                        <input
                            type="month"
                            value={selectedMonth || getCurrentMonth()}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="input-field"
                        />
                    </div>
                ) : (
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">Año</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="input-field"
                        >
                            {[...Array(5)].map((_, i) => {
                                const year = new Date().getFullYear() - i;
                                return <option key={year} value={year}>{year}</option>;
                            })}
                        </select>
                    </div>
                )}
                <button
                    onClick={fetchData}
                    className="btn-secondary mt-6"
                >
                    🔄 Actualizar
                </button>
            </div>

            {/* Daily Table */}
            {activeTab === 'daily' && (
                <div className="glass-card-dark overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left p-4 text-sm font-medium text-slate-400">Fecha</th>
                                    <th className="text-right p-4 text-sm font-medium text-slate-400">Ventas Totales</th>
                                    <th className="text-right p-4 text-sm font-medium text-slate-400">Cajas Cerradas</th>
                                    <th className="text-right p-4 text-sm font-medium text-slate-400">Ticket Promedio</th>
                                    <th className="text-center p-4 text-sm font-medium text-slate-400">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyData.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-slate-500">
                                            No hay datos para este periodo
                                        </td>
                                    </tr>
                                ) : (
                                    dailyData.map((row) => (
                                        <tr key={row.date} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="p-4">{formatDate(row.date)}</td>
                                            <td className="p-4 text-right font-semibold text-primary-400">
                                                {formatCurrency(row.totalSales)}
                                            </td>
                                            <td className="p-4 text-right">{row.cashSessionsCount}</td>
                                            <td className="p-4 text-right text-slate-300">
                                                {formatCurrency(row.averageTicket)}
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => openDetailedReport(row.date, 'daily')}
                                                    className="btn-primary text-sm px-4 py-2"
                                                >
                                                    📄 Ver Reporte
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Monthly Table */}
            {activeTab === 'monthly' && (
                <div className="glass-card-dark overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left p-4 text-sm font-medium text-slate-400">Mes/Año</th>
                                    <th className="text-right p-4 text-sm font-medium text-slate-400">Ventas Totales</th>
                                    <th className="text-right p-4 text-sm font-medium text-slate-400">Meta</th>
                                    <th className="text-right p-4 text-sm font-medium text-slate-400">Meta Alcanzada</th>
                                    <th className="text-center p-4 text-sm font-medium text-slate-400">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyData.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-slate-500">
                                            No hay datos para este año
                                        </td>
                                    </tr>
                                ) : (
                                    monthlyData.map((row) => (
                                        <tr key={row.month} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="p-4 capitalize">{formatMonth(row.month)}</td>
                                            <td className="p-4 text-right font-semibold text-primary-400">
                                                {formatCurrency(row.totalSales)}
                                            </td>
                                            <td className="p-4 text-right text-slate-300">
                                                {formatCurrency(row.goal)}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className={`font-bold ${row.goalAchieved ? 'text-green-400' : 'text-orange-400'
                                                    }`}>
                                                    {row.goalPercentage.toFixed(1)}%
                                                </span>
                                                {row.goalAchieved && ' ✅'}
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => openDetailedReport(row.month, 'monthly')}
                                                    className="btn-primary text-sm px-4 py-2"
                                                >
                                                    📄 Ver Reporte
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {showModal && selectedReport && (
                <ReportModal
                    report={selectedReport}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedReport(null);
                    }}
                />
            )}
        </div>
    );
}
