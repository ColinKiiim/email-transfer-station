const PURPOSE = "register-or-reset";

const hashChallenge = async (email: string, code: string): Promise<string> => {
    const bytes = new TextEncoder().encode(`${PURPOSE}\0${email}\0${code}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const reserveUserVerificationChallenge = async (
    db: D1Database,
    email: string,
    code: string,
): Promise<boolean> => {
    const codeHash = await hashChallenge(email, code);
    const result = await db.prepare(
        `INSERT INTO user_verification_challenges (email, purpose, code_hash, expires_at)`
        + ` VALUES (?, ?, ?, datetime('now', '+300 seconds'))`
        + ` ON CONFLICT(email, purpose) DO UPDATE SET`
        + ` code_hash = excluded.code_hash, expires_at = excluded.expires_at,`
        + ` consumed_at = NULL, updated_at = datetime('now')`
        + ` WHERE user_verification_challenges.consumed_at IS NOT NULL`
        + ` OR user_verification_challenges.expires_at <= datetime('now')`
    ).bind(email, PURPOSE, codeHash).run();
    return result.success && Number(result.meta?.changes || 0) === 1;
};

export const releaseUserVerificationChallenge = async (
    db: D1Database,
    email: string,
    code: string,
): Promise<void> => {
    const codeHash = await hashChallenge(email, code);
    await db.prepare(
        `DELETE FROM user_verification_challenges`
        + ` WHERE email = ? AND purpose = ? AND code_hash = ? AND consumed_at IS NULL`
    ).bind(email, PURPOSE, codeHash).run();
};

export const consumeUserVerificationChallenge = async (
    db: D1Database,
    email: string,
    code: string,
): Promise<boolean> => {
    const codeHash = await hashChallenge(email, code);
    const result = await db.prepare(
        `UPDATE user_verification_challenges SET consumed_at = datetime('now'), updated_at = datetime('now')`
        + ` WHERE email = ? AND purpose = ? AND code_hash = ?`
        + ` AND consumed_at IS NULL AND expires_at > datetime('now')`
    ).bind(email, PURPOSE, codeHash).run();
    return result.success && Number(result.meta?.changes || 0) === 1;
};
