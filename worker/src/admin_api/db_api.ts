import { Context } from "hono";
import { CONSTANTS } from "../constants";
import utils from "../utils";
import { recordAuditEvent } from "../audit";

const versionParts = (version: string | null | undefined): number[] => {
    return String(version || "v0.0.0")
        .replace(/^v/i, "")
        .split(".")
        .map((part) => Number.parseInt(part, 10))
        .map((part) => Number.isFinite(part) ? part : 0);
}

const isVersionLte = (
    version: string | null | undefined,
    target: string
): boolean => {
    const currentParts = versionParts(version);
    const targetParts = versionParts(target);
    const length = Math.max(currentParts.length, targetParts.length);
    for (let i = 0; i < length; i += 1) {
        const current = currentParts[i] || 0;
        const expected = targetParts[i] || 0;
        if (current < expected) return true;
        if (current > expected) return false;
    }
    return true;
}

const DB_INIT_QUERIES = `
CREATE TABLE IF NOT EXISTS raw_mails (
    id INTEGER PRIMARY KEY,
    message_id TEXT,
    source TEXT,
    address TEXT,
    original_recipient TEXT,
    collector_address TEXT,
    original_domain TEXT,
    ingress_source TEXT,
    recipient_confidence TEXT,
    raw TEXT,
    raw_blob BLOB,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_mails_address ON raw_mails(address);

CREATE INDEX IF NOT EXISTS idx_raw_mails_created_at ON raw_mails(created_at);

CREATE INDEX IF NOT EXISTS idx_raw_mails_message_id ON raw_mails(message_id);

CREATE INDEX IF NOT EXISTS idx_raw_mails_original_domain ON raw_mails(original_domain);

CREATE INDEX IF NOT EXISTS idx_raw_mails_ingress_source ON raw_mails(ingress_source);

CREATE TABLE IF NOT EXISTS address (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    password TEXT,
    source_meta TEXT,
    display_label TEXT,
    owner_note TEXT,
    credential_version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_address_name ON address(name);

CREATE INDEX IF NOT EXISTS idx_address_created_at ON address(created_at);

CREATE INDEX IF NOT EXISTS idx_address_updated_at ON address(updated_at);

CREATE INDEX IF NOT EXISTS idx_address_source_meta ON address(source_meta);

CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_labels_name ON labels(name);

CREATE TABLE IF NOT EXISTS address_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address_id INTEGER NOT NULL,
    label_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(address_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_address_labels_address_id ON address_labels(address_id);

CREATE INDEX IF NOT EXISTS idx_address_labels_label_id ON address_labels(label_id);

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

CREATE TABLE IF NOT EXISTS auto_reply_mails (
    id INTEGER PRIMARY KEY,
    source_prefix TEXT,
    name TEXT,
    address TEXT UNIQUE,
    subject TEXT,
    message TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_mails_address ON auto_reply_mails(address);

CREATE TABLE IF NOT EXISTS address_sender (
    id INTEGER PRIMARY KEY,
    address TEXT UNIQUE,
    balance INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_address_sender_address ON address_sender(address);

CREATE TABLE IF NOT EXISTS sendbox (
    id INTEGER PRIMARY KEY,
    address TEXT,
    raw TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sendbox_address ON sendbox(address);
CREATE INDEX IF NOT EXISTS idx_sendbox_created_at ON sendbox(created_at);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    user_email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    display_name TEXT,
    password TEXT NOT NULL,
    user_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_user_email ON users(user_email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);

CREATE TABLE IF NOT EXISTS users_address (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    address_id INTEGER UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_address_user_id ON users_address(user_id);

CREATE INDEX IF NOT EXISTS idx_users_address_address_id ON users_address(address_id);

CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    role_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

CREATE TABLE IF NOT EXISTS user_passkeys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    passkey_name TEXT NOT NULL,
    passkey_id TEXT NOT NULL,
    passkey TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_passkeys_user_id_passkey_id ON user_passkeys(user_id, passkey_id);

CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT,
    actor_id TEXT,
    actor_label TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_label TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    ip TEXT,
    user_agent TEXT,
    method TEXT,
    path TEXT,
    source TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_type, actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_status ON audit_events(status);

CREATE TABLE IF NOT EXISTS access_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT,
    actor_id TEXT,
    actor_label TEXT,
    event_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_label TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    failure_reason TEXT,
    ip TEXT,
    user_agent TEXT,
    method TEXT,
    path TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at);

CREATE INDEX IF NOT EXISTS idx_access_events_event_type ON access_events(event_type);

CREATE INDEX IF NOT EXISTS idx_access_events_actor ON access_events(actor_type, actor_id);

CREATE INDEX IF NOT EXISTS idx_access_events_resource ON access_events(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_access_events_status ON access_events(status);

CREATE INDEX IF NOT EXISTS idx_access_events_ip ON access_events(ip);

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
`

export default {
    initialize: async (c: Context<HonoCustomType>) => {
        // remove all \r and \n characters from the query string
        // split by ; and join with a ;\n
        const query = DB_INIT_QUERIES.replace(/[\r\n]/g, "")
            .split(";")
            .map((query) => query.trim())
            .join(";\n");
        await c.env.DB.exec(query);

        const version = await utils.getSetting(c, CONSTANTS.DB_VERSION_KEY);
        if (version) {
            await recordAuditEvent(c, {
                action: "db.initialize.skipped",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "database",
                status: "skipped",
                metadata: { current_db_version: version },
            });
            return c.json({ message: "Database already initialized" });
        }
        await utils.saveSetting(c, CONSTANTS.DB_VERSION_KEY, CONSTANTS.DB_VERSION);
        await recordAuditEvent(c, {
            action: "db.initialize.success",
            actor_type: "admin",
            actor_label: "admin",
            resource_type: "database",
            status: "success",
            metadata: { code_db_version: CONSTANTS.DB_VERSION },
        });
        return c.json({ message: "Database initialized" });
    },
    migrate: async (c: Context<HonoCustomType>) => {
        const version = await utils.getSetting(c, CONSTANTS.DB_VERSION_KEY);
        if (version && isVersionLte(version, "v0.0.2")) {
            // migration to v0.0.3: add password column
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(address)`
            ).all();
            const hasPassword = tableInfo.results?.some(
                (col: any) => col.name === 'password'
            );
            if (!hasPassword) {
                await c.env.DB.exec(`ALTER TABLE address ADD COLUMN password TEXT;`);
            }
        }
        if (version && isVersionLte(version, "v0.0.3")) {
            // migration to v0.0.4: add metadata column
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(raw_mails)`
            ).all();
            const hasMetadata = tableInfo.results?.some(
                (col: any) => col.name === 'metadata'
            );
            if (!hasMetadata) {
                await c.env.DB.exec(`ALTER TABLE raw_mails ADD COLUMN metadata TEXT;`);
            }
        }
        if (version && isVersionLte(version, "v0.0.4")) {
            // migration to v0.0.5: add source_meta column
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(address)`
            ).all();
            const hasSourceMeta = tableInfo.results?.some(
                (col: any) => col.name === 'source_meta'
            );
            if (!hasSourceMeta) {
                await c.env.DB.exec(`ALTER TABLE address ADD COLUMN source_meta TEXT;`);
                await c.env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_address_source_meta ON address(source_meta);`);
            }
        }
        if (version && isVersionLte(version, "v0.0.5")) {
            // migration to v0.0.6: add message_id index on raw_mails
            await c.env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_raw_mails_message_id ON raw_mails(message_id);`);
        }
        if (version && isVersionLte(version, "v0.0.6")) {
            // migration to v0.0.7: add raw_blob column for gzip compressed email storage
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(raw_mails)`
            ).all();
            const hasRawBlob = tableInfo.results?.some(
                (col: any) => col.name === 'raw_blob'
            );
            if (!hasRawBlob) {
                await c.env.DB.exec(`ALTER TABLE raw_mails ADD COLUMN raw_blob BLOB;`);
            }
        }
        if (version && isVersionLte(version, "v0.0.7")) {
            // migration to v0.0.8: add share tokens and forwarded-ingress tracking
            const rawMailsInfo = await c.env.DB.prepare(
                `PRAGMA table_info(raw_mails)`
            ).all();
            const rawMailColumns = new Set(rawMailsInfo.results?.map(
                (col: any) => col.name
            ) || []);
            for (const columnSql of [
                [`original_recipient`, `ALTER TABLE raw_mails ADD COLUMN original_recipient TEXT;`],
                [`collector_address`, `ALTER TABLE raw_mails ADD COLUMN collector_address TEXT;`],
                [`original_domain`, `ALTER TABLE raw_mails ADD COLUMN original_domain TEXT;`],
                [`ingress_source`, `ALTER TABLE raw_mails ADD COLUMN ingress_source TEXT;`],
                [`recipient_confidence`, `ALTER TABLE raw_mails ADD COLUMN recipient_confidence TEXT;`],
            ] as const) {
                const [column, sql] = columnSql;
                if (!rawMailColumns.has(column)) {
                    await c.env.DB.exec(sql);
                }
            }
            await c.env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_raw_mails_original_domain ON raw_mails(original_domain);`);
            await c.env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_raw_mails_ingress_source ON raw_mails(ingress_source);`);

            const addressInfo = await c.env.DB.prepare(
                `PRAGMA table_info(address)`
            ).all();
            const addressColumns = new Set(addressInfo.results?.map(
                (col: any) => col.name
            ) || []);
            if (!addressColumns.has('display_label')) {
                await c.env.DB.exec(`ALTER TABLE address ADD COLUMN display_label TEXT;`);
            }
            if (!addressColumns.has('owner_note')) {
                await c.env.DB.exec(`ALTER TABLE address ADD COLUMN owner_note TEXT;`);
            }
            await c.env.DB.exec(`
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
            `);
        }
        if (version && isVersionLte(version, "v0.0.8")) {
            // migration to v0.0.9: add credential rotation for address JWTs
            const addressInfo = await c.env.DB.prepare(
                `PRAGMA table_info(address)`
            ).all();
            const addressColumns = new Set(addressInfo.results?.map(
                (col: any) => col.name
            ) || []);
            if (!addressColumns.has('credential_version')) {
                await c.env.DB.exec(`ALTER TABLE address ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 1;`);
            }
        }
        if (version && isVersionLte(version, "v0.0.9")) {
            // migration to v0.0.10: user identifiers and normalized address labels
            const usersInfo = await c.env.DB.prepare(
                `PRAGMA table_info(users)`
            ).all();
            const userColumns = new Set(usersInfo.results?.map(
                (col: any) => col.name
            ) || []);
            if (!userColumns.has('username')) {
                await c.env.DB.exec(`ALTER TABLE users ADD COLUMN username TEXT;`);
            }
            if (!userColumns.has('display_name')) {
                await c.env.DB.exec(`ALTER TABLE users ADD COLUMN display_name TEXT;`);
            }
            await c.env.DB.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);`);

            await c.env.DB.exec(`
                CREATE TABLE IF NOT EXISTS labels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    color TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_labels_name ON labels(name);
                CREATE TABLE IF NOT EXISTS address_labels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    address_id INTEGER NOT NULL,
                    label_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(address_id, label_id)
                );
                CREATE INDEX IF NOT EXISTS idx_address_labels_address_id ON address_labels(address_id);
                CREATE INDEX IF NOT EXISTS idx_address_labels_label_id ON address_labels(label_id);
            `);
            await c.env.DB.exec(`
                INSERT OR IGNORE INTO labels(name)
                SELECT DISTINCT trim(display_label)
                FROM address
                WHERE display_label IS NOT NULL AND trim(display_label) != '';
                INSERT OR IGNORE INTO address_labels(address_id, label_id)
                SELECT a.id, l.id
                FROM address a
                JOIN labels l ON l.name = trim(a.display_label)
                WHERE a.display_label IS NOT NULL AND trim(a.display_label) != '';
            `);
        }
        if (version && isVersionLte(version, "v0.0.10")) {
            // migration to v0.0.11: audit and access event tables
            const auditEventMigrationQueries = `
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_type TEXT,
                    actor_id TEXT,
                    actor_label TEXT,
                    action TEXT NOT NULL,
                    resource_type TEXT,
                    resource_id TEXT,
                    resource_label TEXT,
                    status TEXT NOT NULL DEFAULT 'success',
                    ip TEXT,
                    user_agent TEXT,
                    method TEXT,
                    path TEXT,
                    source TEXT,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
                CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
                CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_type, actor_id);
                CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
                CREATE INDEX IF NOT EXISTS idx_audit_events_status ON audit_events(status);

                CREATE TABLE IF NOT EXISTS access_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_type TEXT,
                    actor_id TEXT,
                    actor_label TEXT,
                    event_type TEXT NOT NULL,
                    resource_type TEXT,
                    resource_id TEXT,
                    resource_label TEXT,
                    status TEXT NOT NULL DEFAULT 'success',
                    failure_reason TEXT,
                    ip TEXT,
                    user_agent TEXT,
                    method TEXT,
                    path TEXT,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at);
                CREATE INDEX IF NOT EXISTS idx_access_events_event_type ON access_events(event_type);
                CREATE INDEX IF NOT EXISTS idx_access_events_actor ON access_events(actor_type, actor_id);
                CREATE INDEX IF NOT EXISTS idx_access_events_resource ON access_events(resource_type, resource_id);
                CREATE INDEX IF NOT EXISTS idx_access_events_status ON access_events(status);
                CREATE INDEX IF NOT EXISTS idx_access_events_ip ON access_events(ip);
            `;
            const query = auditEventMigrationQueries.replace(/[\r\n]/g, " ")
                .split(";")
                .map((statement) => statement.trim())
                .filter((statement) => statement.length > 0)
                .join(";\n");
            await c.env.DB.exec(query);
        }
        if (version && isVersionLte(version, "v0.0.11")) {
            const managedDomainMigrationQueries = `
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
            `;
            const query = managedDomainMigrationQueries.replace(/[\r\n]/g, " ")
                .split(";")
                .map((statement) => statement.trim())
                .filter((statement) => statement.length > 0)
                .join(";\n");
            await c.env.DB.exec(query);
        }
        if (version === "v0.0.12") {
            const managedDomainHardeningQueries = `
                ALTER TABLE managed_domains ADD COLUMN verification_started_at DATETIME;
                ALTER TABLE managed_domains ADD COLUMN verification_expires_at DATETIME;
                ALTER TABLE managed_domains ADD COLUMN verification_consumed_at DATETIME;
                ALTER TABLE managed_domains ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;
                UPDATE managed_domains
                SET verification_token = NULL,
                    verification_started_at = NULL,
                    verification_expires_at = NULL,
                    verification_consumed_at = NULL,
                    last_error = CASE WHEN setup_status = 'active' THEN NULL ELSE last_error END,
                    config_version = COALESCE(config_version, 1),
                    updated_at = datetime('now');
            `;
            const query = managedDomainHardeningQueries.replace(/[\r\n]/g, " ")
                .split(";")
                .map((statement) => statement.trim())
                .filter((statement) => statement.length > 0)
                .join(";\n");
            await c.env.DB.exec(query);
        }
        if (version != CONSTANTS.DB_VERSION) {
            // remove all \r and \n characters from the query string
            // split by ; and join with a ;\n
            const query = DB_INIT_QUERIES.replace(/[\r\n]/g, "")
                .split(";")
                .map((query) => query.trim())
                .join(";\n");
            await c.env.DB.exec(query);
            // Update the version in the settings table
            await utils.saveSetting(c, CONSTANTS.DB_VERSION_KEY, CONSTANTS.DB_VERSION);
            await recordAuditEvent(c, {
                action: "db.migrate.success",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "database",
                status: "success",
                metadata: {
                    from_version: version || null,
                    to_version: CONSTANTS.DB_VERSION,
                },
            });
            return c.json({
                success: true,
                message: "Database migrated"
            });
        }
        await recordAuditEvent(c, {
            action: "db.migrate.skipped",
            actor_type: "admin",
            actor_label: "admin",
            resource_type: "database",
            status: "skipped",
            metadata: { current_db_version: version || null },
        });
        return c.json({
            success: true,
            message: "Database does not need migration"
        });
    },
    getVersion: async (c: Context<HonoCustomType>) => {
        const version = await utils.getSetting(c, CONSTANTS.DB_VERSION_KEY);
        return c.json({
            need_initialization: !version,
            need_migration: version && version != CONSTANTS.DB_VERSION,
            current_db_version: version,
            code_db_version: CONSTANTS.DB_VERSION
        });
    },
}
