import { Context } from "hono";
import {
    ADMIN_MAIL_READ_ACTOR,
    listRawMailsWithReadState,
    readStateFromRequest,
    updateRawMailReadState,
} from "../mail_read_state";
import { resolveRawEmailRow } from "../gzip";
import { RawMailRow } from "../models";

const ADMIN_MAIL_PREVIEW_RAW_LIMIT = 64 * 1024;

const fallbackHeader = (raw: string, name: string): string => {
    const match = raw.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return match?.[1]?.trim() || "";
};

const unfoldHeaders = (value: string): string => value.replace(/\r?\n[ \t]+/g, " ");

const stripHtml = (value: string): string => value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

const splitHeadersAndBody = (value: string): { headers: string, body: string } => {
    const match = value.match(/\r?\n\r?\n/);
    if (!match || match.index === undefined) return { headers: value, body: "" };
    return {
        headers: value.slice(0, match.index),
        body: value.slice(match.index + match[0].length),
    };
};

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

const headerParam = (value: string, name: string): string => {
    const match = value.match(new RegExp(`(?:^|;)\\s*${name}=("([^"]+)"|[^;\\s]+)`, "i"));
    return (match?.[2] || match?.[1] || "").replace(/^"|"$/g, "");
};

const decodeBytes = (bytes: Uint8Array, charset: string): string => {
    try {
        return new TextDecoder(charset || "utf-8").decode(bytes);
    } catch {
        return new TextDecoder().decode(bytes);
    }
};

const decodeQuotedPrintable = (value: string, charset: string): string => {
    const bytes: number[] = [];
    const input = value.replace(/=\r?\n/g, "");
    for (let i = 0; i < input.length; i += 1) {
        const hex = input.slice(i + 1, i + 3);
        if (input[i] === "=" && /^[0-9a-f]{2}$/i.test(hex)) {
            bytes.push(parseInt(hex, 16));
            i += 2;
        } else {
            bytes.push(input.charCodeAt(i) & 0xff);
        }
    }
    return decodeBytes(Uint8Array.from(bytes), charset);
};

const decodeTransferBody = (body: string, encoding: string, charset: string): string => {
    if (encoding === "quoted-printable") return decodeQuotedPrintable(body, charset);
    if (encoding === "base64") {
        try {
            return decodeBytes(Uint8Array.from(atob(body.replace(/\s+/g, "")), (char) => char.charCodeAt(0)), charset);
        } catch {
            return body;
        }
    }
    return body;
};

const textParts = (raw: string, depth = 0): { body: string, contentType: string, transferEncoding: string, charset: string, disposition: string }[] => {
    const { headers, body } = splitHeadersAndBody(raw);
    const unfolded = unfoldHeaders(headers);
    const contentTypeHeader = fallbackHeader(unfolded, "Content-Type") || "text/plain";
    const contentType = contentTypeHeader.split(";")[0].trim().toLowerCase();
    const boundary = headerParam(contentTypeHeader, "boundary");
    if (boundary && depth < 3) {
        return body
            .split(`--${boundary}`)
            .slice(1)
            .filter((part) => !part.trimStart().startsWith("--"))
            .flatMap((part) => textParts(part.replace(/^\r?\n/, ""), depth + 1));
    }
    return [{
        body,
        contentType,
        transferEncoding: fallbackHeader(unfolded, "Content-Transfer-Encoding").toLowerCase(),
        charset: headerParam(contentTypeHeader, "charset") || "utf-8",
        disposition: fallbackHeader(unfolded, "Content-Disposition").toLowerCase(),
    }];
};

export const fallbackBodyPreview = (raw: string): string => {
    // ponytail: list previews inspect 64 KiB; fetch the single-mail detail for the full body.
    const previewRaw = raw.slice(0, ADMIN_MAIL_PREVIEW_RAW_LIMIT);
    const parts = textParts(previewRaw).filter((part) => part.contentType.startsWith("text/") && !part.disposition.includes("attachment"));
    const part = parts.find((item) => item.contentType === "text/plain") || parts.find((item) => item.contentType === "text/html");
    const body = part
        ? decodeTransferBody(part.body, part.transferEncoding, part.charset)
        : splitHeadersAndBody(previewRaw).body;
    return normalizeMailText(stripHtml(body).slice(0, 4000)).slice(0, 1000);
};

export const toAdminParsedMailRow = async (
    row: Record<string, unknown>,
    includeRaw = true,
): Promise<Record<string, unknown>> => {
    const raw = typeof row.raw === "string" ? row.raw : "";
    const previewRaw = raw.slice(0, ADMIN_MAIL_PREVIEW_RAW_LIMIT);
    const headers = unfoldHeaders(splitHeadersAndBody(previewRaw).headers);
    const sender = normalizeMailText(fallbackHeader(headers, "From"))
        || (typeof row.source === "string" ? row.source : "");
    const subject = normalizeMailText(fallbackHeader(headers, "Subject"))
        || (typeof row.message_id === "string" ? row.message_id : `Mail #${row.id}`);
    const text = fallbackBodyPreview(previewRaw);
    const { raw: _raw, ...summary } = row;
    return {
        ...(includeRaw ? row : summary),
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

const withAdminParsedMailRows = async (
    c: Context<HonoCustomType>,
    response: Response,
    includeRaw = true,
): Promise<Response> => {
    if (response.status !== 200) return response;
    const payload = await response.json() as {
        results?: Record<string, unknown>[],
        count?: number,
        unread_count?: number,
    };
    const results = Array.isArray(payload.results)
        ? await Promise.all(payload.results.map((row) => toAdminParsedMailRow(row, includeRaw)))
        : [];
    return c.json({
        ...payload,
        results,
    });
};

export default {
    getMails: async (c: Context<HonoCustomType>) => {
        const { address, domain, address_prefix, include_raw, limit, offset } = c.req.query();
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
            include_raw !== "false",
        );
    },
    getMail: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const result = await c.env.DB.prepare(
            `SELECT r.*,`
            + ` mrs.read_at AS read_at,`
            + ` CASE WHEN mrs.read_at IS NULL THEN 0 ELSE 1 END AS is_read,`
            + ` CASE WHEN mrs.read_at IS NULL THEN 1 ELSE 0 END AS unread`
            + ` FROM raw_mails r`
            + ` LEFT JOIN mail_read_states mrs`
            + ` ON mrs.mail_id = r.id`
            + ` AND mrs.actor_type = ?`
            + ` AND mrs.actor_id = ?`
            + ` WHERE r.id = ?`
        ).bind(ADMIN_MAIL_READ_ACTOR.actorType, ADMIN_MAIL_READ_ACTOR.actorId, id).first<RawMailRow>();
        if (!result) return c.json({ error: "Mail not found" }, 404);
        return c.json(await toAdminParsedMailRow(await resolveRawEmailRow(result)));
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
        const { include_raw, limit, offset } = c.req.query();
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
            include_raw !== "false",
        );
    },
    updateReadState: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const read = await readStateFromRequest(c);
        return updateRawMailReadState(c, ADMIN_MAIL_READ_ACTOR, id, "", [], read);
    },
    deleteMail: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const results = await c.env.DB.batch([
            c.env.DB.prepare(`DELETE FROM mail_read_states WHERE mail_id = ?`).bind(id),
            c.env.DB.prepare(`DELETE FROM raw_mails WHERE id = ?`).bind(id),
        ]);
        const success = results.every((result) => result.success);
        return c.json({
            success: success
        })
    }
}
