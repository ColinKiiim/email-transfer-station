import { Context } from "hono";

import i18n from "../i18n";

type QueryParams = string | number | null;

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

const addExactFilter = (
    where: string[],
    params: QueryParams[],
    column: string,
    value: string | undefined
): void => {
    if (!value) return;
    where.push(`${column} = ?`);
    params.push(value);
}

const addInstrFilter = (
    where: string[],
    params: QueryParams[],
    expression: string,
    value: string | undefined
): void => {
    if (!value) return;
    where.push(`instr(lower(${expression}), lower(?)) > 0`);
    params.push(value);
}

const addDateFilters = (
    where: string[],
    params: QueryParams[],
    start: string | undefined,
    end: string | undefined
): void => {
    if (start) {
        where.push(`created_at >= ?`);
        params.push(start);
    }
    if (end) {
        where.push(`created_at <= ?`);
        params.push(end);
    }
}

const runListQuery = async (
    c: Context<HonoCustomType>,
    selectSql: string,
    countSql: string,
    params: QueryParams[],
    limit: number,
    offset: number
): Promise<Response> => {
    const { results } = await c.env.DB.prepare(
        `${selectSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    const count = offset === 0
        ? await c.env.DB.prepare(countSql).bind(...params).first<number>("count")
        : 0;
    return c.json({ results, count: count || 0 });
}

const listAuditEvents = async (c: Context<HonoCustomType>) => {
    const pagination = normalizePagination(c);
    if (pagination.error) return pagination.error;
    const {
        q, actor, action, resource_type, resource_id, status, start, end
    } = c.req.query();
    const where: string[] = [];
    const params: QueryParams[] = [];
    addInstrFilter(where, params, `COALESCE(actor_label, '') || ' ' || COALESCE(actor_id, '')`, actor);
    addInstrFilter(where, params, `action`, action);
    addExactFilter(where, params, `resource_type`, resource_type);
    addExactFilter(where, params, `resource_id`, resource_id);
    addExactFilter(where, params, `status`, status);
    addDateFilters(where, params, start, end);
    if (q) {
        addInstrFilter(
            where,
            params,
            `COALESCE(action, '') || ' ' || COALESCE(resource_type, '') || ' ' || COALESCE(resource_id, '') || ' ' || COALESCE(resource_label, '') || ' ' || COALESCE(actor_label, '') || ' ' || COALESCE(ip, '')`,
            q,
        );
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    return runListQuery(
        c,
        `SELECT id, actor_type, actor_id, actor_label, action, resource_type, resource_id, resource_label, status, ip, user_agent, method, path, source, metadata, created_at FROM audit_events${whereSql}`,
        `SELECT count(*) AS count FROM audit_events${whereSql}`,
        params,
        pagination.limit,
        pagination.offset,
    );
}

const listAccessEvents = async (c: Context<HonoCustomType>) => {
    const pagination = normalizePagination(c);
    if (pagination.error) return pagination.error;
    const {
        q, actor, event_type, resource_type, resource_id, status, ip, method, path, start, end
    } = c.req.query();
    const where: string[] = [];
    const params: QueryParams[] = [];
    addInstrFilter(where, params, `COALESCE(actor_label, '') || ' ' || COALESCE(actor_id, '')`, actor);
    addInstrFilter(where, params, `event_type`, event_type);
    addExactFilter(where, params, `resource_type`, resource_type);
    addExactFilter(where, params, `resource_id`, resource_id);
    addExactFilter(where, params, `status`, status);
    addInstrFilter(where, params, `ip`, ip);
    addExactFilter(where, params, `method`, method);
    addInstrFilter(where, params, `path`, path);
    addDateFilters(where, params, start, end);
    if (q) {
        addInstrFilter(
            where,
            params,
            `COALESCE(event_type, '') || ' ' || COALESCE(resource_type, '') || ' ' || COALESCE(resource_id, '') || ' ' || COALESCE(resource_label, '') || ' ' || COALESCE(actor_label, '') || ' ' || COALESCE(ip, '') || ' ' || COALESCE(path, '')`,
            q,
        );
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    return runListQuery(
        c,
        `SELECT id, actor_type, actor_id, actor_label, event_type, resource_type, resource_id, resource_label, status, failure_reason, ip, user_agent, method, path, metadata, created_at FROM access_events${whereSql}`,
        `SELECT count(*) AS count FROM access_events${whereSql}`,
        params,
        pagination.limit,
        pagination.offset,
    );
}

const scalarCount = async (
    c: Context<HonoCustomType>,
    sql: string
): Promise<number> => {
    return Number(await c.env.DB.prepare(sql).first<number>("count") || 0);
}

const getOverview = async (c: Context<HonoCustomType>) => {
    const [
        addressCount,
        userCount,
        mailCount,
        sendMailCount,
        activeShareCount,
        audit24h,
        access24h,
    ] = await Promise.all([
        scalarCount(c, `SELECT COUNT(*) AS count FROM address`),
        scalarCount(c, `SELECT COUNT(*) AS count FROM users`),
        scalarCount(c, `SELECT COUNT(*) AS count FROM raw_mails`),
        scalarCount(c, `SELECT COUNT(*) AS count FROM sendbox`),
        scalarCount(c, `SELECT COUNT(*) AS count FROM address_share_tokens WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))`),
        scalarCount(c, `SELECT COUNT(*) AS count FROM audit_events WHERE created_at >= datetime('now', '-1 day')`),
        scalarCount(c, `SELECT COUNT(*) AS count FROM access_events WHERE created_at >= datetime('now', '-1 day')`),
    ]);
    const { results: domainResults } = await c.env.DB.prepare(
        `SELECT lower(substr(name, instr(name, '@') + 1)) AS domain,`
        + ` COUNT(*) AS address_count,`
        + ` SUM((SELECT COUNT(*) FROM raw_mails rm WHERE rm.address = address.name)) AS mail_count,`
        + ` SUM((SELECT COUNT(*) FROM address_share_tokens t WHERE t.address_id = address.id AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > datetime('now')))) AS active_share_count`
        + ` FROM address`
        + ` WHERE instr(name, '@') > 0`
        + ` GROUP BY domain`
        + ` ORDER BY mail_count DESC, address_count DESC, domain ASC`
        + ` LIMIT 20`
    ).all();
    const { results: recentAuditEvents } = await c.env.DB.prepare(
        `SELECT id, action, resource_type, resource_label, status, created_at`
        + ` FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 8`
    ).all();
    const { results: recentAccessEvents } = await c.env.DB.prepare(
        `SELECT id, event_type, actor_label, resource_label, status, failure_reason, created_at`
        + ` FROM access_events ORDER BY created_at DESC, id DESC LIMIT 8`
    ).all();
    return c.json({
        totals: {
            address_count: addressCount,
            user_count: userCount,
            mail_count: mailCount,
            send_mail_count: sendMailCount,
            active_share_count: activeShareCount,
            audit_events_24h: audit24h,
            access_events_24h: access24h,
        },
        domains: domainResults || [],
        recent_audit_events: recentAuditEvents || [],
        recent_access_events: recentAccessEvents || [],
    });
}

export default { listAuditEvents, listAccessEvents, getOverview };
