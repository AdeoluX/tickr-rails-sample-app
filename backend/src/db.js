import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';

/**
 * Coopsaas's own records. Tickr Rails holds the investment accounts, orders and cash movements;
 * Coopsaas keeps its members, their coop savings, and which Tickr Rails records belong to whom.
 */
// DATABASE_PATH=:memory: gives a throwaway database, which the tests use
const path = process.env.DATABASE_PATH || new URL('../data/coopsaas.db', import.meta.url).pathname;
if (path !== ':memory:') mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
export const db = new DatabaseSync(path);

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        savings_kobo INTEGER NOT NULL,
        -- Tickr Rails onboarding
        platform_client_id TEXT,
        polling_id TEXT,
        onboarding_state TEXT NOT NULL DEFAULT 'NOT_STARTED',  -- NOT_STARTED, PROCESSING, ACTIVE, FAILED
        onboarding_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
    );

    -- Money moved between coop savings and the member's Tickr Rails investment account
    CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id),
        type TEXT NOT NULL,              -- DEPOSIT (savings to investing) or WITHDRAWAL (investing to savings)
        amount_kobo INTEGER NOT NULL,
        reference TEXT NOT NULL UNIQUE,  -- our reference, sent to Tickr Rails
        tickr_transaction_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, POSTED, FAILED
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Which member placed which Tickr Rails order
    CREATE TABLE IF NOT EXISTS orders (
        trade_id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id),
        reference TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Webhooks received from Tickr Rails, once each
    CREATE TABLE IF NOT EXISTS webhook_events (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,
        member_id TEXT,
        payload TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
`);

/** Runs `fn` in one SQLite transaction. */
export const inTransaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
};
