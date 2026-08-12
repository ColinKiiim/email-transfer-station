import { beforeEach, describe, expect, it } from "vitest";

import {
    createAddressPasswordRecord,
    inspectAddressPasswordRecord,
    normalizeAddressPasswordInput,
} from "../address_password";
import worker from "../worker";

type QueryRecord = {
    sql: string;
    bindings: unknown[];
    operation: "first" | "run";
};

const makeHarness = (initialPassword: string) => {
    const state = { password: initialPassword };
    const queries: QueryRecord[] = [];
    const db = {
        prepare: (sql: string) => {
            let bindings: unknown[] = [];
            const statement = {
                bind: (...values: unknown[]) => {
                    bindings = values;
                    return statement;
                },
                first: async () => {
                    queries.push({ sql, bindings, operation: "first" });
                    if (/SELECT \* FROM address WHERE name/i.test(sql)) {
                        return {
                            id: 7,
                            name: "mailbox@example.test",
                            password: state.password,
                            credential_version: 1,
                        };
                    }
                    return null;
                },
                run: async () => {
                    queries.push({ sql, bindings, operation: "run" });
                    let changes = 1;
                    if (/UPDATE address SET password/i.test(sql) && /AND password = \?/i.test(sql)) {
                        if (bindings[2] === state.password) state.password = String(bindings[0]);
                        else changes = 0;
                    }
                    return { success: true, meta: { changes } };
                },
            };
            return statement;
        },
    } as unknown as D1Database;
    const env = {
        DB: db,
        DEFAULT_LANG: "en",
        ENABLE_ADDRESS_PASSWORD: true,
        ENABLE_ADDRESS_PASSWORD_V2: true,
        JWT_SECRET: "fixture-jwt-secret",
    } as unknown as Bindings;
    const pending: Promise<unknown>[] = [];
    const executionContext = {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
        passThroughOnException: () => undefined,
    } as unknown as ExecutionContext;
    return { state, queries, env, executionContext, pending };
};

const loginRequest = (password: string, passwordFormat?: string) => new Request(
    "https://worker.test/api/address_login",
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: "mailbox@example.test",
            password,
            ...(passwordFormat ? { password_format: passwordFormat } : {}),
        }),
    },
);

describe("address password route migration", () => {
    let legacyPassword: string;

    beforeEach(async () => {
        legacyPassword = await createAddressPasswordRecord(
            normalizeAddressPasswordInput("route-password", "plain"),
            false,
        );
    });

    it("upgrades a legacy row only after a successful plaintext login", async () => {
        const harness = makeHarness(legacyPassword);
        const response = await worker.fetch(
            loginRequest("route-password", "plain"),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(200);
        expect(inspectAddressPasswordRecord(harness.state.password)).toEqual({ mode: "plain" });
        expect(harness.queries.filter((query) => /UPDATE address SET password/i.test(query.sql)))
            .toHaveLength(1);
        expect(harness.queries.flatMap((query) => query.bindings)).not.toContain("route-password");
        await Promise.allSettled(harness.pending);
    });

    it("does not write after a failed login", async () => {
        const harness = makeHarness(legacyPassword);
        const response = await worker.fetch(
            loginRequest("wrong-password", "plain"),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(401);
        expect(harness.state.password).toBe(legacyPassword);
        expect(harness.queries.some((query) => /UPDATE address SET password/i.test(query.sql))).toBe(false);
        await Promise.allSettled(harness.pending);
    });

    it("wraps an inferred legacy browser digest without logging the digest", async () => {
        const harness = makeHarness(legacyPassword);
        const response = await worker.fetch(
            loginRequest(legacyPassword),
            harness.env,
            harness.executionContext,
        );

        expect(response.status).toBe(200);
        expect(inspectAddressPasswordRecord(harness.state.password)).toEqual({ mode: "sha256" });
        const auditBindings = harness.queries
            .filter((query) => /INSERT INTO (audit|access)_events/i.test(query.sql))
            .flatMap((query) => query.bindings);
        expect(auditBindings).not.toContain(legacyPassword);
        await Promise.allSettled(harness.pending);
    });
});
