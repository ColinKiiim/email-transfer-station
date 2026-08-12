import {
    createAddressPasswordRecord,
    inspectAddressPasswordRecord,
    normalizeAddressPasswordInput,
    verifyAddressPassword,
} from "./address_password";

const LEGACY_SHA256_RE = /^[0-9a-f]{64}$/i;

export const createUserPasswordRecord = async (password: string): Promise<string> => (
    createAddressPasswordRecord(normalizeAddressPasswordInput(password), true)
);

export const verifyUserPasswordRecord = async (
    storedPassword: unknown,
    password: string,
): Promise<{ valid: boolean; upgradedRecord?: string }> => {
    if (typeof storedPassword !== "string" || typeof password !== "string") return { valid: false };
    if (!LEGACY_SHA256_RE.test(storedPassword) && !inspectAddressPasswordRecord(storedPassword)) {
        if (storedPassword.startsWith("pbkdf2-") || storedPassword !== password) return { valid: false };
        return { valid: true, upgradedRecord: await createUserPasswordRecord(password) };
    }
    const result = await verifyAddressPassword(
        storedPassword,
        normalizeAddressPasswordInput(password),
        true,
    );
    return { valid: result.valid, upgradedRecord: result.upgradedRecord };
};
