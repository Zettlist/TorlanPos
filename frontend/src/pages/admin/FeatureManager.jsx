import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function FeatureManager() {
    const { user, token } = useAuth();
    const [data, setData] = useState({ users: [], availableFeatures: [] });
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userStats, setUserStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // Redirect non-admins
    if (!user?.is_admin) {
        return <Navigate to="/" replace />;
    }

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (selectedUser) {
            fetchUserStats(selectedUser.id);
        }
    }, [selectedUser]);

    const fetchData = async () => {
        try {
            const response = await fetch(`${API_URL}/features/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const newData = await response.json();
                setData(newData);

                // Update selectedUser with fresh data if one is selected
                if (selectedUser) {
                    const updatedUser = newData.users.find(u => u.id === selectedUser.id);
                    if (updatedUser) {
                        setSelectedUser(updatedUser);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching features:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserStats = async (userId) => {
        setLoadingStats(true);
        try {
            const response = await fetch(`${API_URL}/sales/user-stats/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                setUserStats(await response.json());
            } else {
                setUserStats(null);
            }
        } catch (error) {
            console.error('Error fetching user stats:', error);
            setUserStats(null);
        } finally {
            setLoadingStats(false);
        }
    };

    const toggleFeature = async (userId, featureId, featureName, currentState) => {
        setUpdating(`${userId}-${featureId}`);
        try {
            const response = await fetch(`${API_URL}/features/toggle/${userId}/${featureId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ enabled: !currentState })
            });

            if (response.ok) {
                // Update local state immediately for instant feedback
                if (selectedUser && selectedUser.id === userId) {
                    setSelectedUser(prev => ({
                        ...prev,
                        features: {
                            ...prev.features,
                            [featureName]: !currentState
                        }
                    }));
                }
                // Also refresh the data from server
                fetchData();
            }
        } catch (error) {
            console.error('Error toggling feature:', error);
        } finally {
            setUpdating(null);
        }
    };

    const getFeatureIcon = (name) => {
        const icons = {
            sales_statistics: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
            competitor_prices: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
            ),
            advances: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            suppliers: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
            )
        };
        return icons[name] || (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-2rem)] flex gap-6 animate-fade-in">
            {/* Users List (Master) */}
            <div className={`flex flex-col transition-all duration-300 ${selectedUser ? 'w-80' : 'flex-1'}`}>
                {/* Header */}
                <div className="mb-4">
                    <h1 className="text-2xl font-bold">Gestión de Funciones</h1>
                    <p className="text-slate-400">{data.users.length} usuarios registrados</p>
                </div>

                {/* Users List */}
                <div className="flex-1 overflow-auto space-y-2">
                    {data.users.map(u => (
                        <button
                            key={u.id}
                            onClick={() => setSelectedUser(u)}
                            className={`w-full glass-card p-4 text-left transition-all hover:border-primary-500/50 ${selectedUser?.id === u.id ? 'border-primary-500 bg-primary-500/10' : ''
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg ${u.is_admin
                                    ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                                    : 'bg-gradient-to-br from-primary-500 to-accent-500'
                                    }`}>
                                    {u.username.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{u.username}</p>
                                    <div className="flex items-center gap-2">
                                        {u.is_admin ? (
                                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">
                                                Admin
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs font-medium">
                                                Usuario
                                            </span>
                                        )}
                                        {!u.has_setup_complete && (
                                            <span className="text-xs text-slate-500">• Pendiente</span>
                                        )}
                                    </div>
                                </div>
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* User Detail Panel (Detail) */}
            {selectedUser && (
                <div className="flex-1 flex flex-col glass-card-dark animate-fade-in overflow-hidden">
                    {/* User Header */}
                    <div className="p-6 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl ${selectedUser.is_admin
                                    ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                                    : 'bg-gradient-to-br from-primary-500 to-accent-500'
                                    }`}>
                                    {selectedUser.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{selectedUser.username}</h2>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-400">
                                            {selectedUser.is_admin ? 'Administrador' : 'Usuario'}
                                        </span>
                                        <span className="text-slate-500">•</span>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const response = await fetch(`${API_URL}/features/users/${selectedUser.id}/status`, {
                                                        method: 'PUT',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            'Authorization': `Bearer ${token}`
                                                        },
                                                        body: JSON.stringify({ has_setup_complete: !selectedUser.has_setup_complete })
                                                    });
                                                    if (response.ok) {
                                                        setSelectedUser(prev => ({
                                                            ...prev,
                                                            has_setup_complete: !prev.has_setup_complete
                                                        }));
                                                        fetchData();
                                                    }
                                                } catch (error) {
                                                    console.error('Error toggling status:', error);
                                                }
                                            }}
                                            className={`px-2 py-0.5 rounded text-xs font-medium transition-all hover:scale-105 ${selectedUser.has_setup_complete
                                                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                                : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                                }`}
                                            title="Clic para cambiar estado"
                                        >
                                            {selectedUser.has_setup_complete ? '✓ Activo' : '⏳ Setup pendiente'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setSelectedUser(null);
                                    setUserStats(null);
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                        {/* User Stats Dashboard */}
                        <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Dashboard de Operaciones
                            </h3>

                            {loadingStats ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-500"></div>
                                </div>
                            ) : userStats ? (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-white/5 rounded-xl p-4">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Ventas Totales</p>
                                        <p className="text-2xl font-bold text-emerald-400">${userStats.totalSales?.toFixed(2) || '0.00'}</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Transacciones</p>
                                        <p className="text-2xl font-bold text-primary-400">{userStats.totalTransactions || 0}</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Ventas Hoy</p>
                                        <p className="text-2xl font-bold text-blue-400">${userStats.todaySales?.toFixed(2) || '0.00'}</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Ticket Promedio</p>
                                        <p className="text-2xl font-bold text-amber-400">${userStats.averageTicket?.toFixed(2) || '0.00'}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white/5 rounded-xl p-8 text-center text-slate-400">
                                    <p>Sin estadísticas disponibles</p>
                                </div>
                            )}
                        </div>

                        {/* Features Toggle */}
                        <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                </svg>
                                Funciones Habilitadas
                            </h3>

                            <div className="space-y-3">
                                {data.availableFeatures.map(feature => {
                                    const isEnabled = selectedUser.features[feature.name];
                                    const isUpdating = updating === `${selectedUser.id}-${feature.id}`;

                                    return (
                                        <div
                                            key={feature.id}
                                            className="flex items-center justify-between bg-white/5 rounded-xl p-4"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${isEnabled
                                                    ? 'bg-primary-500/20 text-primary-400'
                                                    : 'bg-slate-500/20 text-slate-400'
                                                    }`}>
                                                    {getFeatureIcon(feature.name)}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{feature.display_name}</p>
                                                    <p className="text-sm text-slate-500">{feature.description}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => toggleFeature(selectedUser.id, feature.id, feature.name, isEnabled)}
                                                disabled={isUpdating}
                                                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${isEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                                                    }`}
                                            >
                                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${isEnabled ? 'left-8' : 'left-1'
                                                    }`}>
                                                    {isUpdating && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-primary-500"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State when no user selected */}
            {!selectedUser && data.users.length > 0 && (
                <div className="flex-1 glass-card-dark flex items-center justify-center">
                    <div className="text-center text-slate-400">
                        <svg className="w-20 h-20 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-lg font-medium">Selecciona un usuario</p>
                        <p className="text-sm">para ver sus funciones y estadísticas</p>
                    </div>
                </div>
            )}
        </div>
    );
}
