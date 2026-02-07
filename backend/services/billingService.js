/**
 * Billing Service
 * Handles logic for payment status, due dates, and warnings
 */

const PLAN_RULES = {
    'Basico': {
        warning_days: 5,
        grace_period_days: 3
    },
    'Premium': {
        warning_days: 2,
        grace_period_days: 7
    },
    'Empresarial': {
        warning_days: 5,
        grace_period_days: 10
    },
    'Prueba': {
        warning_days: 3,
        grace_period_days: 0 // Immediate expiration
    }
};

/**
 * Check payment status for an empresa
 * @param {object} empresa - Empresa object with { plan_contratado, billing_cycle_date, estado }
 * @returns {object} Status object
 */
export function checkPaymentStatus(empresa) {
    if (!empresa || !empresa.billing_cycle_date) {
        return { status: 'ok', message: '', payment_due: false };
    }

    if (empresa.estado === 'Suspendido') {
        return {
            status: 'suspended',
            message: 'Cuenta suspendida por falta de pago',
            payment_due: true,
            alert_level: 'blocking',
            should_block: true
        };
    }

    const today = new Date();
    // Reset time part for accurate day calculation
    today.setHours(0, 0, 0, 0);

    const billingDateStr = empresa.billing_cycle_date; // YYYY-MM-DD
    const billingDay = parseInt(billingDateStr.split('-')[2]); // Get the day of month (1-31)

    // Construct next billing date based on the day
    let nextBillingDate = new Date(today.getFullYear(), today.getMonth(), billingDay);

    // If billing day has passed this month, moves to next month
    // However, we want to find the *relevant* billing date to check against (past or near future)

    // If today is 25th, and billing is 1st. Next is Feb 1st. Previous was Jan 1st.
    // If today is 25th, and billing is 30th. Next is Jan 30th.

    // Logic: Find the upcoming payment date closest to today, or the one just passed if within grace period

    // Let's verify if we are currently overdue or approaching
    // We treat billing_cycle_date as the anchor.
    // We need to calculate the actual Next Payment Date.

    // If today > nextBillingDate (of current month), then next one is next month? 
    // Wait, if today is 5th, and billing is 1st, we missed it?
    // We need strict logic. Let's assume billing_cycle_date is the START date.

    // Simpler approach:
    // Extract the day.
    // Construct "This Month's Payment Date"
    const currentMonthPayment = new Date(today.getFullYear(), today.getMonth(), billingDay);

    // Construct "Next Month's Payment Date"
    const nextMonthPayment = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);

    // Construct "Last Month's Payment Date"
    const lastMonthPayment = new Date(today.getFullYear(), today.getMonth() - 1, billingDay);

    let targetDate = currentMonthPayment;

    // If today is past this month's payment date, we might be overdue OR looking at next month
    // If today is 20th, payment is 15th. We are 5 days past.
    // If today is 10th, payment is 15th. We are 5 days before.

    // We care about the "Active Cycle".
    // If we passed the date, have we paid? The system doesn't have a "payments" table yet to track specific invoices.
    // NOTE: The requirements say "Si expira y el Admin Global no marca el pago".
    // This implies we rely on the Admin Global updating something or just checking date vs today?
    // Since we don't have a "Last Payment Date" field, we can't know if they paid this month.
    // ASSUMPTION FOR MVP: 
    // We assume manually "marking payment" updates `billing_cycle_date` to the NEXT month?
    // OR we assume `billing_cycle_date` is static (Day of month) and we need a `last_payment_date` field?

    // The requirement says: "Agrega un nuevo campo de 'Fecha de Facturación' para establecer el ciclo de cobro".
    // It implies a static anchor. 
    // And "Admin Global marca el pago".
    // Without a specific "paid_until" field, manual tracking is hard.
    // RECOMMENDATION: Update `billing_cycle_date` to mean "Next Payment Date". 
    // When Admin "marks as paid", we move this date forward by 1 month.
    // This is the simplest logic for MVP.
    // So `billing_cycle_date` IS the Next Due Date.

    const dueDate = new Date(billingDateStr);
    dueDate.setHours(0, 0, 0, 0); // Normalize

    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // diffDays = 0 (Today is due)
    // diffDays = 1 (Tomorrow)
    // diffDays = -1 (Yesterday)

    const rules = PLAN_RULES[empresa.plan_contratado] || PLAN_RULES['Basico'];

    // 1. Check Warning (Approaching date)
    if (diffDays >= 0 && diffDays <= rules.warning_days) {
        return {
            status: 'warning',
            message: `Tu fecha de pago está cerca (${diffDays === 0 ? 'Hoy' : diffDays + ' días'})`,
            alert_level: 'warning',
            days_remaining: diffDays,
            should_block: false
        };
    }

    // 2. Check Overdue (Grace Period)
    if (diffDays < 0) {
        const daysOverdue = Math.abs(diffDays);
        const graceRemaining = rules.grace_period_days - daysOverdue;

        if (graceRemaining >= 0) {
            return {
                status: 'grace_period',
                message: `Pago vencido. Tienes ${graceRemaining} días para completar tu pago`,
                alert_level: 'danger',
                days_overdue: daysOverdue,
                should_block: false
            };
        } else {
            // Grace period exceeded -> BLOCK
            return {
                status: 'overdue_locked',
                message: `Cuenta bloqueada por pago vencido. Comunícate a Torlan.`,
                alert_level: 'blocking',
                days_overdue: daysOverdue,
                should_block: true
            };
        }
    }

    return { status: 'ok', message: '', alert_level: 'none', should_block: false };
}

export default { checkPaymentStatus };
