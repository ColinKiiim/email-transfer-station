import { Jwt } from "hono/utils/jwt";
import { beforeEach, describe, expect, it } from "vitest";

import worker from "../worker";

type QueryRecord = {
    sql: string;
    bindings: unknown[];
    operation: "all" | "first" | "run";
};

class FakeStatement {
    private bindings: unknown[] = [];

    constructor(
        private readonly sql: string,
        private readonly queries: QueryRecord[],
    ) {}

    bind(...values: unknown[]) {
        this.bindings = values;
        return this;
    }

    async all<T>() {
        this.queries.push({ sql: this.sql, bindings: this.bindings, operation: "all" });
        return { results: [] as T[], success: true, meta: {} };
    }

    async first<T>(column?: string) {
        this.queries.push({ sql: this.sql, bindings: this.bindings, operation: "first" });
        if (column === "count") return 0 as T;
        return null;
    }

    async run() {
        this.queries.push({ sql: this.sql, bindings: this.bindings, operation: "run" });
        return { success: true, meta: { changes: 1 } };
    }
}

const makeHarness = () => {
    const queries: QueryRecord[] = [];
    const pending: Promise<unknown>[] = [];
    const db = {
        prepare: (sql: string) => new FakeStatement(sql, queries),
    } as unknown as D1Database;
    const env = {
        ADMIN_PASSWORDS: ["fixture-admin-password"],
        DEFAULT_DOMAINS: ["example.test"],
        DEFAULT_LANG: "en",
        DOMAINS: ["example.test"],
        JWT_SECRET: "fixture-jwt-secret",
        DB: db,
    } as unknown as Bindings;
    const executionContext = {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
        passThroughOnException: () => undefined,
    } as ExecutionContext;
    return { env, executionContext, pending, queries };
};

const request = (path: string, init: RequestInit = {}) => new Request(`https://worker.test${path}`, init);

describe("admin API route behavior baseline", () => {
    let harness: ReturnType<typeof makeHarness>;

    beforeEach(() => {
        harness = makeHarness();
    });

    it("rejects a canonical admin request without authentication", async () => {
        const response = await worker.fetch(
            request("/api/admin/mails?limit=10&offset=0"),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(401);
        expect(harness.queries.some((query) => /FROM raw_mails/i.test(query.sql))).toBe(false);
        await Promise.allSettled(harness.pending);
    });

    it("accepts both password and signed-session authentication on the canonical prefix", async () => {
        const passwordResponse = await worker.fetch(
            request("/api/admin/mails?limit=10&offset=0", {
                headers: { "x-admin-auth": "fixture-admin-password" },
            }),
            harness.env,
            harness.executionContext,
        );
        expect(passwordResponse.status).toBe(200);
        expect(await passwordResponse.json()).toMatchObject({ results: [], count: 0 });

        const session = await Jwt.sign({
            scope: "admin_session",
            username: "fixture-admin",
            exp: Math.floor(Date.now() / 1000) + 60,
        }, harness.env.JWT_SECRET, "HS256");
        const sessionResponse = await worker.fetch(
            request("/api/admin/mails?limit=10&offset=0", {
                headers: { "x-admin-auth": session },
            }),
            harness.env,
            harness.executionContext,
        );
        expect(sessionResponse.status).toBe(200);
        await Promise.allSettled(harness.pending);
    });

    it("runs a canonical destructive write against only the isolated D1 fake", async () => {
        const response = await worker.fetch(
            request("/api/admin/mails/7", {
                method: "DELETE",
                headers: { "x-admin-auth": "fixture-admin-password" },
            }),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(harness.queries).toEqual(expect.arrayContaining([
            expect.objectContaining({ sql: expect.stringMatching(/DELETE FROM mail_read_states/i), bindings: ["7"], operation: "run" }),
            expect.objectContaining({ sql: expect.stringMatching(/DELETE FROM raw_mails/i), bindings: ["7"], operation: "run" }),
        ]));
        await Promise.allSettled(harness.pending);
    });

    it("characterizes the legacy /admin prefix before its planned removal", async () => {
        const response = await worker.fetch(
            request("/admin/mails?limit=10&offset=0", {
                headers: { "x-admin-auth": "fixture-admin-password" },
            }),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ results: [], count: 0 });
        await Promise.allSettled(harness.pending);
    });
});
