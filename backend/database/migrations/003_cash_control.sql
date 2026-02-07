-- Migration: Add onboarding_completed to users and cash_session_id to sales
-- Run after schema.sql

-- Add onboarding column to users
ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0;

-- Add cash_session_id to sales
ALTER TABLE sales ADD COLUMN cash_session_id INTEGER REFERENCES cash_sessions(id);
