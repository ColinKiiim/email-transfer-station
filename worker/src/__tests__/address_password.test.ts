import { describe, expect, it } from "vitest";

import {
    ADDRESS_PASSWORD_ITERATIONS,
    createAddressPasswordRecord,
    inspectAddressPasswordRecord,
    normalizeAddressPasswordInput,
    verifyAddressPassword,
} from "../address_password";

describe("address password migration", () => {
    it("normalizes explicit plaintext and inferred legacy clients", () => {
        expect(normalizeAddressPasswordInput("a".repeat(64), "plain")).toEqual({
            value: "a".repeat(64),
            mode: "plain",
        });
        expect(normalizeAddressPasswordInput("A".repeat(64))).toEqual({
            value: "a".repeat(64),
            mode: "sha256",
        });
        expect(() => normalizeAddressPasswordInput("not-a-digest", "sha256")).toThrow();
        expect(() => normalizeAddressPasswordInput("password", "unknown")).toThrow();
    });

    it("keeps gate-off writes compatible with the legacy SHA-256 column", async () => {
        const input = normalizeAddressPasswordInput("correct horse", "plain");
        const stored = await createAddressPasswordRecord(input, false);

        expect(stored).toMatch(/^[0-9a-f]{64}$/);
        await expect(verifyAddressPassword(stored, input, false)).resolves.toMatchObject({
            valid: true,
            storedMode: "legacy",
        });
    });

    it("uses versioned salted PBKDF2 records when the gate is on", async () => {
        const input = normalizeAddressPasswordInput("correct horse", "plain");
        const first = await createAddressPasswordRecord(input, true);
        const second = await createAddressPasswordRecord(input, true);

        expect(first).not.toBe(second);
        expect(first).toMatch(new RegExp(`^pbkdf2-sha256\\$${ADDRESS_PASSWORD_ITERATIONS}\\$plain\\$`));
        expect(inspectAddressPasswordRecord(first)).toEqual({ mode: "plain" });
    }, 15_000);

    it("upgrades a legacy record directly after a plaintext login", async () => {
        const input = normalizeAddressPasswordInput("upgrade-me", "plain");
        const legacy = await createAddressPasswordRecord(input, false);
        const result = await verifyAddressPassword(legacy, input, true);

        expect(result.valid).toBe(true);
        expect(inspectAddressPasswordRecord(result.upgradedRecord || "")).toEqual({ mode: "plain" });
        await expect(verifyAddressPassword(result.upgradedRecord, input, false))
            .resolves.toMatchObject({ valid: true, storedMode: "plain" });

        const replayValue = normalizeAddressPasswordInput(legacy, "sha256");
        await expect(verifyAddressPassword(result.upgradedRecord, replayValue, false))
            .resolves.toMatchObject({ valid: false, storedMode: "plain" });
    }, 15_000);

    it("wraps a legacy caller, then upgrades it after a plaintext login", async () => {
        const plain = normalizeAddressPasswordInput("eventual-plaintext", "plain");
        const legacyDigest = await createAddressPasswordRecord(plain, false);
        const legacyInput = normalizeAddressPasswordInput(legacyDigest, "sha256");
        const transitional = await createAddressPasswordRecord(legacyInput, true);

        expect(inspectAddressPasswordRecord(transitional)).toEqual({ mode: "sha256" });
        await expect(verifyAddressPassword(transitional, legacyInput, false))
            .resolves.toMatchObject({ valid: true, storedMode: "sha256" });

        const plaintextResult = await verifyAddressPassword(transitional, plain, true);
        expect(plaintextResult.valid).toBe(true);
        expect(inspectAddressPasswordRecord(plaintextResult.upgradedRecord || ""))
            .toEqual({ mode: "plain" });
    }, 15_000);

    it("fails closed for wrong credentials and malformed records", async () => {
        const input = normalizeAddressPasswordInput("right-password", "plain");
        const stored = await createAddressPasswordRecord(input, true);
        const wrong = normalizeAddressPasswordInput("wrong-password", "plain");

        await expect(verifyAddressPassword(stored, wrong, true)).resolves.toMatchObject({ valid: false });
        await expect(verifyAddressPassword("pbkdf2-sha256$1$plain$bad$bad", input, true))
            .resolves.toEqual({ valid: false });
        await expect(verifyAddressPassword(
            `pbkdf2-sha256$${ADDRESS_PASSWORD_ITERATIONS}$plain$${"A".repeat(1_000)}$${"A".repeat(43)}`,
            input,
            true,
        )).resolves.toEqual({ valid: false });
    }, 15_000);
});
