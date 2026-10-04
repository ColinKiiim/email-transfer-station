import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase, migrateDatabase, sqlStatements } from '../database';
import { decryptTotp, encryptTotp } from '../totp';
import { sqliteD1 } from './sqlite-d1';
import { CONSTANTS } from '../constants';

const databases: ReturnType<typeof sqliteD1>[] = [];
const fixture = () => { const db = sqliteD1(); databases.push(db); return db; };
afterEach(() => { for (const db of databases.splice(0)) db.sqlite.close(); });
const sql = (file: string) => readFileSync(new URL(`../../../db/${file}`, import.meta.url), 'utf8');
const normalize = (rows: Record<string, any>[]) => rows.map(row => ({ ...row, sql: row.sql?.replace(/\s+/g, ' ') }));
const structure = (db: ReturnType<typeof sqliteD1>) => normalize(db.sqlite.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all());
const relationalStructure = (db: ReturnType<typeof sqliteD1>) => db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => ({
    name: row.name,
    columns: db.sqlite.prepare(`PRAGMA table_info(${row.name})`).all().map(c => [c.name, c.type, c.notnull, c.dflt_value, c.pk]).sort(),
    foreignKeys: db.sqlite.prepare(`PRAGMA foreign_key_list(${row.name})`).all(),
    indexes: db.sqlite.prepare(`PRAGMA index_list(${row.name})`).all().map(index => ({
        name: index.name, unique: index.unique, origin: index.origin, partial: index.partial,
        columns: db.sqlite.prepare(`PRAGMA index_info(${index.name})`).all().map(c => c.name),
    })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
}));

describe('single-source database upgrades', () => {
    it('initializes from the canonical schema and repeats without changing structure', async () => {
        const db = fixture(), canonical = fixture();
        canonical.sqlite.exec(sql('schema.sql'));
        await migrateDatabase(db.db);
        expect(structure(db)).toEqual(structure(canonical));
        expect(await migrateDatabase(db.db)).toEqual({ from: CONSTANTS.DB_VERSION, changed: false });
    });

    it('upgrades a representative v0.0.2 database with retries and preserves data', async () => {
        const db = fixture(), canonical = fixture();
        canonical.sqlite.exec(sql('schema.sql'));
        db.sqlite.exec("CREATE TABLE raw_mails (id INTEGER PRIMARY KEY, message_id TEXT, source TEXT, address TEXT, raw TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP); CREATE TABLE address (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP); CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP); INSERT INTO settings (key,value) VALUES ('db_version','v0.0.2'); INSERT INTO raw_mails (id, raw) VALUES (7,'fixture mail')");
        const prepare = db.db.prepare.bind(db.db);
        let failed = false;
        db.db.prepare = (statement: string) => {
            if (!failed && /CREATE INDEX.*idx_raw_mails_original_domain/i.test(statement)) { failed = true; throw new Error('fixture failure'); }
            return prepare(statement);
        };
        await expect(migrateDatabase(db.db)).rejects.toThrow('fixture failure');
        expect(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'db_version'").get()?.value).toBe('v0.0.2');
        await migrateDatabase(db.db);
        expect(db.sqlite.prepare('SELECT raw FROM raw_mails WHERE id = 7').get()?.raw).toBe('fixture mail');
        // SQLite ALTER retains physical column order and historical table SQL.
        for (const row of canonical.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
            const columns = (database: typeof db) => database.sqlite.prepare(`PRAGMA table_info(${row.name})`).all().map(c => [c.name, c.type, c.notnull, c.dflt_value, c.pk]).sort();
            expect(columns(db)).toEqual(columns(canonical));
            expect(db.sqlite.prepare(`PRAGMA foreign_key_list(${row.name})`).all()).toEqual(canonical.sqlite.prepare(`PRAGMA foreign_key_list(${row.name})`).all());
        }
        const indexes = (database: typeof db) => normalize(database.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all());
        expect(indexes(db)).toEqual(indexes(canonical));
    });

    it.each(['runtime', 'published-foreign-keys'])('normalizes v0.0.16 %s without losing ids, ciphertext, links, or access', async variant => {
        const db = fixture(), canonical = fixture();
        const key = btoa('b'.repeat(32));
        const encrypted = await encryptTotp('JBSWY3DPEHPK3PXP', key, 'existing-item');
        canonical.sqlite.exec(sql('schema.sql'));
        const names = ['user_authenticators', 'authenticator_share_tokens', 'user_authenticator_access'];
        db.sqlite.exec(sqlStatements(sql('schema.sql')).filter(s => !names.some(name => new RegExp(`\\b${name}\\b`).test(s))).join(';') + ';');
        if (variant === 'published-foreign-keys') db.sqlite.exec(sql('2026-10-04-authenticators.sql'));
        else db.sqlite.exec(sql('schema.sql'));
        db.sqlite.exec("INSERT INTO settings (key,value) VALUES ('db_version','v0.0.16'); INSERT INTO users (id,user_email,password) VALUES (1,'owner@example.test','fixture'),(2,'recipient@example.test','fixture')");
        db.sqlite.prepare('INSERT INTO user_authenticators (id,user_id,label,secret_ciphertext,secret_nonce) VALUES (?,?,?,?,?)').run('existing-item', 1, 'Existing', encrypted.secret_ciphertext, encrypted.secret_nonce);
        db.sqlite.exec("INSERT INTO authenticator_share_tokens (id,authenticator_id,token_hash) VALUES ('direct','existing-item','assignment:direct'),('real','existing-item','fixture-token-hash'); INSERT INTO user_authenticator_access (user_id,authenticator_id,share_id) VALUES (2,'existing-item','direct')");
        const rows = (table: string) => db.sqlite.prepare(`SELECT * FROM ${table}`).all();
        const before = names.map(rows);
        await migrateDatabase(db.db);
        expect(names.map(rows)).toEqual(before);
        expect(relationalStructure(db)).toEqual(relationalStructure(canonical));
        expect(await decryptTotp(encrypted.secret_ciphertext, encrypted.secret_nonce, key, 'existing-item')).toBe('JBSWY3DPEHPK3PXP');
        expect(rows('user_authenticator_access')).toHaveLength(1); // No grant to historical owner 1.
        expect(await migrateDatabase(db.db)).toEqual({ from: CONSTANTS.DB_VERSION, changed: false });
    });

    it('rolls back a failed corrective batch, keeps the old version, and retries safely', async () => {
        const db = fixture();
        db.sqlite.exec(sql('schema.sql'));
        db.sqlite.exec("INSERT INTO settings (key,value) VALUES ('db_version','v0.0.16')");
        const before = structure(db);
        const prepare = db.db.prepare.bind(db.db);
        let fail = true;
        db.db.prepare = statement => prepare(fail && statement === 'DROP TABLE user_authenticators' ? 'DROP TABLE fixture_missing_table' : statement);
        await expect(migrateDatabase(db.db)).rejects.toThrow();
        expect(structure(db)).toEqual(before);
        expect(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'db_version'").get()?.value).toBe('v0.0.16');
        fail = false;
        await migrateDatabase(db.db);
        expect(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'db_version'").get()?.value).toBe(CONSTANTS.DB_VERSION);
    });

    it('preserves unexpected recovery columns instead of silently dropping them', async () => {
        const db = fixture();
        db.sqlite.exec(sql('schema.sql'));
        db.sqlite.exec("INSERT INTO settings (key,value) VALUES ('db_version','v0.0.16'); ALTER TABLE user_authenticators ADD COLUMN recovery_note TEXT");
        await expect(migrateDatabase(db.db)).rejects.toThrow('unsupported_database_shape:user_authenticators');
        expect(db.sqlite.prepare('PRAGMA table_info(user_authenticators)').all().some(c => c.name === 'recovery_note')).toBe(true);
    });

    it('does not upgrade an existing database through the initialize action', async () => {
        const db = fixture();
        db.sqlite.exec(sql('schema.sql'));
        db.sqlite.exec("INSERT INTO settings (key,value) VALUES ('db_version','v0.0.16')");
        expect(await initializeDatabase(db.db)).toEqual({ from: 'v0.0.16', changed: false });
        expect(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'db_version'").get()?.value).toBe('v0.0.16');
    });

    it('retries a partially applied v0.0.12 hardening patch and invalidates old public tokens', async () => {
        const db = fixture(), canonical = fixture();
        canonical.sqlite.exec(sql('schema.sql'));
        const legacySchema = sql('schema.sql').replace(/^\s+(?:verification_started_at|verification_expires_at|verification_consumed_at|config_version) .*\r?\n/gm, '');
        db.sqlite.exec(legacySchema);
        db.sqlite.exec("INSERT INTO settings (key,value) VALUES ('db_version','v0.0.12'); INSERT INTO managed_domains (domain,verification_token) VALUES ('fixture.test','public-fixture-token')");
        const prepare = db.db.prepare.bind(db.db);
        let fail = true;
        db.db.prepare = statement => {
            if (fail && /ALTER TABLE managed_domains ADD COLUMN verification_expires_at/i.test(statement)) throw new Error('fixture interruption');
            return prepare(statement);
        };
        await expect(migrateDatabase(db.db)).rejects.toThrow('fixture interruption');
        expect(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'db_version'").get()?.value).toBe('v0.0.12');
        fail = false;
        await migrateDatabase(db.db);
        expect(relationalStructure(db)).toEqual(relationalStructure(canonical));
        expect(db.sqlite.prepare('SELECT verification_token FROM managed_domains').get()?.verification_token).toBeNull();
    });

    it('retries after schema completion if the final version write fails', async () => {
        const db = fixture();
        db.sqlite.exec(sql('schema.sql'));
        db.sqlite.exec("INSERT INTO settings (key,value) VALUES ('db_version','v0.0.16')");
        const prepare = db.db.prepare.bind(db.db);
        let fail = true;
        db.db.prepare = statement => {
            if (fail && statement.startsWith('INSERT INTO settings')) throw new Error('fixture version write failure');
            return prepare(statement);
        };
        await expect(migrateDatabase(db.db)).rejects.toThrow('fixture version write failure');
        expect(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'db_version'").get()?.value).toBe('v0.0.16');
        fail = false;
        await migrateDatabase(db.db);
        expect(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'db_version'").get()?.value).toBe(CONSTANTS.DB_VERSION);
    });

    it('rejects unknown/future versions without downgrading them', async () => {
        const db = fixture();
        db.sqlite.exec(sql('schema.sql'));
        db.sqlite.exec("INSERT INTO settings (key,value) VALUES ('db_version','v0.0.999')");
        await expect(migrateDatabase(db.db)).rejects.toThrow('unsupported_database_version');
    });
});
