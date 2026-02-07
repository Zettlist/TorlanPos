import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import SetupWizard from './pages/SetupWizard';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Products from './pages/Products';
import FeatureManager from './pages/admin/FeatureManager';
import UserManager from './pages/admin/UserManager';
import EmpresaManager from './pages/TorlanAdmin/EmpresaManager';
import ManagerOnboarding from './pages/Onboarding/ManagerOnboarding';
import CashManager from './pages/CashControl/CashManager';
import SalesReports from './pages/Reports/SalesReports';
import Suppliers from './pages/Suppliers';

import Preventas from './pages/Preventas';
import ComprobantePublico from './pages/ComprobantePublico';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

function RequireManager({ children }) {
    const { isEmpresaAdmin, isGlobalAdmin } = useAuth();
    // Allow if is Empresa Manager OR Global Admin
    if (!isEmpresaAdmin() && !isGlobalAdmin()) {
        return <Navigate to="/" replace />;
    }
    return children;
}

function GlobalAdminRoutes() {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<EmpresaManager />} />
                <Route path="/empresas" element={<EmpresaManager />} />
                <Route path="/admin/users" element={<UserManager />} />
                <Route path="/admin/features" element={<FeatureManager />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Layout>
    );
}

function EmpresaRoutes() {
    const { user } = useAuth();

    // First login - must change password
    if (user?.first_login) {
        return <ChangePassword />;
    }

    // Onboarding for empresa_admin who hasn't completed setup
    if (user?.role === 'empresa_admin' && !user?.onboarding_completed) {
        return <ManagerOnboarding />;
    }

    // New employee without setup - SHOULD NOT SEE WIZARD
    // Logic removed: Employees should never access SetupWizard.
    // If they haven't completed setup (which shouldn't apply to them individually anyway in the new model),
    // they should just go to the main layout.
    // The previous code was:
    // if (!user?.has_setup_complete && user?.role === 'employee') { return <SetupWizard />; }

    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/products" element={
                    <RequireManager>
                        <Products />
                    </RequireManager>
                } />
                <Route path="/cash" element={<CashManager />} />
                <Route path="/reports" element={
                    <RequireManager>
                        <SalesReports />
                    </RequireManager>
                } />
                <Route path="/suppliers" element={
                    <RequireManager>
                        <Suppliers />
                    </RequireManager>
                } />

                <Route path="/preventas" element={<Preventas />} />


                <Route path="/admin/users" element={<UserManager />} />
                <Route path="/onboarding" element={<ManagerOnboarding />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Layout>
    );
}

function AuthenticatedRoutes() {
    const { user, isGlobalAdmin } = useAuth();

    // First login - must change password (applies to all users including TorlanAdmin)
    if (user?.first_login) {
        return <ChangePassword />;
    }

    // Route based on role
    if (isGlobalAdmin()) {
        return <GlobalAdminRoutes />;
    }

    return <EmpresaRoutes />;
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/comprobante" element={<ComprobantePublico />} />
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/*"
                        element={
                            <ProtectedRoute>
                                <AuthenticatedRoutes />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
