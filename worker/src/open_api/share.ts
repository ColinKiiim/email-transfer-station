import { Hono } from 'hono'

import i18n from '../i18n';
import { findActiveShareToken, issueAddressJwtForShareToken } from '../share_tokens';
import { recordAccessEvent } from '../audit';

const api = new Hono<HonoCustomType>()

api.get('/open_api/share/:token', async (c) => {
    const { token } = c.req.param();
    const msgs = i18n.getMessagesbyContext(c);
    if (!token || token.length < 16 || token.length > 256) {
        await recordAccessEvent(c, {
            event_type: "share.open.failed",
            actor_type: "share_token",
            status: "failed",
            failure_reason: "invalid_token_format",
        });
        return c.text(msgs.InvalidAddressTokenMsg, 401);
    }
    const row = await findActiveShareToken(c, token);
    if (!row || !row.address) {
        await recordAccessEvent(c, {
            event_type: "share.open.failed",
            actor_type: "share_token",
            status: "failed",
            failure_reason: "token_not_found_or_inactive",
        });
        return c.text(msgs.InvalidAddressTokenMsg, 401);
    }
    await c.env.DB.prepare(
        `UPDATE address_share_tokens SET last_used_at = datetime('now') WHERE id = ?`
    ).bind(row.id).run();
    const jwt = await issueAddressJwtForShareToken(c, row);
    await recordAccessEvent(c, {
        event_type: "share.open.success",
        actor_type: "share_token",
        actor_id: row.id,
        actor_label: row.label || row.address,
        resource_type: "address",
        resource_id: row.address_id,
        resource_label: row.address,
        status: "success",
        metadata: {
            scopes: row.scopes || "read",
            expires_at: row.expires_at || null,
        },
    });
    return c.json({
        address: row.address,
        jwt,
        label: row.label || "",
        scopes: row.scopes || "read",
        expires_at: row.expires_at || null,
    });
})

export { api }
