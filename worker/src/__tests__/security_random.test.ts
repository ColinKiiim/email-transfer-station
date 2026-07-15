import { describe, expect, it, vi } from "vitest";

import { secureRandomInt, secureRandomString } from "../security_random";

describe("security random helpers", () => {
    it("uses Web Crypto and keeps integers inside the requested range", () => {
        const randomSpy = vi.spyOn(globalThis.crypto, "getRandomValues");
        const values = Array.from({ length: 64 }, () => secureRandomInt(17));

        expect(randomSpy).toHaveBeenCalled();
        expect(values.every((value) => value >= 0 && value < 17)).toBe(true);
        randomSpy.mockRestore();
    });

    it("generates only characters from the explicit alphabet", () => {
        const value = secureRandomString(64, "ab");
        expect(value).toHaveLength(64);
        expect(value).toMatch(/^[ab]+$/);
    });

    it("rejects invalid ranges and alphabets", () => {
        expect(() => secureRandomInt(0)).toThrow(RangeError);
        expect(() => secureRandomInt(0x1_0000_0001)).toThrow(RangeError);
        expect(() => secureRandomString(0, "ab")).toThrow(RangeError);
        expect(() => secureRandomString(8, "a")).toThrow(RangeError);
    });
});
