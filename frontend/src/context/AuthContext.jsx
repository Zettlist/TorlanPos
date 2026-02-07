import { createContext, useContext, useState, useEffect } from 'react';
import { API_URL } from '../config';

const AuthContext = createContext(null);

// API_URL is now imported from ../config


export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [features, setFeatures] = useState({});
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            fetchUser();
        } else {
            setLoading(false);
        }
    }, [token]);

    const fetchUser = async () => {
        try {
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setUser(data.user);
                setFeatures(data.features || {});
            } else {
                const errorData = await response.json().catch(() => ({}));
                // Handle empresa suspended
                if (errorData.code === 'EMPRESA_SUSPENDED' || errorData.code === 'EMPRESA_INACTIVE') {
                    logout();
                    throw new Error(errorData.error);
                }
                logout();
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            logout();
        } finally {
            setLoading(false);
        }
    };

    const login = async (username, password) => {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error de autenticación');
        }

        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        setFeatures(data.features || {});

        return data;
    };

    const changePassword = async (currentPassword, newPassword) => {
        const response = await fetch(`${API_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al cambiar contraseña');
        }

        // Update user state to reflect password change
        setUser(prev => ({ ...prev, first_login: false }));

        return data;
    };

    const completeSetup = async () => {
        const response = await fetch(`${API_URL}/auth/complete-setup`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            setUser(prev => ({ ...prev, has_setup_complete: true }));
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setFeatures({});
    };

    const hasFeature = (featureName) => {
        return features[featureName] === true;
    };

    // Role-based helpers
    const isGlobalAdmin = () => {
        return user?.role === 'global_admin';
    };

    const isEmpresaAdmin = () => {
        return user?.role === 'empresa_admin' || user?.role === 'global_admin';
    };

    const isEmployee = () => {
        return user?.role === 'employee';
    };

    const getEmpresa = () => {
        return user?.empresa || null;
    };

    return (
        <AuthContext.Provider value={{
            user,
            features,
            token,
            loading,
            login,
            logout,
            changePassword,
            completeSetup,
            hasFeature,
            refreshUser: fetchUser,
            // New role helpers
            isGlobalAdmin,
            isEmpresaAdmin,
            isEmployee,
            getEmpresa
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
