export const ADDRESS_PASSWORD_ITERATIONS = 600_000;

const LEGACY_SHA256_RE = /^[0-9a-f]{64}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MAX_PASSWORD_LENGTH = 100;
const SALT_BYTES = 16;
const DIGEST_BYTES = 32;
const SALT_BASE64URL_LENGTH = 22;
const DIGEST_BASE64URL_LENGTH = 43;

export type AddressPasswordMode = "plain" | "sha256";

export type AddressPasswordInput = {
    value: string;
    mode: AddressPasswordMode;
};

type ParsedRecord = {
    mode: AddressPasswordMode;
    salt: Uint8Array;
    digest: Uint8Array;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlToBytes = (value: string): Uint8Array | null => {
    if (!BASE64URL_RE.test(value)) return null;
    try {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/")
            + "=".repeat((4 - (value.length % 4)) % 4);
        return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    } catch {
        return null;
    }
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
    return difference === 0;
};

const hexToBytes = (value: string): Uint8Array => Uint8Array.from(
    value.match(/.{2}/g) || [],
    (pair) => Number.parseInt(pair, 16),
);

const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const derivePassword = async (
    value: string,
    salt: Uint8Array,
): Promise<Uint8Array> => {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(value),
        "PBKDF2",
        false,
        ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: ADDRESS_PASSWORD_ITERATIONS,
    }, key, DIGEST_BYTES * 8);
    return new Uint8Array(bits);
};

const createPbkdf2Record = async (input: AddressPasswordInput): Promise<string> => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const digest = await derivePassword(input.value, salt);
    return [
        "pbkdf2-sha256",
        ADDRESS_PASSWORD_ITERATIONS,
        input.mode,
        bytesToBase64Url(salt),
        bytesToBase64Url(digest),
    ].join("$");
};

const parsePbkdf2Record = (value: string): ParsedRecord | null => {
    const [algorithm, iterations, mode, encodedSalt, encodedDigest, extra] = value.split("$");
    if (extra !== undefined
        || algorithm !== "pbkdf2-sha256"
        || Number(iterations) !== ADDRESS_PASSWORD_ITERATIONS
        || (mode !== "plain" && mode !== "sha256")
        || encodedSalt?.length !== SALT_BASE64URL_LENGTH
        || encodedDigest?.length !== DIGEST_BASE64URL_LENGTH) {
        return null;
    }
    const salt = base64UrlToBytes(encodedSalt || "");
    const digest = base64UrlToBytes(encodedDigest || "");
    if (salt?.length !== SALT_BYTES || digest?.length !== DIGEST_BYTES) return null;
    return { mode, salt, digest };
};

export const normalizeAddressPasswordInput = (
    password: unknown,
    format?: unknown,
): AddressPasswordInput => {
    if (typeof password !== "string" || password.length < 1 || password.length > MAX_PASSWORD_LENGTH) {
        throw new Error("invalid password");
    }
    const normalizedFormat = typeof format === "string" ? format.toLowerCase() : "";
    const mode = normalizedFormat === ""
        ? (LEGACY_SHA256_RE.test(password.toLowerCase()) ? "sha256" : "plain")
        : normalizedFormat;
    if (mode !== "plain" && mode !== "sha256") throw new Error("invalid password format");
    if (mode === "sha256" && !LEGACY_SHA256_RE.test(password.toLowerCase())) {
        throw new Error("invalid sha256 password");
    }
    return { value: mode === "sha256" ? password.toLowerCase() : password, mode };
};

export const isAddressPasswordV2Enabled = (value: unknown): boolean => (
    value === true || value === "true"
);

export const createAddressPasswordRecord = async (
    input: AddressPasswordInput,
    v2Enabled: boolean,
): Promise<string> => {
    if (v2Enabled) return createPbkdf2Record(input);
    return input.mode === "plain" ? sha256Hex(input.value) : input.value;
};

export const inspectAddressPasswordRecord = (value: string): { mode: AddressPasswordMode } | null => {
    const record = parsePbkdf2Record(value);
    return record ? { mode: record.mode } : null;
};

export const verifyAddressPassword = async (
    storedPassword: unknown,
    input: AddressPasswordInput,
    upgradeEnabled: boolean,
): Promise<{
    valid: boolean;
    storedMode?: "legacy" | AddressPasswordMode;
    upgradedRecord?: string;
}> => {
    if (typeof storedPassword !== "string") return { valid: false };

    const normalizedStored = storedPassword.toLowerCase();
    if (LEGACY_SHA256_RE.test(normalizedStored)) {
        const candidate = input.mode === "plain" ? await sha256Hex(input.value) : input.value;
        const valid = constantTimeEqual(
            hexToBytes(normalizedStored),
            hexToBytes(candidate),
        );
        if (!valid) return { valid: false, storedMode: "legacy" };
        return {
            valid: true,
            storedMode: "legacy",
            upgradedRecord: upgradeEnabled ? await createPbkdf2Record(input) : undefined,
        };
    }

    const record = parsePbkdf2Record(storedPassword);
    if (!record) return { valid: false };
    if (record.mode === "plain" && input.mode !== "plain") {
        return { valid: false, storedMode: record.mode };
    }
    const material = record.mode === "sha256" && input.mode === "plain"
        ? await sha256Hex(input.value)
        : input.value;
    const digest = await derivePassword(material, record.salt);
    const valid = constantTimeEqual(record.digest, digest);
    if (!valid) return { valid: false, storedMode: record.mode };
    return {
        valid: true,
        storedMode: record.mode,
        upgradedRecord: upgradeEnabled && record.mode === "sha256" && input.mode === "plain"
            ? await createPbkdf2Record(input)
            : undefined,
    };
};
