import { Context, Hono } from 'hono'
import utils, { checkCfTurnstile, getPasswords, getAdminPasswords, hashPassword, getStringArray } from '../utils';
import i18n from '../i18n';
import { recordAccessEvent } from '../audit';
import { issueAdminSession } from '../admin_security';

const api = new Hono<HonoCustomType>()

const getAdminUsernames = (c: Context<HonoCustomType>): string[] => {
    const configured = getStringArray(c.env.ADMIN_USERNAMES);
    return configured.length > 0 ? configured : ["admin"];
}

const normalizeAdminUsername = (value: unknown): string => (
    typeof value === "string" ? value.trim().toLowerCase() : ""
)

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

api.get('/open_api/admin_login_settings', async (c) => {
    return c.json({
        enableGlobalTurnstileCheck: utils.isGlobalTurnstileEnabled(c),
        cfTurnstileSiteKey: c.env.CF_TURNSTILE_SITE_KEY || "",
        accountHint: getAdminUsernames(c).length === 1 ? getAdminUsernames(c)[0] : "",
    })
})

api.post('/open_api/admin_login', async (c) => {
    c.header("Cache-Control", "no-store");
    const { username, password, cf_token } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    const normalizedUsername = normalizeAdminUsername(username);
    const adminUsernames = getAdminUsernames(c).map(normalizeAdminUsername);
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
    if (
        !adminUsernames.length
        || !normalizedUsername
        || !adminUsernames.includes(normalizedUsername)
        || !hashedPasswords.length
        || !password
        || !hashedPasswords.includes(password)
    ) {
        await recordAccessEvent(c, {
            event_type: "admin.login.failed",
            actor_type: "admin",
            actor_label: normalizedUsername || null,
            status: "failed",
            failure_reason: "invalid_account_or_password",
        });
        return c.text(msgs.NeedAdminPasswordMsg, 401)
    }
    await recordAccessEvent(c, {
        event_type: "admin.login.success",
        actor_type: "admin",
        actor_label: normalizedUsername,
        status: "success",
    });
    const token = await issueAdminSession(normalizedUsername, c.env.JWT_SECRET);
    return c.json({ success: true, token, username: normalizedUsername })
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
