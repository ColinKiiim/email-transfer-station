import { Context } from "hono";

type EventStatus = "success" | "failed" | "denied" | "skipped";
type MetadataValue = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

type BaseEvent = {
    actor_type?: string | null;
    actor_id?: string | number | null;
    actor_label?: string | null;
    resource_type?: string | null;
    resource_id?: string | number | null;
    resource_label?: string | null;
    status?: EventStatus;
    metadata?: MetadataValue;
}

export type AuditEventInput = BaseEvent & {
    action: string;
    source?: string | null;
}

export type AccessEventInput = BaseEvent & {
    event_type: string;
    failure_reason?: string | null;
}

const MAX_METADATA_LENGTH = 5000;
const MAX_STRING_LENGTH = 512;
const MAX_OBJECT_KEYS = 80;
const MAX_ARRAY_ITEMS = 50;
const MAX_SANITIZE_DEPTH = 5;

const exactSensitiveKeys = new Set([
    "authorization",
    "cookie",
    "cf_token",
    "access_token",
    "id_token",
    "client_secret",
    "token_hash",
    "raw",
    "raw_mail",
    "raw_email",
    "parsed_text",
    "parsed_html",
    "body",
    "content",
    "headers",
    "password",
    "new_password",
    "jwt",
    "credential",
    "challenge",
    "signature",
    "public_key",
    "private_key",
]);

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[\s-]+/g, "_");

const isSensitiveKey = (key: string): boolean => {
    const normalized = normalizeKey(key);
    if (
        normalized === "id"
        || normalized === "token_id"
        || normalized === "share_token_id"
        || normalized === "address_id"
        || normalized === "user_id"
        || normalized === "passkey_id"
        || normalized.endsWith("_count")
    ) {
        return false;
    }
    if (exactSensitiveKeys.has(normalized)) return true;
    return /(password|secret|authorization|cookie|credential|jwt|token_hash|access_token|id_token|client_secret|raw|parsed_html|parsed_text|signature|challenge)/i.test(normalized);
}

const truncateString = (value: string): string => {
    if (value.length <= MAX_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

const sanitizeMetadata = (value: unknown, depth = 0): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return truncateString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (depth >= MAX_SANITIZE_DEPTH) return "[max-depth]";
    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeMetadata(item, depth + 1));
    }
    if (typeof value === "object") {
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)) {
            output[key] = isSensitiveKey(key) ? "[redacted]" : sanitizeMetadata(item, depth + 1);
        }
        return output;
    }
    return String(value);
}

const stringifyMetadata = (metadata: MetadataValue): string | null => {
    if (metadata === undefined || metadata === null) return null;
    try {
        const json = JSON.stringify(sanitizeMetadata(metadata));
        if (!json) return null;
        return json.length > MAX_METADATA_LENGTH
            ? `${json.slice(0, MAX_METADATA_LENGTH)}...`
            : json;
    } catch {
        return JSON.stringify({ error: "failed_to_serialize_metadata" });
    }
}

const toDbString = (value: string | number | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    return String(value);
}

export const getClientIp = (c: Context<HonoCustomType>): string | null => {
    const cfConnectingIp = c.req.raw.headers.get("cf-connecting-ip");
    if (cfConnectingIp) return cfConnectingIp;
    const forwardedFor = c.req.raw.headers.get("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;
    const realIp = c.req.raw.headers.get("x-real-ip");
    return realIp || null;
}

export const getUserAgent = (c: Context<HonoCustomType>): string | null => {
    return c.req.raw.headers.get("user-agent");
}

export const recordAuditEvent = async (
    c: Context<HonoCustomType>,
    event: AuditEventInput
): Promise<void> => {
    try {
        await c.env.DB.prepare(
            `INSERT INTO audit_events`
            + ` (actor_type, actor_id, actor_label, action, resource_type, resource_id, resource_label,`
            + ` status, ip, user_agent, method, path, source, metadata)`
            + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            event.actor_type || null,
            toDbString(event.actor_id),
            event.actor_label || null,
            event.action,
            event.resource_type || null,
            toDbString(event.resource_id),
            event.resource_label || null,
            event.status || "success",
            getClientIp(c),
            getUserAgent(c),
            c.req.method,
            c.req.path,
            event.source || "admin_api",
            stringifyMetadata(event.metadata),
        ).run();
    } catch (error) {
        console.warn("[audit] failed to record audit event", error);
    }
}

export const recordAccessEvent = async (
    c: Context<HonoCustomType>,
    event: AccessEventInput
): Promise<void> => {
    try {
        await c.env.DB.prepare(
            `INSERT INTO access_events`
            + ` (actor_type, actor_id, actor_label, event_type, resource_type, resource_id, resource_label,`
            + ` status, failure_reason, ip, user_agent, method, path, metadata)`
            + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            event.actor_type || null,
            toDbString(event.actor_id),
            event.actor_label || null,
            event.event_type,
            event.resource_type || null,
            toDbString(event.resource_id),
            event.resource_label || null,
            event.status || "success",
            event.failure_reason || null,
            getClientIp(c),
            getUserAgent(c),
            c.req.method,
            c.req.path,
            stringifyMetadata(event.metadata),
        ).run();
    } catch (error) {
        console.warn("[audit] failed to record access event", error);
    }
}

export const queueAuditEvent = (
    c: Context<HonoCustomType>,
    event: AuditEventInput
): void => {
    c.executionCtx.waitUntil(recordAuditEvent(c, event));
}

export const queueAccessEvent = (
    c: Context<HonoCustomType>,
    event: AccessEventInput
): void => {
    c.executionCtx.waitUntil(recordAccessEvent(c, event));
}
