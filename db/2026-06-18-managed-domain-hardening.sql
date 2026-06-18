-- One-time migration from db version v0.0.12 to v0.0.13.
-- The Worker Admin database migration endpoint guards this migration by db_version.

ALTER TABLE managed_domains ADD COLUMN verification_started_at DATETIME;
ALTER TABLE managed_domains ADD COLUMN verification_expires_at DATETIME;
ALTER TABLE managed_domains ADD COLUMN verification_consumed_at DATETIME;
ALTER TABLE managed_domains ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;

-- Tokens returned by the former public settings DTO must no longer remain valid.
UPDATE managed_domains
SET verification_token = NULL,
    verification_started_at = NULL,
    verification_expires_at = NULL,
    verification_consumed_at = NULL,
    last_error = CASE WHEN setup_status = 'active' THEN NULL ELSE last_error END,
    config_version = COALESCE(config_version, 1),
    updated_at = datetime('now');
