import { Context } from "hono";
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

const unfoldHeaders = (value: string): string => value.replace(/\r?\n[ \t]+/g, " ");

const stripHtml = (value: string): string => value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

const decodeMimeWords = (value: string): string => value.replace(
    /=\?([^?]+)\?([bq])\?([^?]+)\?=/gi,
    (_match, charset: string, encoding: string, text: string) => {
        try {
            const bytes = encoding.toLowerCase() === "b"
                ? Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
                : Uint8Array.from(
                    text
                        .replace(/_/g, " ")
                        .replace(/=([0-9a-f]{2})/gi, (_hexMatch, hex) => String.fromCharCode(parseInt(hex, 16))),
                    (char) => char.charCodeAt(0),
                );
            return new TextDecoder(charset).decode(bytes);
        } catch {
            return text;
        }
    },
);

const normalizeMailText = (value: string): string => decodeMimeWords(value)
    .replace(/\s+/g, " ")
    .trim();

const fallbackBodyPreview = (raw: string): string => {
    const separator = raw.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
    const body = raw.split(separator).slice(1).join(separator);
    return normalizeMailText(stripHtml(body).slice(0, 4000)).slice(0, 1000);
};

const toAdminParsedMailRow = async (row: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const raw = typeof row.raw === "string" ? row.raw : "";
    const headers = unfoldHeaders(raw);
    const sender = normalizeMailText(fallbackHeader(headers, "From"))
        || (typeof row.source === "string" ? row.source : "");
    const subject = normalizeMailText(fallbackHeader(headers, "Subject"))
        || (typeof row.message_id === "string" ? row.message_id : `Mail #${row.id}`);
    const text = fallbackBodyPreview(raw);
    return {
        ...row,
        sender,
        subject,
        text,
        html: "",
        message: text,
        attachments: [],
        attachment_count: 0,
        parse_status: raw ? "lightweight" : "empty",
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
