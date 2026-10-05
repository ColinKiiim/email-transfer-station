CREATE TABLE IF NOT EXISTS user_authenticators (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    issuer TEXT NOT NULL DEFAULT '',
    secret_ciphertext TEXT NOT NULL,
    secret_nonce TEXT NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'SHA1',
    digits INTEGER NOT NULL DEFAULT 6,
    period INTEGER NOT NULL DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_authenticators_owner ON user_authenticators(user_id);
CREATE TABLE IF NOT EXISTS authenticator_share_tokens (
    id TEXT PRIMARY KEY,
    authenticator_id TEXT NOT NULL REFERENCES user_authenticators(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at DATETIME,
    revoked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_authenticator_shares_item ON authenticator_share_tokens(authenticator_id);
CREATE TABLE IF NOT EXISTS user_authenticator_access (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    authenticator_id TEXT NOT NULL REFERENCES user_authenticators(id) ON DELETE CASCADE,
    share_id TEXT NOT NULL REFERENCES authenticator_share_tokens(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, authenticator_id)
);
