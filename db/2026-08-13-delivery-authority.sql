CREATE TABLE IF NOT EXISTS user_verification_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, purpose)
);

CREATE INDEX IF NOT EXISTS idx_user_verification_challenges_expires_at
    ON user_verification_challenges(expires_at);

CREATE TABLE IF NOT EXISTS inbound_mail_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    dedup_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(address, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_inbound_mail_receipts_created_at
    ON inbound_mail_receipts(created_at);
