import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import addressApi from "../admin_api/address_api";

const jsonRequest = (body: Record<string, unknown>) => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
});

describe("admin address write concurrency", () => {
    it("uses credential_version compare-and-swap to reject a replayed rotation", async () => {
        let credentialVersion = 2;
        const queries: { sql: string, bindings: unknown[] }[] = [];
        const db = {
            prepare: (sql: string) => {
                let bindings: unknown[] = [];
                const statement = {
                    bind(...values: unknown[]) {
                        bindings = values;
                        return statement;
                    },
                    first: async () => {
                        queries.push({ sql, bindings });
                        if (/SELECT id, name, COALESCE\(credential_version/i.test(sql)) {
                            return { id: 7, name: "ops@example.test", credential_version: credentialVersion };
                        }
                        return null;
                    },
                    run: async () => {
                        queries.push({ sql, bindings });
                        if (/UPDATE address[\s\S]+credential_version/i.test(sql)) {
                            const expected = Number(bindings[1]);
                            if (expected !== credentialVersion) return { success: true, meta: { changes: 0 } };
                            credentialVersion += 1;
                            return { success: true, meta: { changes: 1 } };
                        }
                        return { success: true, meta: { changes: 1 } };
                    },
                };
                return statement;
            },
        } as unknown as D1Database;
        const app = new Hono<HonoCustomType>();
        app.post("/address/:id/rotate", addressApi.rotateCredential);
        const env = { DB: db, JWT_SECRET: "fixture-secret", DEFAULT_LANG: "en" } as Bindings;

        const first = await app.request("/address/7/rotate", jsonRequest({
            confirm: true,
            expected_credential_version: 2,
        }), env);
        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({ credential_version: 3 });

        const replay = await app.request("/address/7/rotate", jsonRequest({
            confirm: true,
            expected_credential_version: 2,
        }), env);
        expect(replay.status).toBe(409);
        expect(await replay.json()).toMatchObject({
            error: "credential_version_conflict",
            current: { credential_version: 3 },
        });
        expect(queries.filter((query) => /UPDATE address[\s\S]+credential_version/i.test(query.sql))).toHaveLength(1);
    });

    it("checks the displayed address snapshot and submits the cascade as one D1 batch", async () => {
        const statements: string[] = [];
        let batchCalls = 0;
        const snapshot = {
            name: "ops@example.test",
            credential_version: 3,
            mail_count: 4,
            sent_count: 2,
            active_share_count: 1,
        };
        const db = {
            prepare: (sql: string) => {
                let bindings: unknown[] = [];
                return {
                    bind(...values: unknown[]) {
                        bindings = values;
                        return this;
                    },
                    first: async () => (/active_share_count/i.test(sql) ? snapshot : null),
                    run: async () => ({ success: true, meta: { changes: 1 }, bindings }),
                    sql,
                };
            },
            batch: async (prepared: { sql: string }[]) => {
                batchCalls += 1;
                statements.push(...prepared.map((statement) => statement.sql));
                return prepared.map(() => ({ success: true, meta: { changes: 1 } }));
            },
        } as unknown as D1Database;
        const app = new Hono<HonoCustomType>();
        app.delete("/address/:id", addressApi.deleteAddress);
        const env = { DB: db, JWT_SECRET: "fixture-secret", DEFAULT_LANG: "en" } as Bindings;
        const body = {
            confirm: true,
            expected_credential_version: 3,
            expected_mail_count: 4,
            expected_sent_count: 2,
            expected_share_count: 1,
        };

        const response = await app.request("/address/7", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }, env);
        expect(response.status).toBe(200);
        expect(batchCalls).toBe(1);
        expect(statements).toHaveLength(9);
        expect(statements.some((sql) => /DELETE FROM auto_reply_mails/i.test(sql))).toBe(true);
        expect(statements.some((sql) => /DELETE FROM address_share_tokens/i.test(sql))).toBe(true);
        expect(statements.some((sql) => /DELETE FROM address_labels/i.test(sql))).toBe(true);
        expect(statements.at(-1)).toMatch(/DELETE FROM address WHERE id/i);

        const stale = await app.request("/address/7", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, expected_mail_count: 3 }),
        }, env);
        expect(stale.status).toBe(409);
        expect(batchCalls).toBe(1);
    });
});
