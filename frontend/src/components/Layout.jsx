import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function NavItem({ to, icon, label, end = false, onClick, badge }) {
    return (
        <NavLink
            to={to}
            end={end}
            onClick={onClick}
            className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                    ? 'bg-gradient-to-r from-primary-500/20 to-accent-500/10 text-white border border-primary-500/30 shadow-sm shadow-primary-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06] border border-transparent'
                }`
            }
        >
            {({ isActive }) => (
                <>
                    <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                        ${isActive
                            ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow-md'
                            : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white'
                        }`}
                    >
                        {icon}
                    </span>
                    <span className="flex-1 truncate">{label}</span>
                    {badge !== undefined && badge > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">
                            {badge > 99 ? '99+' : badge}
                        </span>
                    )}
                </>
            )}
        </NavLink>
    );
}

function SectionLabel({ children }) {
    return (
        <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1 mt-2">
            {children}
        </p>
    );
}

function Divider() {
    return <div className="h-px bg-white/[0.06] my-3" />;
}

export default function Layout({ children }) {
    const { user, logout, hasFeature, isGlobalAdmin, isEmpresaAdmin, getEmpresa } = useAuth();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const close = () => setMobileMenuOpen(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const empresa = getEmpresa();

    const getRoleBadge = () => {
        if (isGlobalAdmin()) return { label: 'TorlanAdmin', color: 'from-red-500 to-orange-500' };
        if (isEmpresaAdmin()) return { label: 'Gerente', color: 'from-amber-500 to-orange-500' };
        return { label: 'Empleado', color: 'from-primary-500 to-accent-500' };
    };
    const roleBadge = getRoleBadge();

    // ── Icons ──────────────────────────────────────────────
    const icons = {
        home: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
        cash: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
        products: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
        register: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        reports: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
        suppliers: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656-.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
        stats: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
        scales: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
        anticipos: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
        preventas: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
        users: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
        coupon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>,
        storeCredit: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
        webOrders: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>,
        empresas: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
        features: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
        logout: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
    };

    return (
        <div className="min-h-screen bg-slate-900 relative">
            {/* Mobile Menu Button */}
            <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden fixed top-4 left-4 z-50 p-3 bg-gradient-to-r from-primary-500 to-accent-500 rounded-xl shadow-xl touch-target"
                aria-label="Toggle menu"
            >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {mobileMenuOpen
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    }
                </svg>
            </button>

            {/* Mobile Overlay */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30" onClick={close} />
            )}

            {/* Sidebar */}
            <div className={`
                fixed top-0 left-0 h-screen w-64 p-3 z-40
                transition-transform duration-300 ease-out
                ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                ${!mobileMenuOpen ? 'pointer-events-none md:pointer-events-auto' : 'pointer-events-auto'}
            `}>
                <aside
                    className="w-full h-full flex flex-col overflow-hidden rounded-2xl bg-slate-800/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                    style={{ pointerEvents: 'auto' }}
                >
                    {/* Logo */}
                    <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06]">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br flex-shrink-0
                            ${isGlobalAdmin() ? 'from-red-500 to-orange-500' : 'from-primary-500 to-accent-500'}`}
                        >
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <h1 className="font-bold text-base leading-tight">Torlan POS</h1>
                            <p className="text-[11px] text-slate-500 leading-tight">
                                {isGlobalAdmin() ? 'Panel Admin' : empresa?.nombre || 'Sistema de Ventas'}
                            </p>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-0.5 min-h-0">
                        {isGlobalAdmin() ? (
                            <>
                                <SectionLabel>Gestión Global</SectionLabel>
                                <NavItem to="/" end icon={icons.empresas} label="Empresas" onClick={close} />
                                <NavItem to="/admin/users" icon={icons.users} label="Todos los Usuarios" onClick={close} />
                                <NavItem to="/admin/features" icon={icons.features} label="Funciones del Sistema" onClick={close} />
                            </>
                        ) : (
                            <>
                                {/* Principal */}
                                <SectionLabel>Principal</SectionLabel>
                                <NavItem to="/" end icon={icons.home} label="Dashboard" onClick={close} />
                                <NavItem to="/sales" icon={icons.cash} label="Cobrar" onClick={close} />
                                {isEmpresaAdmin() && (
                                    <NavItem to="/products" icon={icons.products} label="Productos" onClick={close} />
                                )}
                                <NavItem to="/cash" icon={icons.register} label="Cajas" onClick={close} />
                                {isEmpresaAdmin() && (
                                    <>
                                        <NavItem to="/reports" icon={icons.reports} label="Ventas" onClick={close} />
                                        <NavItem to="/suppliers" icon={icons.suppliers} label="Proveedores" onClick={close} />
                                    </>
                                )}

                                {/* Módulos */}
                                {(hasFeature('sales_statistics') || hasFeature('competitor_prices') || true) && (
                                    <>
                                        <Divider />
                                        <SectionLabel>Módulos</SectionLabel>
                                        {hasFeature('sales_statistics') && (
                                            <NavItem to="/stats" icon={icons.stats} label="Estadísticas" onClick={close} />
                                        )}
                                        {hasFeature('competitor_prices') && (
                                            <NavItem to="/competencia" icon={icons.scales} label="Competencia" onClick={close} />
                                        )}
                                        <NavItem to="/anticipos" icon={icons.anticipos} label="Anticipos" onClick={close} />
                                        <NavItem to="/preventas" icon={icons.preventas} label="Preventas" onClick={close} />
                                        <NavItem to="/web-orders" icon={icons.webOrders} label="Pedidos Página Web" onClick={close} />
                                    </>
                                )}

                                {/* Administración */}
                                {isEmpresaAdmin() && (
                                    <>
                                        <Divider />
                                        <SectionLabel>Administración</SectionLabel>
                                        <NavItem to="/admin/users" icon={icons.users} label="Gestionar Usuarios" onClick={close} />
                                        <NavItem to="/admin/coupons" icon={icons.coupon} label="Cupones" onClick={close} />
                                        <NavItem to="/admin/store-credits" icon={icons.storeCredit} label="Créditos de Tienda" onClick={close} />
                                    </>
                                )}
                            </>
                        )}
                    </nav>

                    {/* Footer: user */}
                    <div className="border-t border-white/[0.06] p-3 flex-shrink-0">
                        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors mb-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm bg-gradient-to-br flex-shrink-0 ${roleBadge.color}`}>
                                {user?.username?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate leading-tight">{user?.username}</p>
                                <p className="text-[11px] text-slate-500 leading-tight">{roleBadge.label}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-medium"
                        >
                            <span className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                {icons.logout}
                            </span>
                            Cerrar Sesión
                        </button>
                    </div>
                </aside>
            </div>

            {/* Main Content */}
            <main className="ml-0 md:ml-64 flex-1 p-4 w-auto min-h-screen pt-20 md:pt-4">
                <div className="max-w-7xl mx-auto">
                    {/* Billing Alert */}
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

                    {/* Blocking Overlay */}
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
                                    <p className="text-slate-400 text-lg">{user.billing_status.message}</p>
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
