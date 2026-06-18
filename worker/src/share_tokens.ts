import { Context } from "hono";
import { Jwt } from "hono/utils/jwt";

const DEFAULT_SHARE_SESSION_SECONDS = 2 * 60 * 60;
const TOKEN_BYTE_LENGTH = 32;

export type AddressShareTokenRow = {
    id: number,
    address_id: number,
    token_hash: string,
    label?: string | null,
    scopes?: string | null,
    expires_at?: string | null,
    revoked_at?: string | null,
    last_used_at?: string | null,
    created_at?: string | null,
    address?: string | null,
}

const base64UrlEncode = (bytes: Uint8Array): string => {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

export const generateShareToken = (): string => {
    const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

export const hashShareToken = async (token: string): Promise<string> => {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token)
    );
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export const normalizeShareScopes = (scopes: unknown): string => {
    if (Array.isArray(scopes)) {
        return scopes
            .map((scope) => typeof scope === "string" ? scope.trim() : "")
            .filter((scope) => scope.length > 0)
            .join(",");
    }
    if (typeof scopes === "string") {
        return scopes.split(",")
            .map((scope) => scope.trim())
            .filter((scope) => scope.length > 0)
            .join(",");
    }
    return "read";
}

export const findActiveShareToken = async (
    c: Context<HonoCustomType>,
    token: string
): Promise<AddressShareTokenRow | null> => {
    const tokenHash = await hashShareToken(token);
    return await c.env.DB.prepare(
        `SELECT t.*, a.name AS address`
        + ` FROM address_share_tokens t`
        + ` JOIN address a ON a.id = t.address_id`
        + ` WHERE t.token_hash = ?`
        + ` AND t.revoked_at IS NULL`
        + ` AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))`
    ).bind(tokenHash).first<AddressShareTokenRow>();
}

export const issueAddressJwtForShareToken = async (
    c: Context<HonoCustomType>,
    row: AddressShareTokenRow
): Promise<string> => {
    if (!row.address) {
        throw new Error("Share token is not linked to an address");
    }
    const now = Math.floor(Date.now() / 1000);
    return await Jwt.sign({
        address: row.address,
        address_id: row.address_id,
        share_token_id: row.id,
        share_scope: row.scopes || "read",
        iat: now,
        exp: now + DEFAULT_SHARE_SESSION_SECONDS,
    }, c.env.JWT_SECRET, "HS256");
}
