-- Migration: Add auto_closed flag to cash_sessions
-- This flag indicates sessions that were automatically closed by the system at midnight

ALTER TABLE cash_sessions ADD COLUMN auto_closed INTEGER DEFAULT 0;

-- Create index for faster queries on auto-closed sessions
CREATE INDEX IF NOT EXISTS idx_cash_sessions_auto_closed ON cash_sessions(auto_closed);
