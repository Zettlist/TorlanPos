import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
    const { user, logout, hasFeature, isGlobalAdmin, isEmpresaAdmin, getEmpresa } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Navigation items for normal users (empresa users)
    const empresaNavItems = [
        {
            to: '/',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
            label: 'Dashboard'
        },
        {
            to: '/sales',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            label: 'Cobrar'
        },
        {
            to: '/products',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            ),
            label: 'Productos'
        },
        {
            to: '/cash',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            label: 'Cajas'
        },
        {
            to: '/reports',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            label: 'Ventas',
            managerOnly: true
        },
        {
            to: '/suppliers',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656-.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            label: 'Proveedores',
            managerOnly: true
        }
    ];

    // Navigation items for TorlanAdmin (global_admin)
    const globalAdminNavItems = [
        {
            to: '/',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
            label: 'Empresas'
        },
        {
            to: '/admin/users',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            ),
            label: 'Todos los Usuarios'
        },
        {
            to: '/admin/features',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
            ),
            label: 'Funciones del Sistema'
        }
    ];

    const featureItems = [
        {
            feature: 'sales_statistics',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
            label: 'Estadísticas'
        },
        {
            feature: 'competitor_prices',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
            ),
            label: 'Competencia'
        },
        {
            feature: 'advances',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            label: 'Anticipos',
            to: '/anticipos'
        },
        {
            feature: 'preventas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            ),
            label: 'Preventas',
            to: '/preventas'
        }
    ];

    const navItems = isGlobalAdmin()
        ? globalAdminNavItems
        : empresaNavItems.filter(item => {
            // Hide Products and Reports from employees
            if (item.label === 'Productos' && !isEmpresaAdmin()) return false;
            if (item.managerOnly && !isEmpresaAdmin()) return false;
            return true;
        });
    const empresa = getEmpresa();

    const getRoleBadge = () => {
        if (isGlobalAdmin()) {
            return { label: 'TorlanAdmin', color: 'from-red-500 to-orange-500' };
        }
        if (isEmpresaAdmin()) {
            return { label: 'Gerente de Empresa', color: 'from-amber-500 to-orange-500' };
        }
        return { label: 'Empleado', color: 'from-primary-500 to-accent-500' };
    };

    const roleBadge = getRoleBadge();

    return (
        <div className="min-h-screen bg-slate-900 relative">
            {/* Sidebar - Fixed */}
            <div className="fixed top-0 left-0 h-screen w-72 p-4 z-40">
                <aside className="w-full h-full glass-card-dark flex flex-col overflow-hidden">
                    {/* Logo */}
                    <div className="flex items-center gap-3 px-2 mb-6 flex-shrink-0 pt-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${isGlobalAdmin() ? 'from-red-500 to-orange-500' : 'from-primary-500 to-accent-500'
                            }`}>
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="font-bold text-lg">Torlan POS</h1>
                            <p className="text-xs text-slate-500">
                                {isGlobalAdmin() ? 'Panel Admin' : 'Sistema de Ventas'}
                            </p>
                        </div>
                    </div>

                    {/* Empresa Info (for non-global admin) */}
                    {!isGlobalAdmin() && empresa && (
                        <div className="bg-white/5 rounded-lg p-3 mb-4 flex-shrink-0 mx-2">
                            <p className="text-xs text-slate-400">Empresa</p>
                            <p className="font-medium text-sm truncate">{empresa.nombre}</p>
                            <span className="text-xs text-primary-400">{empresa.plan}</span>
                        </div>
                    )}

                    {/* Navigation */}
                    <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar min-h-0 px-2 pb-2">
                        <p className="px-3 text-xs text-slate-500 uppercase tracking-wider mb-2">
                            {isGlobalAdmin() ? 'Gestión Global' : 'Principal'}
                        </p>
                        {navItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </NavLink>
                        ))}

                        {/* Feature-based navigation (only for empresa users) */}
                        {!isGlobalAdmin() && featureItems.some(item => hasFeature(item.feature) || item.feature === 'preventas' || item.feature === 'advances') && (
                            <>
                                <div className="h-px bg-white/10 my-4"></div>
                                <p className="px-3 text-xs text-slate-500 uppercase tracking-wider mb-2">Módulos</p>
                                {featureItems.map(item =>
                                    (hasFeature(item.feature) || item.feature === 'preventas' || item.feature === 'advances') && (
                                        item.to ? (
                                            <NavLink
                                                key={item.feature}
                                                to={item.to}
                                                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                                            >
                                                {item.icon}
                                                <span>{item.label}</span>
                                            </NavLink>
                                        ) : (
                                            <button
                                                key={item.feature}
                                                className="sidebar-link w-full opacity-50 cursor-not-allowed"
                                                title="Módulo en desarrollo"
                                            >
                                                {item.icon}
                                                <span>{item.label}</span>
                                            </button>
                                        )
                                    )
                                )}
                            </>
                        )}

                        {/* Admin Section (for empresa_admin) */}
                        {!isGlobalAdmin() && isEmpresaAdmin() && (
                            <>
                                <div className="h-px bg-white/10 my-4"></div>
                                <p className="px-3 text-xs text-slate-500 uppercase tracking-wider mb-2">Administración</p>

                                <NavLink
                                    to="/admin/users"
                                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                    <span>Gestionar Usuarios</span>
                                </NavLink>
                            </>
                        )}
                    </nav>

                    {/* User Section */}
                    <div className="border-t border-white/10 pt-4 mt-auto p-4 bg-slate-900/20 flex-shrink-0">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold bg-gradient-to-br ${roleBadge.color}`}>
                                {(user?.username?.charAt(0)?.toUpperCase()) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{user?.username}</p>
                                <p className="text-xs text-slate-500">
                                    {roleBadge.label}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full sidebar-link text-red-400 hover:text-red-300 hover:bg-red-500/10 justify-center"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>Cerrar Sesión</span>
                        </button>
                    </div>
                </aside>
            </div>

            {/* Main Content - Pushed by Sidebar Width */}
            <main className="ml-72 flex-1 p-4 w-auto min-h-screen">
                <div className="max-w-7xl mx-auto">
                    {/* Billing Alert System */}
                    {user?.billing_status?.alert_level !== 'none' && user?.billing_status?.message && (
                        <div className={`mb-6 p-4 rounded-lg border flex items-center gap-3 shadow-lg animate-fade-in
                            ${user.billing_status.alert_level === 'blocking' || user.billing_status.alert_level === 'danger'
                                ? 'bg-red-500/20 border-red-500/50 text-red-200'
                                : 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
                            }`}
                        >
                            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="flex-1">
                                <p className="font-bold">
                                    {user.billing_status.alert_level === 'blocking' ? '¡ACCESO BLOQUEADO!' : 'Aviso de Facturación'}
                                </p>
                                <p>{user.billing_status.message}</p>
                            </div>
                            {user.billing_status.should_block && (
                                <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md transition-colors text-sm font-bold">
                                    Contactar Soporte
                                </button>
                            )}
                        </div>
                    )}

                    {/* Blocking Logic Trigger (Overlay) */}
                    {user?.billing_status?.should_block && (
                        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
                            <div className="max-w-md w-full text-center space-y-6 animate-bounce-in">
                                <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto ring-4 ring-red-500/10">
                                    <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-white mb-2">Cuenta Suspendida</h1>
                                    <p className="text-slate-400 text-lg">
                                        {user.billing_status.message}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-left">
                                    <p className="text-sm text-slate-400 mb-2">Razón:</p>
                                    <p className="text-white font-medium">Pago vencido / Falta de pago</p>
                                </div>
                                <button onClick={handleLogout} className="btn-secondary w-full">
                                    Cerrar Sesión
                                </button>
                            </div>
                        </div>
                    )}

                    {children}
                </div>
            </main>
        </div>
    );
}
