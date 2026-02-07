import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

// Smart Progress Component with Inverted Hierarchy
const GoalProgress = ({ title, current, target, isEditing, onTargetChange, icon, previousValue }) => {
    const progress = target > 0 ? (current / target) * 100 : 0;
    const excess = current - target;

    // Smart Color Logic
    let colorClass = "text-blue-500";
    let progressBarColor = "bg-blue-500";

    if (progress >= 100) {
        colorClass = "text-emerald-500";
        progressBarColor = "bg-emerald-500";
    } else if (progress > 80) {
        colorClass = "text-orange-500";
        progressBarColor = "bg-orange-500";
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 animate-fade-in-up">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-slate-700/50 ${colorClass}`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
                        {isEditing ? (
                            <input
                                type="number"
                                value={target}
                                onChange={(e) => onTargetChange(e.target.value)}
                                className="mt-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white w-32 focus:outline-none focus:border-primary-500 transition-colors"
                                placeholder="Meta $"
                            />
                        ) : (
                            <p className="text-2xl font-bold text-white mt-1">
                                ${Number(target || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        )}
                    </div>
                </div>

                {/* Achievement Badge */}
                {progress >= 100 && (
                    <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-1 animate-pulse">
                        <span className="text-xs font-bold text-emerald-400">¡META ALCANZADA!</span>
                        <span className="text-emerald-400">✨</span>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-end">
                    <div className="text-sm">
                        <span className="text-slate-400">Llevamos: </span>
                        <span className={`font-semibold ${colorClass}`}>
                            ${Number(current || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {/* Previous period indicator (when current is $0) */}
                        {current === 0 && previousValue > 0 && (
                            <div className="text-xs text-slate-500 mt-1">
                                Periodo anterior: ${Number(previousValue || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        )}
                    </div>
                    {/* Show excess instead of percentage > 100% */}
                    {progress >= 100 ? (
                        <span className={`text-sm font-bold ${colorClass}`}>
                            +${Number(excess || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sobre el objetivo
                        </span>
                    ) : (
                        <span className={`text-sm font-bold ${colorClass}`}>
                            {progress.toFixed(1)}%
                        </span>
                    )}
                </div>

                {/* Smart Progress Bar with Labels */}
                <div className="relative pt-1">
                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-slate-700">
                        <div
                            style={{ width: `${Math.min(progress, 100)}%` }}
                            className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-1000 ease-out ${progressBarColor}`}
                        ></div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 -mt-2">
                        <span>$0</span>
                        <span>${target?.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function Dashboard() {
    const { user, token, hasFeature } = useAuth();
    const [goals, setGoals] = useState({ weekly: null, monthly: null });
    const [statistics, setStatistics] = useState(null);
    const [editingGoals, setEditingGoals] = useState(false);
    const [goalValues, setGoalValues] = useState({ weekly: '', monthly: '' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Auto-refresh every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [goalsRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/sales/goals`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${API_URL}/sales/statistics`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            if (goalsRes.ok) {
                const goalsData = await goalsRes.json();
                setGoals(goalsData);
                setGoalValues({
                    weekly: goalsData.weekly?.target || '',
                    monthly: goalsData.monthly?.target || ''
                });
            }

            if (statsRes.ok) {
                setStatistics(await statsRes.json());
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveGoals = async () => {
        try {
            const res = await fetch(`${API_URL}/sales/goals`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    weekly_target: parseFloat(goalValues.weekly) || 0,
                    monthly_target: parseFloat(goalValues.monthly) || 0
                })
            });

            if (res.ok) {
                alert('Metas actualizadas correctamente');
                setEditingGoals(false);
                fetchData();
            } else {
                const errorData = await res.json();
                alert(`Error al guardar: ${errorData.error || 'Error desconocido'}`);
            }
        } catch (error) {
            console.error('Error saving goals:', error);
            alert('Error de conexión al guardar las metas.');
        }
    };

    // Helper for consistency
    const formatCurrency = (amount) => {
        return Number(amount || 0).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    // Date Labels Logic
    const getDateLabels = () => {
        const now = new Date();
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        // Today
        const todayLabel = `${now.getDate()} ${months[now.getMonth()].substring(0, 3)}`;

        // This Week (Monday - Today)
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(now.setDate(diff));
        // Reset now for safety if referenced again, though setDate mutates. 
        // Better to create new instances.
        const curr = new Date();
        const first = curr.getDate() - curr.getDay() + 1 + (curr.getDay() === 0 ? -6 : 0);
        const thisMonday = new Date(curr.setDate(first));
        const weekLabel = `${thisMonday.getDate()} ${months[thisMonday.getMonth()].substring(0, 3)} - ${new Date().getDate()} ${months[new Date().getMonth()].substring(0, 3)}`;

        // This Month
        const monthLabel = months[new Date().getMonth()];

        return { today: todayLabel, week: weekLabel, month: monthLabel };
    };

    const dateLabels = getDateLabels();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Welcome Section */}
            <div className="glass-card p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">
                            ¡Bienvenido, <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">{user?.username}</span>!
                        </h1>
                        <p className="text-slate-400 mt-1">
                            {new Date().toLocaleDateString('es-MX', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
                    {user?.is_admin && (
                        <span className="px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-full text-amber-400 text-sm font-medium">
                            Administrador
                        </span>
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="stat-card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-500/20 rounded-xl">
                            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-slate-500 uppercase tracking-wide block">Hoy</span>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-700/50">{dateLabels.today}</span>
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white">${formatCurrency(statistics?.today?.total)}</p>
                    <p className="text-sm text-slate-400 mt-1">{statistics?.today?.count || 0} ventas</p>
                </div>

                <div className="stat-card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-primary-500/20 rounded-xl">
                            <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-slate-500 uppercase tracking-wide block">Esta Semana</span>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-700/50">{dateLabels.week}</span>
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white">${formatCurrency(statistics?.week?.total)}</p>
                    <p className="text-sm text-slate-400 mt-1">{statistics?.week?.count || 0} ventas</p>
                </div>

                {/* THIS MONTH Widget */}
                <div className="stat-card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-accent-500/20 rounded-xl">
                            <svg className="w-6 h-6 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-slate-500 uppercase tracking-wide block">Este Mes</span>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-700/50">{dateLabels.month}</span>
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white">${formatCurrency(statistics?.month?.total)}</p>
                    <p className="text-sm text-slate-400 mt-1">{statistics?.month?.count || 0} ventas</p>
                </div>

                {/* SUPPLIER DEBT Widget (New) */}
                {(user?.role === 'empresa_admin' || user?.role === 'global_admin') && (
                    <div className="stat-card border-red-500/20 bg-red-500/5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-red-500/20 rounded-xl">
                                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-slate-500 uppercase tracking-wide block">Pago a Proveedores</span>
                                <span className="text-[10px] text-red-400 font-medium bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">Hoy</span>
                            </div>
                        </div>
                        <p className="text-3xl font-bold text-white">${formatCurrency(statistics?.totalSupplierDebt)}</p>
                        <p className="text-sm text-slate-400 mt-1">Deuda generada hoy</p>
                    </div>
                )}
            </div>

            {/* Sales Goals */}
            <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">Metas de Ventas</h2>
                    {(user?.is_admin || user?.role === 'empresa_admin' || user?.role === 'global_admin') && (
                        <button
                            onClick={() => editingGoals ? handleSaveGoals() : setEditingGoals(true)}
                            className="btn-secondary text-sm px-4 py-2"
                        >
                            {editingGoals ? 'Guardar' : 'Editar Metas'}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <GoalProgress
                        title="Meta Semanal"
                        current={goals.weekly?.current || 0}
                        target={editingGoals ? goalValues.weekly : (goals.weekly?.target || 0)}
                        isEditing={editingGoals}
                        onTargetChange={(val) => setGoalValues({ ...goalValues, weekly: val })}
                        previousValue={statistics?.previousWeek?.total || 0}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        }
                    />

                    <GoalProgress
                        title="Objetivo Mensual"
                        current={goals.monthly?.current || 0}
                        target={editingGoals ? goalValues.monthly : (goals.monthly?.target || 0)}
                        isEditing={editingGoals}
                        onTargetChange={(val) => setGoalValues({ ...goalValues, monthly: val })}
                        previousValue={0}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        }
                    />
                </div>
            </div>

            {/* Payment Method Breakdown */}
            {hasFeature('sales_statistics') && statistics?.paymentBreakdown && (
                <div className="glass-card p-6">
                    <h2 className="text-xl font-semibold mb-6">Desglose por Método de Pago</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {statistics.paymentBreakdown.map((method) => (
                            <div key={method.payment_method} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
                                <div className={`p-3 rounded-xl ${method.payment_method === 'cash'
                                    ? 'bg-emerald-500/20'
                                    : 'bg-blue-500/20'
                                    }`}>
                                    {method.payment_method === 'cash' ? (
                                        <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium capitalize">
                                        {method.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'}
                                    </p>
                                    <p className="text-sm text-slate-400">{method.count} transacciones</p>
                                </div>
                                <p className="text-xl font-bold">${formatCurrency(method.total)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
