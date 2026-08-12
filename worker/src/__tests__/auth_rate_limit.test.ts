import { describe, expect, it } from "vitest";

import { consumeAuthRateLimit, getAuthRateLimitKeys } from "../auth_rate_limit";

describe("authentication rate-limit keys", () => {
    it("shares an IP bucket while isolating account buckets without storing identifiers", async () => {
        const first = await getAuthRateLimitKeys(
            "/user_api/login",
            "192.0.2.1",
            { email: "First@Example.test" },
            new URL("https://mail.example.test/user_api/login"),
        );
        const second = await getAuthRateLimitKeys(
            "/user_api/login",
            "192.0.2.1",
            { email: "second@example.test" },
            new URL("https://mail.example.test/user_api/login"),
        );

        expect(first[0]).toBe(second[0]);
        expect(first[1]).not.toBe(second[1]);
        expect(first.join(" ")).not.toContain("example.test");
    });

    it("blocks the eleventh attempt in a fixed window", async () => {
        let attempts = 0;
        const db = {
            prepare: () => ({
                bind: () => ({ first: async () => ++attempts }),
            }),
        } as unknown as D1Database;

        for (let index = 0; index < 10; index++) {
            expect(await consumeAuthRateLimit(db, "auth:test")).toBe(true);
        }
        expect(await consumeAuthRateLimit(db, "auth:test")).toBe(false);
    });
});
