import { Context } from 'hono'

/**
 * Authority checks for address-scoped JWTs.
 *
 * These live outside `worker.ts` so that routes mounted outside the `/api/*`
 * auth middleware (currently the SMTP proxy's `/external/api/send_mail`) can
 * apply the same checks without importing the app module and creating an
 * import cycle.
 *
 * Verifying a signature only proves we issued the token. It does not prove the
 * credential is still current, nor that the token's scope permits the action.
 */

/** The address credential is current (not superseded by a rotation). */
export const validateAddressJwtPayload = async (
    c: Context<HonoCustomType>,
    payload: JwtPayload
): Promise<boolean> => {
    if (!payload?.address || !payload?.address_id) return false;
    const row = await c.env.DB.prepare(
        `SELECT name, COALESCE(credential_version, 1) AS credential_version`
        + ` FROM address WHERE id = ?`
    ).bind(payload.address_id).first<{ name: string, credential_version: number }>();
    if (!row || row.name !== payload.address) return false;
    const payloadVersion = Number(payload.credential_version ?? 1);
    return Number(row.credential_version || 1) === payloadVersion;
}

/** The share token still exists, is not revoked, and has not expired. */
export const validateShareJwtPayload = async (
    c: Context<HonoCustomType>,
    payload: JwtPayload
): Promise<boolean> => {
    if (!payload?.share_token_id || !payload?.address_id) return false;
    const row = await c.env.DB.prepare(
        `SELECT t.id`
        + ` FROM address_share_tokens t`
        + ` JOIN address a ON a.id = t.address_id`
        + ` WHERE t.id = ?`
        + ` AND t.address_id = ?`
        + ` AND a.name = ?`
        + ` AND t.revoked_at IS NULL`
        + ` AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))`
    ).bind(payload.share_token_id, payload.address_id, payload.address).first("id");
    return !!row;
}

export type SendAuthorization =
    | { ok: true, address: string }
    | { ok: false, reason: 'invalid' | 'read_only' }

/**
 * May this token send mail as its address?
 *
 * Share tokens are read-only by contract, so they are refused outright — the
 * `/api/*` middleware enforces the same rule via its allow-list, and this is
 * the equivalent for routes that bypass that middleware.
 */
export const authorizeAddressSend = async (
    c: Context<HonoCustomType>,
    payload: JwtPayload
): Promise<SendAuthorization> => {
    if (payload?.share_token_id) return { ok: false, reason: 'read_only' };
    if (!await validateAddressJwtPayload(c, payload)) return { ok: false, reason: 'invalid' };
    return { ok: true, address: payload.address as string };
}
