/**
 * Onboarding Middleware
 * Blocks access to system routes if empresa_admin hasn't completed onboarding
 */

export function requireOnboardingComplete(req, res, next) {
    // Global admins don't need onboarding
    if (req.user.role === 'global_admin') {
        return next();
    }

    // Employees don't go through onboarding (their admin does)
    if (req.user.role === 'employee') {
        return next();
    }

    // Check if empresa_admin has completed onboarding
    if (req.user.role === 'empresa_admin' && !req.user.onboarding_completed) {
        return res.status(403).json({
            error: 'Complete el proceso de configuración inicial antes de continuar',
            code: 'ONBOARDING_REQUIRED',
            redirect: '/onboarding'
        });
    }

    next();
}

export default { requireOnboardingComplete };
