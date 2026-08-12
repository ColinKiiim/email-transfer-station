const encoder = new TextEncoder();

const sha256 = async (value: string): Promise<Uint8Array> => new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value))
);

const toHex = (value: Uint8Array): string => Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const deriveTelegramWebhookSecret = async (botToken: string): Promise<string> => (
    toHex(await sha256(botToken))
);

export const verifyTelegramWebhookSecret = async (
    botToken: string,
    suppliedSecret: string | undefined
): Promise<boolean> => {
    if (!suppliedSecret) return false;
    const expectedSecret = await deriveTelegramWebhookSecret(botToken);
    const [expectedHash, suppliedHash] = await Promise.all([
        sha256(expectedSecret),
        sha256(suppliedSecret),
    ]);
    let mismatch = 0;
    for (let index = 0; index < expectedHash.length; index += 1) {
        mismatch |= expectedHash[index] ^ suppliedHash[index];
    }
    return mismatch === 0;
};

export const isPrivateTelegramIdentity = (
    chatType: string | undefined,
    fromId: number | undefined,
    chatId: number | undefined
): boolean => chatType === "private" && fromId !== undefined && fromId === chatId;
