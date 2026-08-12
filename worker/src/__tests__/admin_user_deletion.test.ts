import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import adminUserApi from "../admin_api/admin_user_api";

describe("admin user deletion", () => {
    it("removes authentication and ownership rows in one D1 batch before the user", async () => {
        const statements: string[] = [];
        let batchCalls = 0;
        const db = {
            prepare: (sql: string) => {
                let bindings: unknown[] = [];
                return {
                    sql,
                    bind(...values: unknown[]) {
                        bindings = values;
                        return this;
                    },
                    first: async (column?: string) => column === "user_email" ? "owner@example.test" : null,
                    run: async () => ({ success: true, meta: { changes: 1 }, bindings }),
                };
            },
            batch: async (prepared: { sql: string }[]) => {
                batchCalls += 1;
                statements.push(...prepared.map((statement) => statement.sql));
                return prepared.map(() => ({ success: true, meta: { changes: 1 } }));
            },
        } as unknown as D1Database;
        const app = new Hono<HonoCustomType>();
        app.delete("/users/:user_id", adminUserApi.deleteUser);

        const response = await app.request("/users/7", { method: "DELETE" }, {
            DB: db,
            DEFAULT_LANG: "en",
        } as Bindings);

        expect(response.status).toBe(200);
        expect(batchCalls).toBe(1);
        expect(statements.map((sql) => sql.match(/DELETE FROM (\w+)/i)?.[1])).toEqual([
            "user_passkeys",
            "user_roles",
            "users_address",
            "users",
        ]);
    });
});
