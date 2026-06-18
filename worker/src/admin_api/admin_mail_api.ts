import { Context } from "hono";
import { handleMailListQuery } from "../common";

export default {
    getMails: async (c: Context<HonoCustomType>) => {
        const { address, domain, address_prefix, limit, offset } = c.req.query();
        const addressQuery = address ? `address = ?` : "";
        const addressParams = address ? [address] : [];
        const domainQuery = domain ? `lower(substr(address, instr(address, '@') + 1)) = lower(?)` : "";
        const domainParams = domain ? [domain] : [];
        const prefixQuery = address_prefix ? `instr(lower(address), lower(?)) > 0` : "";
        const prefixParams = address_prefix ? [address_prefix] : [];
        const filterQuerys = [addressQuery, domainQuery, prefixQuery].filter((item) => item).join(" and ");
        const finalQuery = filterQuerys.length > 0 ? `where ${filterQuerys}` : "";
        const filterParams = [...addressParams, ...domainParams, ...prefixParams]
        return await handleMailListQuery(c,
            `SELECT * FROM raw_mails ${finalQuery}`,
            `SELECT count(*) as count FROM raw_mails ${finalQuery}`,
            filterParams, limit, offset
        );
    },
    getDomains: async (c: Context<HonoCustomType>) => {
        const { results } = await c.env.DB.prepare(
            `SELECT`
            + ` lower(substr(address, instr(address, '@') + 1)) AS domain,`
            + ` count(DISTINCT address) AS address_count,`
            + ` count(*) AS mail_count,`
            + ` max(created_at) AS latest_mail_at`
            + ` FROM raw_mails`
            + ` WHERE address IS NOT NULL AND instr(address, '@') > 0`
            + ` GROUP BY domain`
            + ` ORDER BY latest_mail_at DESC`
        ).all();
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
            + ` max(r.created_at) AS latest_mail_at`
            + ` FROM raw_mails r`
            + ` LEFT JOIN address a ON a.name = r.address`
            + ` WHERE r.address IS NOT NULL AND instr(r.address, '@') > 0`
            + domainQuery
            + ` GROUP BY r.address`
            + ` ORDER BY latest_mail_at DESC`
        ).bind(...params).all();
        return c.json({ results });
    },
    getUnknowMails: async (c: Context<HonoCustomType>) => {
        const { limit, offset } = c.req.query();
        return await handleMailListQuery(c,
            `SELECT * FROM raw_mails where address NOT IN (select name from address) `,
            `SELECT count(*) as count FROM raw_mails`
            + ` where address NOT IN (select name from address) `,
            [], limit, offset
        );
    },
    deleteMail: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const { success } = await c.env.DB.prepare(
            `DELETE FROM raw_mails WHERE id = ? `
        ).bind(id).run();
        return c.json({
            success: success
        })
    }
}
