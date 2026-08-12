export const buildInboundDedupKey = async (
    address: string,
    messageId: string | null,
    rawEmail: string,
): Promise<string> => {
    const normalizedMessageId = messageId?.trim();
    if (normalizedMessageId) return `message-id:${normalizedMessageId}`;
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${address}\0${rawEmail}`),
    );
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export const reserveInboundDelivery = async (
    db: D1Database,
    address: string,
    dedupKey: string,
): Promise<boolean> => {
    const result = await db.prepare(
        `INSERT OR IGNORE INTO inbound_mail_receipts (address, dedup_key) VALUES (?, ?)`
    ).bind(address, dedupKey).run();
    return result.success && Number(result.meta?.changes || 0) === 1;
};

export const releaseInboundDelivery = async (
    db: D1Database,
    address: string,
    dedupKey: string,
): Promise<void> => {
    await db.prepare(
        `DELETE FROM inbound_mail_receipts WHERE address = ? AND dedup_key = ?`
    ).bind(address, dedupKey).run();
};
