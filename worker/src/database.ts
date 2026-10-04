import schema from '../../db/schema.sql';
import password from '../../db/2025-09-23-patch.sql';
import metadata from '../../db/2025-12-06-metadata.sql';
import sourceMeta from '../../db/2025-12-27-source-meta.sql';
import messageId from '../../db/2025-12-15-message-id-index.sql';
import rawBlob from '../../db/2026-04-03-raw-blob.sql';
import ingress from '../../db/2026-05-06-share-tokens-and-ingress.sql';
import credentials from '../../db/2026-05-06-credential-rotation.sql';
import identities from '../../db/2026-05-07-user-identity-labels.sql';
import audit from '../../db/2026-05-08-audit-access-events.sql';
import domains from '../../db/2026-06-18-managed-domains.sql';
import hardening from '../../db/2026-06-18-managed-domain-hardening.sql';
import readStates from '../../db/2026-07-27-mail-read-states.sql';
import delivery from '../../db/2026-08-13-delivery-authority.sql';
import consistency from '../../db/2026-10-05-schema-consistency.sql';
import authenticatorSources from '../../db/2026-10-05-authenticator-access-sources.sql';
import { CONSTANTS } from './constants';

const migrations = [
    [3, password], [4, metadata], [5, sourceMeta], [6, messageId], [7, rawBlob],
    [8, ingress], [9, credentials], [10, identities], [11, audit], [12, domains],
    [13, hardening], [14, readStates], [15, delivery], [18, authenticatorSources],
] as const;

// SQL files here contain no triggers or semicolons inside string literals.
export const sqlStatements = (sql: string) => sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);

async function execute(db: D1Database, sql: string) {
    for (const statement of sqlStatements(sql)) {
        // Historical scripts may mark a version before their entire step finishes.
        // Only this executor writes the version after every statement succeeds.
        if (/INSERT\s+OR\s+REPLACE\s+INTO\s+settings/i.test(statement) && /'db_version'/i.test(statement)) continue;
        const column = statement.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)/i);
        if (column) {
            const info = await db.prepare(`PRAGMA table_info(${column[1]})`).all<{ name: string }>();
            if (info.results.some(row => row.name === column[2])) continue;
        }
        // D1 exec expects one statement per line; prepare/run also preserves comments safely.
        await db.prepare(statement).run();
    }
}

async function reconcileAuthenticatorTables(db: D1Database) {
    const names = ['user_authenticators', 'authenticator_share_tokens', 'user_authenticator_access'];
    const statements: D1PreparedStatement[] = [];
    for (const name of names) {
        const definition = sqlStatements(schema).find(s => s.startsWith(`CREATE TABLE IF NOT EXISTS ${name} (`))!;
        const columns = definition.split('\n').slice(1).map(line => line.trim().match(/^(\w+)\s+(?:TEXT|INTEGER|DATETIME)\b/i)?.[1]).filter(Boolean) as string[];
        const current = await db.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>();
        // Unknown columns may contain recovery data. Do not silently discard them.
        if (current.results.length !== columns.length || current.results.some(row => !columns.includes(row.name))) {
            throw new Error(`unsupported_database_shape:${name}`);
        }
        const staging = `${name}_v17`;
        const fields = columns.join(', ');
        statements.push(db.prepare(definition.replace(`IF NOT EXISTS ${name}`, staging)),
            db.prepare(`INSERT INTO ${staging} (${fields}) SELECT ${fields} FROM ${name}`));
    }
    for (const name of [...names].reverse()) statements.push(db.prepare(`DROP TABLE ${name}`));
    for (const name of names) statements.push(db.prepare(`ALTER TABLE ${name}_v17 RENAME TO ${name}`));
    // D1 batch is transactional. A failed copy/rename keeps the original tables.
    await db.batch(statements);
    await execute(db, consistency);
}

async function reconcileAuthenticatorSources(db: D1Database) {
    const names = ['user_authenticators', 'authenticator_share_tokens', 'user_authenticator_access'];
    const definitions = sqlStatements(schema);
    const definition = (name: string) => definitions.find(s => s.startsWith(`CREATE TABLE IF NOT EXISTS ${name} (`))!;
    const stagingDefinition = (name: string) => definition(name)
        .replace(`IF NOT EXISTS ${name}`, `${name}_v18`)
        .replaceAll('REFERENCES user_authenticators', 'REFERENCES user_authenticators_v18')
        .replaceAll('REFERENCES authenticator_share_tokens', 'REFERENCES authenticator_share_tokens_v18');
    const legacyColumns: Record<string, string[]> = {
        user_authenticators: ['id', 'user_id', 'label', 'issuer', 'secret_ciphertext', 'secret_nonce', 'algorithm', 'digits', 'period', 'created_at'],
        authenticator_share_tokens: ['id', 'authenticator_id', 'token_hash', 'expires_at', 'revoked_at', 'created_at'],
        user_authenticator_access: ['user_id', 'authenticator_id', 'share_id', 'created_at'],
    };
    for (const name of names) {
        const current = await db.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>();
        const expected = legacyColumns[name];
        if (current.results.length !== expected.length || current.results.some(row => !expected.includes(row.name))) {
            throw new Error(`unsupported_database_shape:${name}`);
        }
    }
    const statements: D1PreparedStatement[] = [];
    statements.push(
        db.prepare(stagingDefinition('user_authenticators')),
        db.prepare(`INSERT INTO user_authenticators_v18
            (id, label, issuer, secret_ciphertext, secret_nonce, algorithm, digits, period, created_at)
            SELECT id, label, issuer, secret_ciphertext, secret_nonce, algorithm, digits, period, created_at
            FROM user_authenticators`),
        db.prepare(stagingDefinition('authenticator_share_tokens')),
        db.prepare(`INSERT INTO authenticator_share_tokens_v18
            (id, authenticator_id, token_hash, expires_at, revoked_at, created_at)
            SELECT id, authenticator_id, token_hash, expires_at, revoked_at, created_at
            FROM authenticator_share_tokens WHERE token_hash NOT LIKE 'assignment:%'`),
        db.prepare(stagingDefinition('user_authenticator_access')),
        db.prepare(`INSERT INTO user_authenticator_access_v18
            (user_id, authenticator_id, direct_assigned, share_id, created_at)
            SELECT x.user_id, x.authenticator_id,
                CASE WHEN s.token_hash LIKE 'assignment:%' THEN 1 ELSE 0 END,
                CASE WHEN s.token_hash LIKE 'assignment:%' THEN NULL ELSE x.share_id END,
                x.created_at
            FROM user_authenticator_access x
            JOIN authenticator_share_tokens s ON s.id = x.share_id`),
    );
    for (const name of [...names].reverse()) statements.push(db.prepare(`DROP TABLE ${name}`));
    for (const name of names) statements.push(db.prepare(`ALTER TABLE ${name}_v18 RENAME TO ${name}`));
    await db.batch(statements);
}

async function hasLegacyAuthenticatorOwner(db: D1Database) {
    const table = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_authenticators'").first();
    if (!table) return false;
    const columns = await db.prepare('PRAGMA table_info(user_authenticators)').all<{ name: string }>();
    return columns.results.some(row => row.name === 'user_id');
}

export async function getDatabaseVersion(db: D1Database) {
    const hasSettings = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").first();
    return hasSettings ? await db.prepare("SELECT value FROM settings WHERE key = 'db_version'").first<string>('value') : null;
}

export async function initializeDatabase(db: D1Database) {
    const version = await getDatabaseVersion(db);
    return version ? { from: version, changed: false } : migrateDatabase(db);
}

export async function migrateDatabase(db: D1Database) {
    const version = await getDatabaseVersion(db);
    const match = version?.match(/^v0\.0\.(\d+)$/);
    if (version && (!match || Number(match[1]) < 2 || Number(match[1]) > Number(CONSTANTS.DB_VERSION.split('.').at(-1)))) {
        throw new Error('unsupported_database_version');
    }
    if (version === CONSTANTS.DB_VERSION) return { from: version, changed: false };
    const existingAuthenticators = !version && await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_authenticators'").first();
    // Create missing tables from the current definition before old patches add columns.
    const definitions = sqlStatements(schema);
    for (const statement of definitions.filter(s => /^CREATE TABLE/i.test(s))) await execute(db, statement);
    for (const [target, sql] of migrations) {
        if (!version || Number(match![1]) < target) {
            if (target === 18) {
                if (await hasLegacyAuthenticatorOwner(db)) await reconcileAuthenticatorSources(db);
                await execute(db, sql);
            } else await execute(db, sql);
        }
    }
    await execute(db, schema);
    await db.prepare("INSERT INTO settings (key, value) VALUES ('db_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(CONSTANTS.DB_VERSION).run();
    return { from: version, changed: true };
}
