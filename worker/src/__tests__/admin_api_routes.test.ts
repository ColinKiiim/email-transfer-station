import { beforeEach, describe, expect, it } from "vitest";

import { issueAdminSession } from "../admin_security";
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
        batch: (statements: FakeStatement[]) => Promise.all(statements.map((statement) => statement.run())),
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
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(harness.queries.some((query) => /FROM raw_mails/i.test(query.sql))).toBe(false);
        await Promise.allSettled(harness.pending);
    });

    it("rejects raw deployment passwords and incomplete legacy session tokens", async () => {
        const passwordResponse = await worker.fetch(
            request("/api/admin/mails?limit=10&offset=0", {
                headers: { "x-admin-auth": "fixture-admin-password" },
            }),
            harness.env,
            harness.executionContext,
        );
        expect(passwordResponse.status).toBe(401);

        const session = await issueAdminSession("fixture-admin", harness.env.JWT_SECRET);
        const sessionResponse = await worker.fetch(
            request("/api/admin/mails?limit=10&offset=0", {
                headers: { "x-admin-auth": session },
            }),
            harness.env,
            harness.executionContext,
        );
        expect(sessionResponse.status).toBe(200);
        expect(sessionResponse.headers.get("cache-control")).toBe("no-store");
        await Promise.allSettled(harness.pending);
    });

    it("rejects a destructive write without server-side confirmation", async () => {
        const session = await issueAdminSession("fixture-admin", harness.env.JWT_SECRET);
        const response = await worker.fetch(
            request("/api/admin/mails/7", {
                method: "DELETE",
                headers: { "x-admin-auth": session },
            }),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "admin_write_confirmation_required" });
        expect(harness.queries.some((query) => /DELETE FROM (mail_read_states|raw_mails)/i.test(query.sql))).toBe(false);
        await Promise.allSettled(harness.pending);
        const failedAudit = harness.queries.find((query) => (
            /INSERT INTO audit_events/i.test(query.sql) && query.bindings[3] === "admin.write"
        ));
        expect(failedAudit?.bindings[7]).toBe("failed");
    });

    it("runs a confirmed delete atomically and records an attributable request outcome", async () => {
        const session = await issueAdminSession("fixture-admin", harness.env.JWT_SECRET);
        const requestId = "12345678-1234-4123-8123-123456789abc";
        const response = await worker.fetch(
            request("/api/admin/mails/7", {
                method: "DELETE",
                headers: {
                    "content-type": "application/json",
                    "x-admin-auth": session,
                    "x-admin-request-id": requestId,
                },
                body: JSON.stringify({ confirm: true }),
            }),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-admin-request-id")).toBe(requestId);
        expect(await response.json()).toEqual({ success: true });
        expect(harness.queries).toEqual(expect.arrayContaining([
            expect.objectContaining({ sql: expect.stringMatching(/DELETE FROM mail_read_states/i), bindings: ["7"], operation: "run" }),
            expect.objectContaining({ sql: expect.stringMatching(/DELETE FROM raw_mails/i), bindings: ["7"], operation: "run" }),
        ]));
        await Promise.allSettled(harness.pending);
        const audit = harness.queries.find((query) => (
            /INSERT INTO audit_events/i.test(query.sql) && query.bindings[3] === "admin.write"
        ));
        expect(audit?.bindings).toEqual(expect.arrayContaining([
            "admin",
            "fixture-admin",
            "admin.write",
            "success",
            "DELETE",
            "/api/admin/mails/7",
        ]));
        expect(JSON.parse(String(audit?.bindings[13]))).toMatchObject({
            auth_method: "admin_session",
            request_id: requestId,
            http_status: 200,
        });
    });

    it("honors the authentication bypass only inside explicit E2E mode", async () => {
        harness.env.DISABLE_ADMIN_PASSWORD_CHECK = true;
        const denied = await worker.fetch(
            request("/api/admin/mails?limit=10&offset=0"),
            harness.env,
            harness.executionContext,
        );
        expect(denied.status).toBe(401);

        harness.env.E2E_TEST_MODE = true;
        const allowed = await worker.fetch(
            request("/api/admin/mails?limit=10&offset=0"),
            harness.env,
            harness.executionContext,
        );
        expect(allowed.status).toBe(200);
        await Promise.allSettled(harness.pending);
    });

    it("does not expose the retired root /admin API prefix", async () => {
        const response = await worker.fetch(
            request("/admin/mails?limit=10&offset=0", {
                headers: { "x-admin-auth": "fixture-admin-password" },
            }),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(404);
        await Promise.allSettled(harness.pending);
    });
});
