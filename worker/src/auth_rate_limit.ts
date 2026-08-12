import { Context } from "hono";

const AUTH_PATHS = new Set([
    "/api/address_login",
    "/open_api/admin_login",
    "/open_api/credential_login",
    "/open_api/site_login",
    "/user_api/login",
    "/user_api/oauth2/callback",
    "/user_api/oauth2/login_url",
    "/user_api/passkey/authenticate_request",
    "/user_api/passkey/authenticate_response",
]);

const hashKey = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const accountHint = (body: Record<string, any>, url: URL): string => String(
    body.email
    || body.username
    || body.credential?.id
    || body.credential
    || body.clientID
    || url.searchParams.get("clientID")
    || "anonymous"
).trim().toLowerCase();

export const getAuthRateLimitKeys = async (
    path: string,
    ip: string,
    body: Record<string, any>,
    url: URL,
): Promise<string[]> => [
    `auth:ip:${await hashKey(ip || "unknown")}`,
    `auth:account:${path}:${await hashKey(accountHint(body, url))}`,
];

export const consumeAuthRateLimit = async (db: D1Database, key: string): Promise<boolean> => {
    const row = await db.prepare(
        `INSERT INTO auth_rate_limits (key, attempts, window_started_at, updated_at)`
        + ` VALUES (?, 1, datetime('now'), datetime('now'))`
        + ` ON CONFLICT(key) DO UPDATE SET`
        + ` attempts = CASE WHEN window_started_at <= datetime('now', '-300 seconds') THEN 1 ELSE attempts + 1 END,`
        + ` window_started_at = CASE WHEN window_started_at <= datetime('now', '-300 seconds') THEN datetime('now') ELSE window_started_at END,`
        + ` updated_at = datetime('now')`
        + ` RETURNING attempts`
    ).bind(key).first<number>("attempts");
    return Number(row || 0) <= 10;
};

export const enforceAuthRateLimit = async (
    c: Context<HonoCustomType>,
): Promise<Response | null> => {
    if (!AUTH_PATHS.has(c.req.path)) return null;
    let body = {} as Record<string, any>;
    try {
        if (c.req.method !== "GET") body = await c.req.raw.clone().json();
    } catch {
        // Invalid JSON is still one authentication attempt.
    }
    const url = new URL(c.req.raw.url);
    const keys = await getAuthRateLimitKeys(
        c.req.path,
        c.req.raw.headers.get("cf-connecting-ip") || "",
        body,
        url,
    );
    // ponytail: fixed windows count successes too; add outcome-aware backoff only
    // if legitimate users measurably hit ten authentications in five minutes.
    for (const key of keys) {
        if (!await consumeAuthRateLimit(c.env.DB, key)) {
            c.header("Retry-After", "300");
            return c.text("Too many authentication attempts", 429);
        }
    }
    return null;
};
