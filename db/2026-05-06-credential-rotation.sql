ALTER TABLE address ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 1;
UPDATE settings SET value = 'v0.0.9', updated_at = datetime('now') WHERE key = 'db_version';
