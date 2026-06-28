import { Context } from 'hono'

import { commonParseMail, updateAddressUpdatedAt } from '../common'
import { resolveRawEmailRow } from '../gzip'
import { getAddressMailReadActor, listRawMailsWithReadState } from '../mail_read_state';

const toParsedMailRow = async (row: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const raw = typeof row.raw === 'string' ? row.raw : '';
    const parsed = raw ? await commonParseMail({ rawEmail: raw }) : undefined;
    const { raw: _raw, ...rest } = row;
    return {
        ...rest,
        sender: parsed?.sender?.trim() ?? '',
        subject: parsed?.subject ?? '',
        text: parsed?.text ?? '',
        html: parsed?.html ?? '',
        attachments: (parsed?.attachments ?? []).map(a => ({
            filename: a.filename,
            mimeType: a.mimeType,
            disposition: a.disposition,
            size: a.content?.length ?? 0,
        })),
    };
};

const listParsedMails = async (c: Context<HonoCustomType>) => {
    const jwtPayload = c.get("jwtPayload");
    const { address } = jwtPayload;
    if (!address) return c.json({ "error": "No address" }, 400);
    const { limit, offset } = c.req.query();
    if (Number.parseInt(offset) <= 0) updateAddressUpdatedAt(c, address);
    const listRes = await listRawMailsWithReadState(
        c,
        getAddressMailReadActor(jwtPayload),
        `WHERE r.address = ?`,
        [address],
        limit,
        offset,
    );
    if (listRes.status !== 200) return listRes;
    const { results, count, unread_count } = await listRes.json() as {
        results: Record<string, unknown>[],
        count: number,
        unread_count: number,
    };
    const parsed = await Promise.all(results.map(toParsedMailRow));
    return c.json({ results: parsed, count, unread_count });
};

const getParsedMail = async (c: Context<HonoCustomType>) => {
    const jwtPayload = c.get("jwtPayload");
    const { address } = jwtPayload;
    const { mail_id } = c.req.param();
    const actor = getAddressMailReadActor(jwtPayload);
    const row = await c.env.DB.prepare(
        `SELECT r.*,`
        + ` mrs.read_at AS read_at,`
        + ` CASE WHEN mrs.read_at IS NULL THEN 0 ELSE 1 END AS is_read,`
        + ` CASE WHEN mrs.read_at IS NULL THEN 1 ELSE 0 END AS unread`
        + ` FROM raw_mails r`
        + ` LEFT JOIN mail_read_states mrs`
        + ` ON mrs.mail_id = r.id`
        + ` AND mrs.actor_type = ?`
        + ` AND mrs.actor_id = ?`
        + ` WHERE r.id = ? and r.address = ?`
    ).bind(actor.actorType, actor.actorId, mail_id, address).first();
    if (!row) return c.json(null);
    const resolved = await resolveRawEmailRow(row);
    return c.json(await toParsedMailRow(resolved as Record<string, unknown>));
};

export default { listParsedMails, getParsedMail };
