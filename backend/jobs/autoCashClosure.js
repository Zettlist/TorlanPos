import cron from 'node-cron';
import db from '../database/db.js';

/**
 * Auto Cash Closure Job
 * Runs every midnight (00:00) in America/Mexico_City timezone
 * Closes all open cash sessions with automatic notes
 */
function autoCloseCashSessions() {
    try {
        console.log('[Auto Cash Closure] Starting midnight cash session closure...');

        // Find all open sessions across all companies
        const openSessions = db.prepare(`
            SELECT id, empresa_id, user_id, opening_amount
            FROM cash_sessions
            WHERE status = 'open'
        `).all();

        if (openSessions.length === 0) {
            console.log('[Auto Cash Closure] No open sessions to close');
            return;
        }

        let closedCount = 0;

        // For each session, calculate expected amount and close
        openSessions.forEach(session => {
            try {
                // Calculate cash sales for this session
                const salesTotal = db.prepare(`
                    SELECT COALESCE(SUM(total), 0) as total
                    FROM sales
                    WHERE cash_session_id = ? AND payment_method = 'cash'
                `).get(session.id);

                const cashSalesTotal = salesTotal?.total || 0;
                const expectedAmount = session.opening_amount + cashSalesTotal;

                // Close session with auto-calculated amounts
                db.prepare(`
                    UPDATE cash_sessions
                    SET expected_amount = ?,
                        declared_amount = ?,
                        difference = 0,
                        status = 'closed',
                        closed_at = CURRENT_TIMESTAMP,
                        notes = ?,
                        auto_closed = 1
                    WHERE id = ?
                `).run(
                    expectedAmount,
                    expectedAmount, // Auto-set declared = expected (no discrepancy)
                    'CIERRE AUTOMÁTICO POR SISTEMA (Medianoche)',
                    session.id
                );

                closedCount++;
                console.log(`[Auto Cash Closure] Closed session ${session.id} (User: ${session.user_id}, Expected: $${expectedAmount.toFixed(2)})`);
            } catch (error) {
                console.error(`[Auto Cash Closure] Error closing session ${session.id}:`, error);
            }
        });

        console.log(`[Auto Cash Closure] Successfully closed ${closedCount}/${openSessions.length} session(s)`);
    } catch (error) {
        console.error('[Auto Cash Closure] Fatal error:', error);
    }
}

/**
 * Start the auto cash closure cron job
 * Schedules for midnight (00:00) Mexico City time
 */
export function startAutoCashClosureCron() {
    // Schedule for midnight (00:00) America/Mexico_City timezone
    // Format: '0 0 * * *' = minute hour day month weekday
    cron.schedule('0 0 * * *', autoCloseCashSessions, {
        timezone: 'America/Mexico_City',
        scheduled: true
    });

    console.log('✅ [Cron] Auto Cash Closure scheduled for midnight (America/Mexico_City)');
}

// Export for manual testing
export { autoCloseCashSessions };
