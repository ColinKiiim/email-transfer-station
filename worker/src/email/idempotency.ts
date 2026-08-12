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

export const saveInboundDelivery = async (
    db: D1Database,
    address: string,
    dedupKey: string,
    mailInsert: D1PreparedStatement,
): Promise<{ success: boolean, duplicate: boolean, mailId: number | null }> => {
    try {
        const [, saved] = await db.batch([
            db.prepare(
                `INSERT INTO inbound_mail_receipts (address, dedup_key) VALUES (?, ?)`
            ).bind(address, dedupKey),
            mailInsert,
        ]);
        return {
            success: saved.success,
            duplicate: false,
            mailId: Number(saved.meta?.last_row_id) || null,
        };
    } catch (error) {
        if (String(error).includes("inbound_mail_receipts.address, inbound_mail_receipts.dedup_key")) {
            return { success: true, duplicate: true, mailId: null };
        }
        throw error;
    }
};
