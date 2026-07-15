import type { Context } from "hono";
import { Jwt } from "hono/utils/jwt";

import { queueAccessEvent, queueAuditEvent } from "./audit";
import i18n from "./i18n";
import { getBooleanValue } from "./utils";

export const ADMIN_SESSION_ISSUER = "email-transfer-station";
export const ADMIN_SESSION_AUDIENCE = "admin-api";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFIRMED_POST_PATHS = [
    /^\/api\/admin\/address\/[^/]+\/credential$/,
    /^\/api\/admin\/address\/[^/]+\/(?:reset_password|rotate_credential)$/,
    /^\/api\/admin\/users\/[^/]+\/reset_password$/,
    /^\/api\/admin\/cleanup$/,
    /^\/api\/admin\/db_(?:initialize|migration)$/,
    /^\/api\/admin\/domains\/[^/]+\/(?:verify\/start|cloudflare\/setup)$/,
    /^\/api\/admin\/mail_webhook\/test$/,
    /^\/api\/admin\/telegram\/init$/,
];

type AdminAuthResolution = {
    actor?: AdminActor;
    failureReason?: string;
    failureMessage?: string;
    deniedActorType?: string;
    deniedActorId?: string | number | null;
    deniedActorLabel?: string | null;
};

export const isE2eAdminBypassEnabled = (env: Bindings): boolean => (
    getBooleanValue(env.DISABLE_ADMIN_PASSWORD_CHECK) && getBooleanValue(env.E2E_TEST_MODE)
);

const isNumericDate = (value: unknown): value is number => (
    typeof value === "number" && Number.isFinite(value)
);

export const issueAdminSession = async (
    username: string,
    secret: string,
    now = Math.floor(Date.now() / 1000),
): Promise<string> => Jwt.sign({
    iss: ADMIN_SESSION_ISSUER,
    aud: ADMIN_SESSION_AUDIENCE,
    sub: username,
    scope: "admin_session",
    username,
    iat: now,
    nbf: now,
    exp: now + ADMIN_SESSION_TTL_SECONDS,
    jti: crypto.randomUUID(),
}, secret, "HS256");

export const verifyAdminSession = async (
    token: string | null | undefined,
    secret: string,
    now = Math.floor(Date.now() / 1000),
): Promise<AdminActor | null> => {
    if (!token) return null;
    try {
        const payload = await Jwt.verify(token, secret, "HS256");
        if (
            payload.iss !== ADMIN_SESSION_ISSUER
            || payload.aud !== ADMIN_SESSION_AUDIENCE
            || payload.scope !== "admin_session"
            || typeof payload.username !== "string"
            || !payload.username
            || payload.sub !== payload.username
            || typeof payload.jti !== "string"
            || !payload.jti
            || !isNumericDate(payload.iat)
            || !isNumericDate(payload.nbf)
            || !isNumericDate(payload.exp)
            || payload.iat > now + 30
            || payload.nbf > now + 30
            || payload.exp < now
            || payload.exp - payload.iat > ADMIN_SESSION_TTL_SECONDS
        ) {
            return null;
        }
        return {
            actor_type: "admin",
            actor_label: payload.username,
            auth_method: "admin_session",
            session_id: payload.jti,
        };
    } catch {
        return null;
    }
};

const resolveAdminActor = async (c: Context<HonoCustomType>): Promise<AdminAuthResolution> => {
    const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
    const msgs = i18n.getMessages(lang);
    const sessionToken = c.req.raw.headers.get("x-admin-auth");
    if (sessionToken) {
        const actor = await verifyAdminSession(sessionToken, c.env.JWT_SECRET);
        if (actor) return { actor };
    }

    const accessToken = c.req.raw.headers.get("x-user-access-token");
    if (c.env.ADMIN_USER_ROLE && accessToken) {
        try {
            const payload = await Jwt.verify(accessToken, c.env.JWT_SECRET, "HS256");
            if (!isNumericDate(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) {
                return {
                    failureReason: "user_access_token_expired",
                    failureMessage: msgs.UserAcceesTokenExpiredMsg,
                    deniedActorType: "user",
                    deniedActorId: payload.user_id as number | undefined,
                    deniedActorLabel: payload.user_email as string | undefined,
                };
            }
            if (payload.user_role !== c.env.ADMIN_USER_ROLE) {
                return {
                    failureReason: "user_role_not_admin",
                    failureMessage: msgs.UserRoleIsNotAdminMsg,
                    deniedActorType: "user",
                    deniedActorId: payload.user_id as number | undefined,
                    deniedActorLabel: payload.user_email as string | undefined,
                };
            }
            return {
                actor: {
                    actor_type: "user",
                    actor_id: payload.user_id as number | undefined,
                    actor_label: typeof payload.user_email === "string" ? payload.user_email : "admin_role_user",
                    auth_method: "admin_user_role",
                },
            };
        } catch {
            return {
                failureReason: "invalid_user_access_token",
                failureMessage: msgs.UserAcceesTokenExpiredMsg,
                deniedActorType: "user",
            };
        }
    }

    const adminCheckDisabled = getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK);
    if (isE2eAdminBypassEnabled(c.env)) {
        return {
            actor: {
                actor_type: "admin",
                actor_label: "e2e_test_bypass",
                auth_method: "e2e_test_bypass",
            },
        };
    }

    return {
        failureReason: adminCheckDisabled
            ? "admin_auth_bypass_not_test_scoped"
            : sessionToken
                ? "invalid_admin_session"
                : "missing_admin_auth",
        failureMessage: msgs.NeedAdminPasswordMsg,
        deniedActorType: "admin",
    };
};

export const adminWriteRequiresConfirmation = (method: string, path: string): boolean => {
    const normalizedMethod = method.toUpperCase();
    if (normalizedMethod === "DELETE") return true;
    return normalizedMethod === "POST" && CONFIRMED_POST_PATHS.some((pattern) => pattern.test(path));
};

const requestHasConfirmation = async (c: Context<HonoCustomType>): Promise<boolean> => {
    try {
        const body = await c.req.raw.clone().json() as Record<string, unknown>;
        return body?.confirm === true;
    } catch {
        return false;
    }
};

const resolveRequestId = (c: Context<HonoCustomType>): string => {
    const supplied = c.req.raw.headers.get("x-admin-request-id")?.trim();
    return supplied && REQUEST_ID_PATTERN.test(supplied)
        ? supplied.toLowerCase()
        : crypto.randomUUID();
};

const queueWriteOutcome = (
    c: Context<HonoCustomType>,
    actor: AdminActor,
    requestId: string,
    statusCode: number,
    failureReason?: string,
): void => {
    queueAuditEvent(c, {
        action: "admin.write",
        actor_type: actor.actor_type,
        actor_id: actor.actor_id,
        actor_label: actor.actor_label,
        resource_type: "admin_api",
        resource_label: c.req.path,
        status: statusCode < 400 ? "success" : "failed",
        metadata: {
            auth_method: actor.auth_method,
            request_id: requestId,
            http_status: statusCode,
            ...(failureReason ? { failure_reason: failureReason } : {}),
        },
    });
};

export const adminAuthMiddleware = async (
    c: Context<HonoCustomType>,
    next: () => Promise<void>,
): Promise<Response | void> => {
    const method = c.req.method.toUpperCase();
    const isWrite = !SAFE_METHODS.has(method);
    const requestId = isWrite ? resolveRequestId(c) : undefined;
    if (requestId) {
        c.set("adminRequestId", requestId);
        c.header("x-admin-request-id", requestId);
    }
    c.header("Cache-Control", "no-store");

    const resolution = await resolveAdminActor(c);
    if (!resolution.actor) {
        queueAccessEvent(c, {
            event_type: "admin.access.denied",
            actor_type: resolution.deniedActorType || "admin",
            actor_id: resolution.deniedActorId,
            actor_label: resolution.deniedActorLabel,
            resource_type: "admin_api",
            resource_label: c.req.path,
            status: "denied",
            failure_reason: resolution.failureReason || "missing_admin_auth",
        });
        return c.text(resolution.failureMessage || "Admin authentication required", 401);
    }

    const actor = resolution.actor;
    c.set("adminActor", actor);
    queueAccessEvent(c, {
        event_type: "admin.access.granted",
        actor_type: actor.actor_type,
        actor_id: actor.actor_id,
        actor_label: actor.actor_label,
        resource_type: "admin_api",
        resource_label: c.req.path,
        status: "success",
        metadata: {
            auth_method: actor.auth_method,
            ...(actor.session_id ? { session_id: actor.session_id } : {}),
        },
    });

    if (isWrite
        && adminWriteRequiresConfirmation(method, c.req.path)
        && !await requestHasConfirmation(c)) {
        queueWriteOutcome(c, actor, requestId!, 409, "confirmation_required");
        return c.json({ error: "admin_write_confirmation_required" }, 409);
    }

    try {
        await next();
        if (isWrite) queueWriteOutcome(c, actor, requestId!, c.res.status);
    } catch (error) {
        if (isWrite) queueWriteOutcome(c, actor, requestId!, 500, "unhandled_exception");
        throw error;
    }
};
