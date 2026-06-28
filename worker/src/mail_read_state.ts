import { Context } from "hono";

import i18n from "./i18n";
import { resolveRawEmailList } from "./gzip";

type MailReadParam = string | number | null;

export type MailReadActor = {
    actorType: "admin" | "address" | "share_token" | "user",
    actorId: string,
    address?: string | null,
}

export const ADMIN_MAIL_READ_ACTOR: MailReadActor = {
    actorType: "admin",
    actorId: "global",
};

export const getAddressMailReadActor = (payload: JwtPayload): MailReadActor => {
    if (payload.share_token_id) {
        return {
            actorType: "share_token",
            actorId: String(payload.share_token_id),
            address: payload.address || null,
        };
    }
    return {
        actorType: "address",
        actorId: String(payload.address_id || payload.address),
        address: payload.address || null,
    };
};

export const getUserMailReadActor = (payload: UserPayload): MailReadActor => ({
    actorType: "user",
    actorId: String(payload.user_id),
});

const normalizeLimitOffset = (
    c: Context<HonoCustomType>,
    limit: string | number | undefined | null,
    offset: string | number | undefined | null,
): { limit: number, offset: number, error?: Response } => {
    const msgs = i18n.getMessagesbyContext(c);
    const normalizedLimit = typeof limit === "string" ? Number.parseInt(limit) : Number(limit);
    const normalizedOffset = typeof offset === "string" ? Number.parseInt(offset) : Number(offset);
    if (!normalizedLimit || normalizedLimit < 0 || normalizedLimit > 100) {
        return { limit: 0, offset: 0, error: c.text(msgs.InvalidLimitMsg, 400) };
    }
    if (offset == null || offset == undefined || !Number.isFinite(normalizedOffset) || normalizedOffset < 0) {
        return { limit: normalizedLimit, offset: 0, error: c.text(msgs.InvalidOffsetMsg, 400) };
    }
    return { limit: normalizedLimit, offset: normalizedOffset };
};

const appendUnreadWhere = (whereSql: string): string => {
    if (whereSql.trim().length > 0) return `${whereSql} AND mrs.read_at IS NULL`;
    return `WHERE mrs.read_at IS NULL`;
};

export const listRawMailsWithReadState = async (
    c: Context<HonoCustomType>,
    actor: MailReadActor,
    whereSql: string,
    params: MailReadParam[],
    limit: string | number | undefined | null,
    offset: string | number | undefined | null,
    orderBy = "r.id desc",
): Promise<Response> => {
    const pagination = normalizeLimitOffset(c, limit, offset);
    if (pagination.error) return pagination.error;
    const actorParams = [actor.actorType, actor.actorId];
    const readJoin = `LEFT JOIN mail_read_states mrs`
        + ` ON mrs.mail_id = r.id`
        + ` AND mrs.actor_type = ?`
        + ` AND mrs.actor_id = ?`;
    const { results } = await c.env.DB.prepare(
        `SELECT r.*,`
        + ` mrs.read_at AS read_at,`
        + ` CASE WHEN mrs.read_at IS NULL THEN 0 ELSE 1 END AS is_read,`
        + ` CASE WHEN mrs.read_at IS NULL THEN 1 ELSE 0 END AS unread`
        + ` FROM raw_mails r ${readJoin} ${whereSql}`
        + ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).bind(...actorParams, ...params, pagination.limit, pagination.offset).all();
    const resolvedResults = await resolveRawEmailList(results);
    const count = pagination.offset === 0
        ? await c.env.DB.prepare(
            `SELECT count(*) AS count FROM raw_mails r ${whereSql}`
        ).bind(...params).first<number>("count")
        : 0;
    const unreadCount = pagination.offset === 0
        ? await c.env.DB.prepare(
            `SELECT count(*) AS count FROM raw_mails r ${readJoin} ${appendUnreadWhere(whereSql)}`
        ).bind(...actorParams, ...params).first<number>("count")
        : 0;
    return c.json({
        results: resolvedResults,
        count: count || 0,
        unread_count: unreadCount || 0,
    });
};

export const updateRawMailReadState = async (
    c: Context<HonoCustomType>,
    actor: MailReadActor,
    mailId: string | number,
    accessWhereSql: string,
    accessParams: MailReadParam[],
    read: boolean,
): Promise<Response> => {
    const row = await c.env.DB.prepare(
        `SELECT id, address FROM raw_mails WHERE id = ? ${accessWhereSql}`
    ).bind(mailId, ...accessParams).first<{ id: number, address: string | null }>();
    if (!row) return c.json({ success: false, error: "Mail not found" }, 404);
    if (read) {
        const { success } = await c.env.DB.prepare(
            `INSERT INTO mail_read_states`
            + ` (mail_id, actor_type, actor_id, address, read_at, created_at, updated_at)`
            + ` VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
            + ` ON CONFLICT(mail_id, actor_type, actor_id) DO UPDATE SET`
            + ` address = excluded.address,`
            + ` read_at = datetime('now'),`
            + ` updated_at = datetime('now')`
        ).bind(row.id, actor.actorType, actor.actorId, actor.address || row.address || null).run();
        const readAt = await c.env.DB.prepare(
            `SELECT read_at FROM mail_read_states`
            + ` WHERE mail_id = ? AND actor_type = ? AND actor_id = ?`
        ).bind(row.id, actor.actorType, actor.actorId).first<string>("read_at");
        return c.json({
            success,
            id: row.id,
            read_at: readAt || null,
            is_read: true,
            unread: false,
        });
    }
    const { success } = await c.env.DB.prepare(
        `DELETE FROM mail_read_states`
        + ` WHERE mail_id = ? AND actor_type = ? AND actor_id = ?`
    ).bind(row.id, actor.actorType, actor.actorId).run();
    return c.json({
        success,
        id: row.id,
        read_at: null,
        is_read: false,
        unread: true,
    });
};

export const readStateFromRequest = async (c: Context<HonoCustomType>): Promise<boolean> => {
    const body = await c.req.json().catch(() => ({})) as { read?: unknown };
    return body.read !== false;
};
