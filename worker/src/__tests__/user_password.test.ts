import { describe, expect, it } from "vitest";

import { createUserPasswordRecord, verifyUserPasswordRecord } from "../user_password";

describe("user password storage", () => {
    it("stores a slow salted verifier and upgrades both legacy formats", async () => {
        const clientVerifier = "a".repeat(64);
        const first = await createUserPasswordRecord(clientVerifier);
        const second = await createUserPasswordRecord(clientVerifier);

        expect(first).not.toBe(second);
        expect(first).toMatch(/^pbkdf2-sha256\$600000\$sha256\$/);
        await expect(verifyUserPasswordRecord(first, clientVerifier)).resolves.toMatchObject({ valid: true });
        await expect(verifyUserPasswordRecord(first, "b".repeat(64))).resolves.toEqual({ valid: false });

        const digestUpgrade = await verifyUserPasswordRecord(clientVerifier, clientVerifier);
        expect(digestUpgrade.valid).toBe(true);
        expect(digestUpgrade.upgradedRecord).toMatch(/^pbkdf2-sha256\$/);

        const rawUpgrade = await verifyUserPasswordRecord("legacy-client-value", "legacy-client-value");
        expect(rawUpgrade.valid).toBe(true);
        expect(rawUpgrade.upgradedRecord).toMatch(/^pbkdf2-sha256\$/);
    }, 30_000);
});
