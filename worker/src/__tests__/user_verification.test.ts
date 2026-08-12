import { describe, expect, it } from "vitest";

import {
    consumeUserVerificationChallenge,
    reserveUserVerificationChallenge,
} from "../user_verification";

const makeDb = () => {
    let codeHash = "";
    let live = false;
    let consumed = false;
    return {
        prepare: (sql: string) => ({
            bind: (...args: unknown[]) => ({
                run: async () => {
                    if (sql.startsWith("INSERT")) {
                        if (live && !consumed) return { success: true, meta: { changes: 0 } };
                        codeHash = String(args[2]);
                        live = true;
                        consumed = false;
                        return { success: true, meta: { changes: 1 } };
                    }
                    if (sql.startsWith("UPDATE")) {
                        if (!live || consumed || String(args[2]) !== codeHash) {
                            return { success: true, meta: { changes: 0 } };
                        }
                        consumed = true;
                        return { success: true, meta: { changes: 1 } };
                    }
                    return { success: true, meta: { changes: 0 } };
                },
            }),
        }),
    } as unknown as D1Database;
};

describe("user verification challenge authority", () => {
    it("allows one live generation and consumes it exactly once", async () => {
        const db = makeDb();
        expect(await reserveUserVerificationChallenge(db, "user@example.test", "123456")).toBe(true);
        expect(await reserveUserVerificationChallenge(db, "user@example.test", "654321")).toBe(false);
        expect(await consumeUserVerificationChallenge(db, "user@example.test", "123456")).toBe(true);
        expect(await consumeUserVerificationChallenge(db, "user@example.test", "123456")).toBe(false);
    });
});
