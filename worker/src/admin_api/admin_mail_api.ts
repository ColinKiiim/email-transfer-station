import { Context } from "hono";
import { commonParseMail } from "../common";
import {
    ADMIN_MAIL_READ_ACTOR,
    listRawMailsWithReadState,
    readStateFromRequest,
    updateRawMailReadState,
} from "../mail_read_state";

const fallbackHeader = (raw: string, name: string): string => {
    const match = raw.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return match?.[1]?.trim() || "";
};

const toAdminParsedMailRow = async (row: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const raw = typeof row.raw === "string" ? row.raw : "";
    const parsed = raw ? await commonParseMail({ rawEmail: raw }) : undefined;
    const attachments = (parsed?.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        disposition: attachment.disposition,
        size: attachment.content?.length ?? 0,
    }));
    const sender = parsed?.sender?.trim()
        || fallbackHeader(raw, "From")
        || (typeof row.source === "string" ? row.source : "");
    const subject = parsed?.subject?.trim()
        || fallbackHeader(raw, "Subject")
        || (typeof row.message_id === "string" ? row.message_id : `Mail #${row.id}`);
    const text = parsed?.text?.trim() || "";
    const html = parsed?.html || "";
    return {
        ...row,
        sender,
        subject,
        text,
        html,
        message: html || text,
        attachments,
        attachment_count: attachments.length,
        parse_status: parsed ? "parsed" : (raw ? "raw" : "empty"),
    };
};

const withAdminParsedMailRows = async (c: Context<HonoCustomType>, response: Response): Promise<Response> => {
    if (response.status !== 200) return response;
    const payload = await response.json() as {
        results?: Record<string, unknown>[],
        count?: number,
        unread_count?: number,
    };
    const results = Array.isArray(payload.results)
        ? await Promise.all(payload.results.map(toAdminParsedMailRow))
        : [];
    return c.json({
        ...payload,
        results,
    });
};

export default {
    getMails: async (c: Context<HonoCustomType>) => {
        const { address, domain, address_prefix, limit, offset } = c.req.query();
        const addressQuery = address ? `r.address = ?` : "";
        const addressParams = address ? [address] : [];
        const domainQuery = domain ? `lower(substr(r.address, instr(r.address, '@') + 1)) = lower(?)` : "";
        const domainParams = domain ? [domain] : [];
        const prefixQuery = address_prefix ? `instr(lower(r.address), lower(?)) > 0` : "";
        const prefixParams = address_prefix ? [address_prefix] : [];
        const filterQuerys = [addressQuery, domainQuery, prefixQuery].filter((item) => item).join(" and ");
        const finalQuery = filterQuerys.length > 0 ? `WHERE ${filterQuerys}` : "";
        const filterParams = [...addressParams, ...domainParams, ...prefixParams]
        return await withAdminParsedMailRows(
            c,
            await listRawMailsWithReadState(c, ADMIN_MAIL_READ_ACTOR, finalQuery, filterParams, limit, offset),
        );
    },
    getDomains: async (c: Context<HonoCustomType>) => {
        const { results } = await c.env.DB.prepare(
            `SELECT`
            + ` lower(substr(r.address, instr(r.address, '@') + 1)) AS domain,`
            + ` count(DISTINCT r.address) AS address_count,`
            + ` count(*) AS mail_count,`
            + ` SUM(CASE WHEN mrs.read_at IS NULL THEN 1 ELSE 0 END) AS unread_count,`
            + ` max(r.created_at) AS latest_mail_at`
            + ` FROM raw_mails r`
            + ` LEFT JOIN mail_read_states mrs`
            + ` ON mrs.mail_id = r.id`
            + ` AND mrs.actor_type = ?`
            + ` AND mrs.actor_id = ?`
            + ` WHERE r.address IS NOT NULL AND instr(r.address, '@') > 0`
            + ` GROUP BY domain`
            + ` ORDER BY latest_mail_at DESC`
        ).bind(ADMIN_MAIL_READ_ACTOR.actorType, ADMIN_MAIL_READ_ACTOR.actorId).all();
        return c.json({ results });
    },
    getAddresses: async (c: Context<HonoCustomType>) => {
        const { domain } = c.req.query();
        const domainQuery = domain ? ` AND lower(substr(r.address, instr(r.address, '@') + 1)) = lower(?)` : "";
        const params = domain ? [domain] : [];
        const { results } = await c.env.DB.prepare(
            `SELECT`
            + ` r.address,`
            + ` substr(r.address, 1, instr(r.address, '@') - 1) AS local_part,`
            + ` lower(substr(r.address, instr(r.address, '@') + 1)) AS domain,`
            + ` a.id AS address_id,`
            + ` a.display_label,`
            + ` a.owner_note,`
            + ` count(*) AS mail_count,`
            + ` SUM(CASE WHEN mrs.read_at IS NULL THEN 1 ELSE 0 END) AS unread_count,`
            + ` max(r.created_at) AS latest_mail_at`
            + ` FROM raw_mails r`
            + ` LEFT JOIN mail_read_states mrs`
            + ` ON mrs.mail_id = r.id`
            + ` AND mrs.actor_type = ?`
            + ` AND mrs.actor_id = ?`
            + ` LEFT JOIN address a ON a.name = r.address`
            + ` WHERE r.address IS NOT NULL AND instr(r.address, '@') > 0`
            + domainQuery
            + ` GROUP BY r.address`
            + ` ORDER BY latest_mail_at DESC`
        ).bind(ADMIN_MAIL_READ_ACTOR.actorType, ADMIN_MAIL_READ_ACTOR.actorId, ...params).all();
        return c.json({ results });
    },
    getUnknowMails: async (c: Context<HonoCustomType>) => {
        const { limit, offset } = c.req.query();
        return await withAdminParsedMailRows(
            c,
            await listRawMailsWithReadState(
                c,
                ADMIN_MAIL_READ_ACTOR,
                `WHERE r.address NOT IN (select name from address)`,
                [],
                limit,
                offset,
            ),
        );
    },
    updateReadState: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const read = await readStateFromRequest(c);
        return updateRawMailReadState(c, ADMIN_MAIL_READ_ACTOR, id, "", [], read);
    },
    deleteMail: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        await c.env.DB.prepare(
            `DELETE FROM mail_read_states WHERE mail_id = ?`
        ).bind(id).run();
        const { success } = await c.env.DB.prepare(
            `DELETE FROM raw_mails WHERE id = ? `
        ).bind(id).run();
        return c.json({
            success: success
        })
    }
}
