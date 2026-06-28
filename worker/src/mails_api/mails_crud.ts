import { Context } from 'hono'

import i18n from '../i18n';
import { getBooleanValue } from '../utils';
import { deleteAddressWithData, updateAddressUpdatedAt } from '../common'
import { resolveRawEmailRow } from '../gzip'
import { getSendBalanceState } from './send_balance';
import {
    getAddressMailReadActor,
    listRawMailsWithReadState,
    readStateFromRequest,
    updateRawMailReadState,
} from '../mail_read_state';

const listMails = async (c: Context<HonoCustomType>) => {
    const jwtPayload = c.get("jwtPayload");
    const { address } = jwtPayload;
    if (!address) {
        return c.json({ "error": "No address" }, 400)
    }
    const { limit, offset } = c.req.query();
    if (Number.parseInt(offset) <= 0) updateAddressUpdatedAt(c, address);
    return await listRawMailsWithReadState(
        c,
        getAddressMailReadActor(jwtPayload),
        `WHERE r.address = ?`,
        [address],
        limit,
        offset,
    );
};

const getMail = async (c: Context<HonoCustomType>) => {
    const jwtPayload = c.get("jwtPayload");
    const { address } = jwtPayload;
    const { mail_id } = c.req.param();
    const actor = getAddressMailReadActor(jwtPayload);
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
        + ` WHERE r.id = ? AND r.address = ?`
    ).bind(actor.actorType, actor.actorId, mail_id, address).first();
    if (!result) return c.json(null);
    return c.json(await resolveRawEmailRow(result));
};

const updateReadState = async (c: Context<HonoCustomType>) => {
    const jwtPayload = c.get("jwtPayload");
    const { address } = jwtPayload;
    const { id } = c.req.param();
    const read = await readStateFromRequest(c);
    return updateRawMailReadState(
        c,
        getAddressMailReadActor(jwtPayload),
        id,
        `AND address = ?`,
        [address],
        read,
    );
};

const deleteMail = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    const { id } = c.req.param();
    // TODO: add toLowerCase() to handle old data
    await c.env.DB.prepare(
        `DELETE FROM mail_read_states`
        + ` WHERE mail_id IN (SELECT id FROM raw_mails WHERE address = ? and id = ?)`
    ).bind(address.toLowerCase(), id).run();
    const { success } = await c.env.DB.prepare(
        `DELETE FROM raw_mails WHERE address = ? and id = ? `
    ).bind(address.toLowerCase(), id).run();
    return c.json({ success });
};

const getSettings = async (c: Context<HonoCustomType>) => {
    const { address, address_id } = c.get("jwtPayload")
    const msgs = i18n.getMessagesbyContext(c);
    if (address_id && address_id > 0) {
        try {
            const db_address_id = await c.env.DB.prepare(
                `SELECT id FROM address where id = ? `
            ).bind(address_id).first("id");
            if (!db_address_id) {
                return c.text(msgs.InvalidAddressMsg, 400)
            }
        } catch (error) {
            return c.text(msgs.InvalidAddressMsg, 400)
        }
    }
    try {
        if (!address_id) {
            const db_address_id = await c.env.DB.prepare(
                `SELECT id FROM address where name = ? `
            ).bind(address).first("id");
            if (!db_address_id) {
                return c.text(msgs.InvalidAddressMsg, 400)
            }
        }
    } catch (error) {
        return c.text(msgs.InvalidAddressMsg, 400)
    }

    updateAddressUpdatedAt(c, address);

    const { balance } = await getSendBalanceState(c, address);
    return c.json({
        address: address,
        send_balance: balance || 0,
    });
};

const deleteAddress = async (c: Context<HonoCustomType>) => {
    const { address, address_id } = c.get("jwtPayload")
    const success = await deleteAddressWithData(c, address, address_id);
    return c.json({ success });
};

const clearInbox = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    await c.env.DB.prepare(
        `DELETE FROM mail_read_states`
        + ` WHERE mail_id IN (SELECT id FROM raw_mails WHERE address = ?)`
    ).bind(address).run();
    const { success } = await c.env.DB.prepare(
        `DELETE FROM raw_mails WHERE address = ?`
    ).bind(address).run();
    if (!success) {
        return c.text(msgs.FailedClearInboxMsg, 500)
    }
    return c.json({ success });
};

const clearSentItems = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    const { success } = await c.env.DB.prepare(
        `DELETE FROM sendbox WHERE address = ?`
    ).bind(address).run();
    if (!success) {
        return c.text(msgs.FailedClearSentItemsMsg, 500)
    }
    return c.json({ success });
};

export default { listMails, getMail, updateReadState, deleteMail, getSettings, deleteAddress, clearInbox, clearSentItems };
