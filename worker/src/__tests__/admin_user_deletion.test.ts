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
                    first: async (column?: string) => {
                        if (/FROM users /i.test(sql)) {
                            return column === "user_email" ? "owner@example.test" : { id: 7, user_email: "owner@example.test" };
                        }
                        if (/FROM user_roles/i.test(sql)) {
                            return null;
                        }
                        return null;
                    },
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

    it("rejects deletion of a nonexistent user", async () => {
        const db = {
            prepare: (sql: string) => ({
                sql,
                bind: () => ({
                    first: async () => null,
                }),
            }),
        } as unknown as D1Database;
        const app = new Hono<HonoCustomType>();
        app.delete("/users/:user_id", adminUserApi.deleteUser);

        const response = await app.request("/users/999", { method: "DELETE" }, {
            DB: db,
            DEFAULT_LANG: "en",
        } as Bindings);

        expect(response.status).toBe(400);
    });

    it("prevents self-deletion by a role-based administrator", async () => {
        const db = {
            prepare: (sql: string) => ({
                sql,
                bind: () => ({
                    first: async () => ({ id: 7, user_email: "admin@example.test" }),
                }),
            }),
        } as unknown as D1Database;
        const app = new Hono<HonoCustomType>();
        app.use("*", async (c, next) => {
            c.set("adminActor", {
                actor_type: "user",
                actor_id: 7,
                actor_label: "admin@example.test",
                auth_method: "admin_user_role",
            });
            await next();
        });
        app.delete("/users/:user_id", adminUserApi.deleteUser);

        const response = await app.request("/users/7", { method: "DELETE" }, {
            DB: db,
            DEFAULT_LANG: "en",
            ADMIN_USER_ROLE: "admin",
        } as Bindings);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "admin_current_actor_protected" });
    });

    it("prevents deletion of the last role-based administrator", async () => {
        const db = {
            prepare: (sql: string) => ({
                sql,
                bind: () => ({
                    first: async (column?: string) => {
                        if (/FROM users /i.test(sql)) {
                            return { id: 8, user_email: "admin2@example.test" };
                        }
                        if (/FROM user_roles WHERE user_id/i.test(sql)) {
                            return "admin";
                        }
                        if (/SELECT COUNT\(\*\)/i.test(sql)) {
                            return column === "count" ? 1 : { count: 1 };
                        }
                        return null;
                    },
                }),
            }),
        } as unknown as D1Database;
        const app = new Hono<HonoCustomType>();
        app.use("*", async (c, next) => {
            c.set("adminActor", {
                actor_type: "admin",
                actor_label: "static-admin",
                auth_method: "admin_session",
            });
            await next();
        });
        app.delete("/users/:user_id", adminUserApi.deleteUser);

        const response = await app.request("/users/8", { method: "DELETE" }, {
            DB: db,
            DEFAULT_LANG: "en",
            ADMIN_USER_ROLE: "admin",
        } as Bindings);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "admin_last_role_holder_protected" });
    });
});
