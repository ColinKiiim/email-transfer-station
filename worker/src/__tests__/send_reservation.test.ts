import type { Context } from "hono";
import { describe, expect, it } from "vitest";

import { CONSTANTS } from "../constants";
import { releaseSendBalance, reserveSendBalance } from "../mails_api/send_balance";
import {
    releaseSendMailLimit,
    reserveSendMailLimit,
    SendMailLimitError,
} from "../mails_api/send_mail_limit_utils";

const contextWithDb = (db: D1Database) => ({
    env: { DB: db, DEFAULT_LANG: "en" },
    get: () => undefined,
}) as unknown as Context<HonoCustomType>;

describe("send reservations", () => {
    it("atomically reserves and releases one address balance", async () => {
        let balance = 1;
        const db = {
            prepare: (sql: string) => ({
                bind: () => ({
                    run: async () => {
                        if (/balance = balance - 1/i.test(sql)) {
                            if (balance < 1) return { success: true, meta: { changes: 0 } };
                            balance -= 1;
                        } else {
                            balance += 1;
                        }
                        return { success: true, meta: { changes: 1 } };
                    },
                }),
            }),
        } as unknown as D1Database;
        const c = contextWithDb(db);

        await expect(reserveSendBalance(c, "a@example.test")).resolves.toBe(true);
        await expect(reserveSendBalance(c, "a@example.test")).resolves.toBe(false);
        await releaseSendBalance(c, "a@example.test");
        await expect(reserveSendBalance(c, "a@example.test")).resolves.toBe(true);
    });

    it("fails closed at the configured quota and permits a released slot", async () => {
        const values = new Map<string, string>([[
            CONSTANTS.SEND_MAIL_LIMIT_CONFIG_KEY,
            JSON.stringify({ dailyEnabled: true, dailyLimit: 1, monthlyEnabled: false, monthlyLimit: null }),
        ]]);
        const db = {
            prepare: (sql: string) => {
                let bindings: unknown[] = [];
                const statement = {
                    bind: (...valuesToBind: unknown[]) => {
                        bindings = valuesToBind;
                        return statement;
                    },
                    first: async () => values.get(String(bindings[0])) || null,
                    run: async () => {
                        const key = String(bindings[0]);
                        if (/INSERT INTO settings/i.test(sql)) {
                            if (!values.has(key)) values.set(key, "0");
                            return { success: true, meta: { changes: 1 } };
                        }
                        const current = Number(values.get(key) || 0);
                        if (/\+ 1/i.test(sql)) {
                            const limit = Number(bindings[1]);
                            if (current >= limit) return { success: true, meta: { changes: 0 } };
                            values.set(key, String(current + 1));
                        } else {
                            values.set(key, String(Math.max(current - 1, 0)));
                        }
                        return { success: true, meta: { changes: 1 } };
                    },
                };
                return statement;
            },
            batch: async (statements: unknown[]) => statements.map(() => ({ success: true })),
        } as unknown as D1Database;
        const c = contextWithDb(db);

        const first = await reserveSendMailLimit(c);
        await expect(reserveSendMailLimit(c)).rejects.toBeInstanceOf(SendMailLimitError);
        await releaseSendMailLimit(c, first);
        await expect(reserveSendMailLimit(c)).resolves.toMatchObject({ keys: [expect.any(String)] });
    });

    it("does not silently disable quotas when the config read fails", async () => {
        const db = {
            prepare: () => ({
                bind: () => ({ first: async () => { throw new Error("D1 unavailable"); } }),
            }),
        } as unknown as D1Database;

        await expect(reserveSendMailLimit(contextWithDb(db))).rejects.toThrow("D1 unavailable");
    });
});
