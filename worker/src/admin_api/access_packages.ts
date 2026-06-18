import { Context } from "hono";

import i18n from "../i18n";

const normalizePagination = (c: Context<HonoCustomType>): {
    limit: number,
    offset: number,
    error?: Response,
} => {
    const msgs = i18n.getMessagesbyContext(c);
    const { limit = "20", offset, page = "1" } = c.req.query();
    const normalizedLimit = Number(limit);
    if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0 || normalizedLimit > 100) {
        return { limit: 20, offset: 0, error: c.text(msgs.InvalidLimitMsg, 400) };
    }
    const normalizedOffset = offset !== undefined
        ? Number(offset)
        : (Math.max(Number(page) || 1, 1) - 1) * normalizedLimit;
    if (!Number.isFinite(normalizedOffset) || normalizedOffset < 0) {
        return { limit: normalizedLimit, offset: 0, error: c.text(msgs.InvalidOffsetMsg, 400) };
    }
    return { limit: normalizedLimit, offset: normalizedOffset };
}

const list = async (c: Context<HonoCustomType>) => {
    const pagination = normalizePagination(c);
    if (pagination.error) return pagination.error;
    const { q, status, address } = c.req.query();
    const where: string[] = [];
    const params: (string | number | null)[] = [];
    if (q) {
        where.push(`instr(lower(COALESCE(a.name, '') || ' ' || COALESCE(t.label, '') || ' ' || COALESCE(t.scopes, '')), lower(?)) > 0`);
        params.push(q);
    }
    if (address) {
        where.push(`instr(lower(a.name), lower(?)) > 0`);
        params.push(address);
    }
    if (status === "active") {
        where.push(`t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))`);
    } else if (status === "revoked") {
        where.push(`t.revoked_at IS NOT NULL`);
    } else if (status === "expired") {
        where.push(`t.revoked_at IS NULL AND t.expires_at IS NOT NULL AND t.expires_at <= datetime('now')`);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const selectSql = `SELECT`
        + ` t.id, t.address_id, a.name AS address, t.label, t.scopes, t.expires_at, t.revoked_at, t.last_used_at, t.created_at,`
        + ` CASE`
        + ` WHEN t.revoked_at IS NOT NULL THEN 'revoked'`
        + ` WHEN t.expires_at IS NOT NULL AND t.expires_at <= datetime('now') THEN 'expired'`
        + ` ELSE 'active'`
        + ` END AS status`
        + ` FROM address_share_tokens t`
        + ` JOIN address a ON a.id = t.address_id`
        + whereSql;
    const { results } = await c.env.DB.prepare(
        `${selectSql} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`
    ).bind(...params, pagination.limit, pagination.offset).all();
    const count = pagination.offset === 0
        ? await c.env.DB.prepare(
            `SELECT COUNT(*) AS count FROM address_share_tokens t JOIN address a ON a.id = t.address_id${whereSql}`
        ).bind(...params).first<number>("count")
        : 0;
    return c.json({ results: results || [], count: count || 0 });
}

export default { list };
