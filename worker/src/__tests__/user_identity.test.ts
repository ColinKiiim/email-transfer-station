import { Context } from "hono";
import { Jwt } from "hono/utils/jwt";
import { describe, expect, it } from "vitest";

import { issueUserJwt, rotateUserAuthGeneration, validateUserJwtPayload } from "../user_identity";

const SECRET = "fixture-user-secret";

const harness = () => {
    const row = {
        user_email: "owner@example.test",
        user_info: JSON.stringify({ display: "Owner" }),
    };
    const db = {
        prepare: (sql: string) => {
            let bindings: unknown[] = [];
            return {
                bind(...values: unknown[]) {
                    bindings = values;
                    return this;
                },
                first: async () => (/SELECT user_email, user_info FROM users/i.test(sql) ? { ...row } : null),
                run: async () => {
                    if (/UPDATE users SET user_info/i.test(sql)) row.user_info = String(bindings[0]);
                    return { success: true, meta: { changes: 1 } };
                },
            };
        },
    } as unknown as D1Database;
    const c = { env: { DB: db, JWT_SECRET: SECRET } as Bindings } as Context<HonoCustomType>;
    return { c, row };
};

describe("user identity generation", () => {
    it("binds issued JWTs to the current account incarnation", async () => {
        const { c, row } = harness();
        const token = await issueUserJwt(c, 7, row.user_email);
        const payload = await Jwt.verify(token, SECRET, "HS256") as UserPayload;

        expect(payload.user_generation).toMatch(/^[0-9a-f-]{36}$/);
        await expect(validateUserJwtPayload(c, payload)).resolves.toBe(true);

        row.user_info = rotateUserAuthGeneration(row.user_info, "replacement-generation");
        await expect(validateUserJwtPayload(c, payload)).resolves.toBe(false);
    });

    it("rejects legacy tokens without a generation", async () => {
        const { c, row } = harness();
        await expect(validateUserJwtPayload(c, {
            user_id: 7,
            user_email: row.user_email,
        })).resolves.toBe(false);
    });
});
