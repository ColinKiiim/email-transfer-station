import { Context } from "hono";
import i18n from "../i18n";
import UserBindAddressModule from "./bind_address";
import { getBooleanValue } from "../utils";
import {
    getUserMailReadActor,
    listRawMailsWithReadState,
    readStateFromRequest,
    updateRawMailReadState,
} from "../mail_read_state";

export default {
    getMails: async (c: Context<HonoCustomType>) => {
        const userPayload = c.get("userPayload");
        const { user_id } = userPayload;
        const { address, limit, offset } = c.req.query();
        const bindedAddressList = await UserBindAddressModule.getBindedAddressListById(c, user_id);
        const addressList = address ? bindedAddressList.filter((item) => item == address) : bindedAddressList;
        const addressQuery = `r.address IN (${addressList.map(() => "?").join(",")})`;
        const addressParams = addressList;

        // user must have at least one binded address to query mails
        if (addressList.length <= 0) {
            return c.json({ results: [], count: 0, unread_count: 0 });
        }

        const filterQuerys = [addressQuery].filter((item) => item).join(" and ");
        const finalQuery = filterQuerys.length > 0 ? `WHERE ${filterQuerys}` : "";
        const filterParams = [...addressParams]
        return await listRawMailsWithReadState(
            c,
            getUserMailReadActor(userPayload),
            finalQuery,
            filterParams,
            limit,
            offset,
        );
    },
    updateReadState: async (c: Context<HonoCustomType>) => {
        const userPayload = c.get("userPayload");
        const { user_id } = userPayload;
        const { id } = c.req.param();
        const bindedAddressList = await UserBindAddressModule.getBindedAddressListById(c, user_id);
        if (bindedAddressList.length <= 0) {
            return c.json({ success: false, error: "Mail not found" }, 404);
        }
        const read = await readStateFromRequest(c);
        return updateRawMailReadState(
            c,
            getUserMailReadActor(userPayload),
            id,
            `AND address IN (${bindedAddressList.map(() => "?").join(",")})`,
            bindedAddressList,
            read,
        );
    },
    deleteMail: async (c: Context<HonoCustomType>) => {
        const msgs = i18n.getMessagesbyContext(c);
        if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
            return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
        }
        const { id } = c.req.param();
        const { user_id } = c.get("userPayload");
        const bindedAddressList = await UserBindAddressModule.getBindedAddressListById(c, user_id);
        if (bindedAddressList.length <= 0) {
            return c.json({ success: false });
        }
        await c.env.DB.prepare(
            `DELETE FROM mail_read_states`
            + ` WHERE mail_id IN (SELECT id FROM raw_mails WHERE id = ?`
            + ` and address IN (${bindedAddressList.map(() => "?").join(",")}))`
        ).bind(id, ...bindedAddressList).run();
        const { success } = await c.env.DB.prepare(
            `DELETE FROM raw_mails WHERE id = ?`
            + ` and address IN (${bindedAddressList.map(() => "?").join(",")})`
        ).bind(id, ...bindedAddressList).run();
        return c.json({
            success: success
        })
    }
}
