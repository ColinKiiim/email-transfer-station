import type { Context } from "hono";

export const CORS_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE"] as const;
export const CORS_ALLOWED_HEADERS = [
    "Authorization",
    "Content-Type",
    "x-admin-auth",
    "x-admin-request-id",
    "x-custom-auth",
    "x-fingerprint",
    "x-lang",
    "x-user-access-token",
    "x-user-token",
] as const;

const ALLOWED_METHODS = new Set<string>(CORS_ALLOWED_METHODS);
const ALLOWED_HEADERS = new Set(CORS_ALLOWED_HEADERS.map((header) => header.toLowerCase()));
const PREFLIGHT_VARY = "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
const PREFLIGHT_MAX_AGE_SECONDS = 600;

const toHttpOrigin = (value: unknown, allowPath: boolean): string | null => {
    if (typeof value !== "string" || !value.trim() || value === "null") return null;
    try {
        const url = new URL(value.trim());
        if ((url.protocol !== "http:" && url.protocol !== "https:")
            || url.username
            || url.password
            || (!allowPath && (url.pathname !== "/" || url.search || url.hash))) {
            return null;
        }
        return url.origin;
    } catch {
        return null;
    }
};

const getConfiguredOrigins = (value: unknown): string[] => {
    let entries: unknown = value;
    if (typeof value === "string") {
        try {
            entries = JSON.parse(value);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => toHttpOrigin(entry, false))
        .filter((entry): entry is string => entry !== null);
};

const resolveAllowedOrigin = (
    originHeader: string,
    requestUrl: string,
    env: Bindings,
): string | null => {
    const origin = toHttpOrigin(originHeader, false);
    if (!origin) return null;

    const allowed = new Set<string>();
    const requestOrigin = toHttpOrigin(requestUrl, true);
    const frontendOrigin = toHttpOrigin(env.FRONTEND_URL, true);
    if (requestOrigin) allowed.add(requestOrigin);
    if (frontendOrigin) allowed.add(frontendOrigin);
    for (const configuredOrigin of getConfiguredOrigins(env.CORS_ALLOWED_ORIGINS)) {
        allowed.add(configuredOrigin);
    }
    return allowed.has(origin) ? origin : null;
};

const requestedHeadersAreAllowed = (value: string | undefined): boolean => {
    if (!value) return true;
    return value.split(",").every((header) => {
        const normalized = header.trim().toLowerCase();
        return normalized.length > 0 && ALLOWED_HEADERS.has(normalized);
    });
};

const deniedResponse = (preflight: boolean): Response => new Response("CORS request denied", {
    status: 403,
    headers: {
        "Content-Type": "text/plain; charset=UTF-8",
        "Vary": preflight ? PREFLIGHT_VARY : "Origin",
    },
});

export const corsPolicy = async (
    c: Context<HonoCustomType>,
    next: () => Promise<void>,
): Promise<Response | void> => {
    const originHeader = c.req.raw.headers.get("Origin");
    if (!originHeader) {
        await next();
        return;
    }

    const preflight = c.req.method.toUpperCase() === "OPTIONS";
    const allowedOrigin = resolveAllowedOrigin(originHeader, c.req.url, c.env);
    if (!allowedOrigin) return deniedResponse(preflight);

    if (preflight) {
        const requestedMethod = c.req.raw.headers.get("Access-Control-Request-Method")?.toUpperCase();
        const requestedHeaders = c.req.raw.headers.get("Access-Control-Request-Headers") || undefined;
        if (!requestedMethod
            || !ALLOWED_METHODS.has(requestedMethod)
            || !requestedHeadersAreAllowed(requestedHeaders)) {
            return deniedResponse(true);
        }
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": allowedOrigin,
                "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS.join(", "),
                "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS.join(", "),
                "Access-Control-Max-Age": String(PREFLIGHT_MAX_AGE_SECONDS),
                "Vary": PREFLIGHT_VARY,
            },
        });
    }

    if (!ALLOWED_METHODS.has(c.req.method.toUpperCase())) return deniedResponse(false);
    await next();
    c.header("Access-Control-Allow-Origin", allowedOrigin);
    c.header("Vary", "Origin", { append: true });
};
