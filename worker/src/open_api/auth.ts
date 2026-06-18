import { Hono } from 'hono'
import { Jwt } from 'hono/utils/jwt'

import utils, { checkCfTurnstile, getPasswords, getAdminPasswords, hashPassword } from '../utils';
import i18n from '../i18n';
import { recordAccessEvent } from '../audit';

const api = new Hono<HonoCustomType>()

api.post('/open_api/site_login', async (c) => {
    const { password, cf_token } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    if (utils.isGlobalTurnstileEnabled(c)) {
        try {
            await checkCfTurnstile(c, cf_token);
        } catch (error) {
            await recordAccessEvent(c, {
                event_type: "site.login.failed",
                actor_type: "site",
                status: "failed",
                failure_reason: "turnstile_failed",
            });
            return c.text(msgs.TurnstileCheckFailedMsg, 400)
        }
    }
    const passwords = getPasswords(c);
    const hashedPasswords = await Promise.all(passwords.map(p => hashPassword(p)));
    if (!hashedPasswords.length || !password || !hashedPasswords.includes(password)) {
        await recordAccessEvent(c, {
            event_type: "site.login.failed",
            actor_type: "site",
            status: "failed",
            failure_reason: "invalid_password",
        });
        return c.text(msgs.CustomAuthPasswordMsg, 401)
    }
    await recordAccessEvent(c, {
        event_type: "site.login.success",
        actor_type: "site",
        status: "success",
    });
    return c.json({ success: true })
})

api.post('/open_api/admin_login', async (c) => {
    const { password, cf_token } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    if (utils.isGlobalTurnstileEnabled(c)) {
        try {
            await checkCfTurnstile(c, cf_token);
        } catch (error) {
            await recordAccessEvent(c, {
                event_type: "admin.login.failed",
                actor_type: "admin",
                status: "failed",
                failure_reason: "turnstile_failed",
            });
            return c.text(msgs.TurnstileCheckFailedMsg, 400)
        }
    }
    const adminPasswords = getAdminPasswords(c);
    const hashedPasswords = await Promise.all(adminPasswords.map(p => hashPassword(p)));
    if (!hashedPasswords.length || !password || !hashedPasswords.includes(password)) {
        await recordAccessEvent(c, {
            event_type: "admin.login.failed",
            actor_type: "admin",
            status: "failed",
            failure_reason: "invalid_password",
        });
        return c.text(msgs.NeedAdminPasswordMsg, 401)
    }
    await recordAccessEvent(c, {
        event_type: "admin.login.success",
        actor_type: "admin",
        status: "success",
    });
    return c.json({ success: true })
})

api.post('/open_api/credential_login', async (c) => {
    const { credential, cf_token } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    if (utils.isGlobalTurnstileEnabled(c)) {
        try {
            await checkCfTurnstile(c, cf_token);
        } catch (error) {
            await recordAccessEvent(c, {
                event_type: "address.credential_login.failed",
                actor_type: "address",
                status: "failed",
                failure_reason: "turnstile_failed",
            });
            return c.text(msgs.TurnstileCheckFailedMsg, 400)
        }
    }
    if (!credential) {
        await recordAccessEvent(c, {
            event_type: "address.credential_login.failed",
            actor_type: "address",
            status: "failed",
            failure_reason: "missing_credential",
        });
        return c.text(msgs.InvalidAddressCredentialMsg, 401)
    }
    try {
        const payload = await Jwt.verify(credential, c.env.JWT_SECRET, "HS256") as Partial<JwtPayload>;
        if (!payload.address) {
            await recordAccessEvent(c, {
                event_type: "address.credential_login.failed",
                actor_type: "address",
                status: "failed",
                failure_reason: "missing_address_claim",
            });
            return c.text(msgs.InvalidAddressCredentialMsg, 401)
        }
        await recordAccessEvent(c, {
            event_type: "address.credential_login.success",
            actor_type: payload.share_token_id ? "share_token" : "address",
            actor_id: payload.share_token_id || payload.address_id || null,
            actor_label: payload.address,
            resource_type: "address",
            resource_id: payload.address_id || null,
            resource_label: payload.address,
            status: "success",
            metadata: payload.share_token_id ? { share_token_id: payload.share_token_id } : undefined,
        });
    } catch (error) {
        await recordAccessEvent(c, {
            event_type: "address.credential_login.failed",
            actor_type: "address",
            status: "failed",
            failure_reason: "invalid_credential",
        });
        return c.text(msgs.InvalidAddressCredentialMsg, 401)
    }
    return c.json({ success: true })
})

export { api }
