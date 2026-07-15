import { describe, expect, it } from "vitest";

import worker from "../worker";

const db = {
    prepare: () => ({
        all: async () => ({ results: [], success: true, meta: {} }),
    }),
} as unknown as D1Database;

const baseEnv = {
    DB: db,
    DEFAULT_DOMAINS: ["example.test"],
    DEFAULT_LANG: "en",
    DOMAINS: ["example.test"],
    JWT_SECRET: "fixture-jwt-secret",
} as unknown as Bindings;

const executionContext = {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

const call = (request: Request, env: Partial<Bindings> = {}) => worker.fetch(
    request,
    { ...baseEnv, ...env } as Bindings,
    executionContext,
);

const preflight = (
    origin: string,
    requestedMethod = "POST",
    requestedHeaders = "content-type, x-lang",
) => new Request("https://worker.test/api/address_login", {
    method: "OPTIONS",
    headers: {
        "Origin": origin,
        "Access-Control-Request-Method": requestedMethod,
        "Access-Control-Request-Headers": requestedHeaders,
    },
});

describe("explicit CORS policy", () => {
    it.each([
        ["request origin", "https://worker.test", {}],
        ["FRONTEND_URL", "https://frontend.example", { FRONTEND_URL: "https://frontend.example/admin" }],
        ["configured origin", "https://client.example", {
            CORS_ALLOWED_ORIGINS: '["https://client.example"]',
        }],
    ])("allows %s preflight with an exact origin", async (_label, origin, env) => {
        const response = await call(preflight(origin), env);

        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
        expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
        expect(response.headers.get("Access-Control-Allow-Methods"))
            .toBe("GET, HEAD, POST, PATCH, DELETE");
        expect(response.headers.get("Access-Control-Allow-Headers"))
            .toContain("x-admin-auth");
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
        expect(response.headers.get("Vary"))
            .toBe("Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    });

    it.each([
        "https://unknown.example",
        "null",
        "file://local",
        "https://worker.test/unexpected-path",
    ])("rejects untrusted or malformed origin %s", async (origin) => {
        const response = await call(preflight(origin));

        expect(response.status).toBe(403);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("does not accept a configured wildcard", async () => {
        const response = await call(preflight("https://unknown.example"), {
            CORS_ALLOWED_ORIGINS: ["*"],
        });

        expect(response.status).toBe(403);
    });

    it.each([
        ["unknown method", preflight("https://worker.test", "PUT")],
        ["unknown header", preflight("https://worker.test", "POST", "content-type, x-e2e-test-secret")],
    ])("rejects %s preflight", async (_label, request) => {
        const response = await call(request);

        expect(response.status).toBe(403);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("adds an exact origin to an allowed browser response", async () => {
        const response = await call(new Request("https://worker.test/health_check", {
            headers: { Origin: "https://client.example" },
        }), { CORS_ALLOWED_ORIGINS: ["https://client.example"] });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("OK");
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://client.example");
        expect(response.headers.get("Vary")).toContain("Origin");
    });

    it("rejects a disallowed browser request before route behavior", async () => {
        const response = await call(new Request("https://worker.test/health_check", {
            headers: { Origin: "https://unknown.example" },
        }), { DB: undefined });

        expect(response.status).toBe(403);
        expect(await response.text()).toBe("CORS request denied");
    });

    it("preserves no-Origin non-browser clients without CORS headers", async () => {
        const response = await call(new Request("https://worker.test/health_check", {
            headers: {
                Authorization: "Bearer non-browser-fixture",
                "x-custom-auth": "non-browser-fixture",
            },
        }));

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("OK");
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
});
