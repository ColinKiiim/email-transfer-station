-- Per-identity mail read state.
--
-- The application has queried this table since the read-state feature shipped
-- (worker/src/mail_read_state.ts, and the LEFT JOIN in
-- worker/src/mails_api/mails_crud.ts), but it was only ever created by the
-- admin console's in-app database initializer
-- (worker/src/admin_api/db_api.ts). A deployment initialized from db/ alone
-- therefore had no such table, and every mailbox listing failed.
--
-- Run this against any database created from db/schema.sql before 2026-07-27.
-- It is a no-op on databases the admin initializer already migrated.

CREATE TABLE IF NOT EXISTS mail_read_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mail_id INTEGER NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    address TEXT,
    read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mail_id, actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_read_states_actor ON mail_read_states(actor_type, actor_id, read_at);

CREATE INDEX IF NOT EXISTS idx_mail_read_states_mail ON mail_read_states(mail_id);

CREATE INDEX IF NOT EXISTS idx_mail_read_states_address ON mail_read_states(address);
