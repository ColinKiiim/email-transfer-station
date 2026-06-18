-- Add share-token inbox access and forwarded-ingress recipient tracking.

ALTER TABLE raw_mails ADD COLUMN original_recipient TEXT;
ALTER TABLE raw_mails ADD COLUMN collector_address TEXT;
ALTER TABLE raw_mails ADD COLUMN original_domain TEXT;
ALTER TABLE raw_mails ADD COLUMN ingress_source TEXT;
ALTER TABLE raw_mails ADD COLUMN recipient_confidence TEXT;

CREATE INDEX IF NOT EXISTS idx_raw_mails_original_domain ON raw_mails(original_domain);
CREATE INDEX IF NOT EXISTS idx_raw_mails_ingress_source ON raw_mails(ingress_source);

ALTER TABLE address ADD COLUMN display_label TEXT;
ALTER TABLE address ADD COLUMN owner_note TEXT;

CREATE TABLE IF NOT EXISTS address_share_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    label TEXT,
    scopes TEXT,
    expires_at DATETIME,
    revoked_at DATETIME,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_address_share_tokens_address_id ON address_share_tokens(address_id);
CREATE INDEX IF NOT EXISTS idx_address_share_tokens_token_hash ON address_share_tokens(token_hash);
