CREATE TABLE IF NOT EXISTS managed_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    display_label TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    receive_mode TEXT NOT NULL DEFAULT 'manual',
    allow_address_creation INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    allow_random_subdomain INTEGER NOT NULL DEFAULT 0,
    allow_subdomain_match INTEGER,
    collector_address TEXT,
    cloudflare_zone_id TEXT,
    cloudflare_routing_rule_id TEXT,
    cloudflare_catch_all_rule_id TEXT,
    setup_status TEXT NOT NULL DEFAULT 'draft',
    verification_token TEXT,
    verification_started_at DATETIME,
    verification_expires_at DATETIME,
    verification_consumed_at DATETIME,
    last_verified_at DATETIME,
    last_error TEXT,
    notes TEXT,
    config_version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_managed_domains_domain ON managed_domains(domain);
CREATE INDEX IF NOT EXISTS idx_managed_domains_enabled ON managed_domains(enabled);
CREATE INDEX IF NOT EXISTS idx_managed_domains_receive_mode ON managed_domains(receive_mode);
CREATE INDEX IF NOT EXISTS idx_managed_domains_setup_status ON managed_domains(setup_status);
