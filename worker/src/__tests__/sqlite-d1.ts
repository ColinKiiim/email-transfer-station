import { DatabaseSync } from 'node:sqlite';

// Executes the application SQL and constraints; this is not a SQL-pattern mock.
export function sqliteD1() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    const prepare = (sql: string) => {
        let values: any[] = [];
        const statement = {
            bind(...bindings: any[]) { values = bindings; return statement; },
            async first(column?: string) {
                const row = sqlite.prepare(sql).get(...values);
                return column ? row?.[column] ?? null : row ?? null;
            },
            async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
            async run() {
                const result = sqlite.prepare(sql).run(...values);
                return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            },
        };
        return statement;
    };
    const db = {
        prepare,
        async exec(sql: string) { sqlite.exec(sql); return { count: 1, duration: 0 }; },
        async batch(statements: ReturnType<typeof prepare>[]) {
            sqlite.exec('BEGIN');
            try {
                const results = [];
                for (const statement of statements) results.push(await statement.run());
                sqlite.exec('COMMIT');
                return results;
            } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        },
    } as unknown as D1Database;
    return { sqlite, db };
}
