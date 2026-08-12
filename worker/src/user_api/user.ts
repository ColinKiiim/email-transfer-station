import { Context } from 'hono';

import i18n from '../i18n';
import utils, { checkCfTurnstile, getJsonSetting, checkUserPassword, getUserRoles, getStringValue } from "../utils"
import { CONSTANTS } from "../constants";
import { GeoData, UserInfo, UserSettings } from "../models";
import { sendMail } from "../mails_api/send_mail_api";
import { recordAccessEvent, recordAuditEvent } from "../audit";
import { secureRandomInt } from "../security_random";
import { issueUserJwt } from "../user_identity";
import { createUserPasswordRecord, verifyUserPasswordRecord } from "../user_password";
import {
    consumeUserVerificationChallenge,
    releaseUserVerificationChallenge,
    reserveUserVerificationChallenge,
} from "../user_verification";

export default {
    verifyCode: async (c: Context<HonoCustomType>) => {
        const { email, cf_token } = await c.req.json();
        const msgs = i18n.getMessagesbyContext(c);
        // check cf turnstile
        try {
            await checkCfTurnstile(c, cf_token);
        } catch (error) {
            return c.text(msgs.TurnstileCheckFailedMsg, 400)
        }
        const value = await getJsonSetting(c, CONSTANTS.USER_SETTINGS_KEY);
        const settings = new UserSettings(value)
        // check mail domain allow list
        const mailDomain = email.split("@")[1];
        if (settings.enableMailAllowList
            && settings.mailAllowList
            && !settings.mailAllowList.includes(mailDomain)
        ) {
            return c.text(`${msgs.UserMailDomainMustInMsg} ${JSON.stringify(settings.mailAllowList, null, 2)}`, 400)
        }
        // check email regex
        if (settings.enableEmailCheckRegex && settings.emailCheckRegex) {
            try {
                const regex = new RegExp(settings.emailCheckRegex);
                if (!regex.test(email)) {
                    return c.text(`${msgs.UserEmailNotMatchRegexMsg}: /${settings.emailCheckRegex}/`, 400)
                }
            } catch (e) {
                console.error("Failed to check user email regex", e);
            }
        }
        if (!settings.verifyMailSender) {
            return c.text(msgs.VerifyMailSenderNotSetMsg, 400)
        }
        // Reserve the address/purpose generation before sending. D1's unique
        // constraint makes concurrent requests select exactly one live code.
        const code = (100000 + secureRandomInt(900000)).toString();
        if (!await reserveUserVerificationChallenge(c.env.DB, email, code)) {
            return c.text(msgs.CodeAlreadySentMsg, 400)
        }
        // send code to email
        try {
            await sendMail(c, settings.verifyMailSender, {
                from_name: "Temp Mail Verify",
                to_name: '',
                to_mail: email as string,
                subject: "Temp Mail Verify code",
                content: `Your verify code is ${code}`,
                is_html: false,
            })
        } catch (e) {
            try {
                await releaseUserVerificationChallenge(c.env.DB, email, code);
            } catch (releaseError) {
                console.error("Failed to release verify code reservation", releaseError);
            }
            return c.text(`Failed to send verify code: ${(e as Error).message}`, 500)
        }
        return c.json({
            success: true,
            expirationTtl: 300
        })
    },
    register: async (c: Context<HonoCustomType>) => {
        const value = await getJsonSetting(c, CONSTANTS.USER_SETTINGS_KEY);
        const settings = new UserSettings(value)
        const msgs = i18n.getMessagesbyContext(c);
        // check enable
        if (!settings.enable) {
            return c.text(msgs.UserRegistrationDisabledMsg, 403);
        }
        // check request
        const { email, password, code, cf_token } = await c.req.json();
        if (!email || !password) {
            return c.text(msgs.InvalidEmailOrPasswordMsg, 400)
        }
        checkUserPassword(password);
        // check cf turnstile only when mail verify is disabled
        // (when enabled, verify_code endpoint already checks turnstile)
        if (!settings.enableMailVerify) {
            try {
                await checkCfTurnstile(c, cf_token);
            } catch (error) {
                return c.text(msgs.TurnstileCheckFailedMsg, 400)
            }
        }
        if (settings.enableMailVerify && !code) {
            return c.text(msgs.InvalidVerifyCodeMsg, 400)
        }
        // check mail domain allow list
        const mailDomain = email.split("@")[1];
        if (settings.enableMailAllowList
            && settings.mailAllowList
            && !settings.mailAllowList.includes(mailDomain)
        ) {
            return c.text(`${msgs.UserMailDomainMustInMsg} ${JSON.stringify(settings.mailAllowList, null, 2)}`, 400)
        }
        // check email regex
        if (settings.enableEmailCheckRegex && settings.emailCheckRegex) {
            try {
                const regex = new RegExp(settings.emailCheckRegex);
                if (!regex.test(email)) {
                    return c.text(`${msgs.UserEmailNotMatchRegexMsg}: /${settings.emailCheckRegex}/`, 400)
                }
            } catch (e) {
                console.error("Failed to check user email regex", e);
            }
        }
        // check code
        if (settings.enableMailVerify) {
            if (!await consumeUserVerificationChallenge(c.env.DB, email, code)) {
                return c.text(msgs.InvalidVerifyCodeMsg, 400)
            }
        }
        const passwordRecord = await createUserPasswordRecord(password);
        // geo data
        const reqIp = c.req.raw.headers.get("cf-connecting-ip")
        const geoData = new GeoData(reqIp, c.req.raw.cf as any);
        const userInfo = new UserInfo(geoData, email);
        // if not enable mail verify, do not on conflict update
        if (!settings.enableMailVerify) {
            try {
                const { success } = await c.env.DB.prepare(
                    `INSERT INTO users (user_email, password, user_info)`
                    + ` VALUES (?, ?, ?)`
                ).bind(
                    email, passwordRecord, JSON.stringify(userInfo)
                ).run();
                if (!success) {
                    return c.text(msgs.FailedToRegisterMsg, 500)
                }
            } catch (e) {
                const error = e as Error;
                if (error.message && error.message.includes("UNIQUE")) {
                    return c.text(msgs.UserAlreadyExistsMsg, 400)
                }
                return c.text(`${msgs.FailedToRegisterMsg}: ${error.message}`, 500)
            }
            const user_id = await c.env.DB.prepare(
                `SELECT id FROM users where user_email = ?`
            ).bind(email).first<number | undefined | null>("id");
            await recordAuditEvent(c, {
                action: "user.register",
                actor_type: "user",
                actor_id: user_id || null,
                actor_label: email,
                resource_type: "user",
                resource_id: user_id || null,
                resource_label: email,
                status: "success",
            });
            return c.json({ success: true })
        }
        // if enable mail verify, on conflict update
        const { success } = await c.env.DB.prepare(
            `INSERT INTO users (user_email, password, user_info)`
            + ` VALUES (?, ?, ?)`
            + ` ON CONFLICT(user_email) DO UPDATE SET password = ?, user_info = ?, updated_at = datetime('now')`
        ).bind(
            email, passwordRecord, JSON.stringify(userInfo),
            passwordRecord, JSON.stringify(userInfo)
        ).run();
        if (!success) {
            return c.text(msgs.FailedToRegisterMsg, 400);
        }
        const user_id = await c.env.DB.prepare(
            `SELECT id FROM users where user_email = ?`
        ).bind(email).first<number | undefined | null>("id");
        if (!user_id) {
            return c.text(msgs.UserNotFoundMsg, 500);
        }
        const defaultRole = getStringValue(c.env.USER_DEFAULT_ROLE);
        if (!defaultRole) {
            await recordAuditEvent(c, {
                action: "user.register",
                actor_type: "user",
                actor_id: user_id,
                actor_label: email,
                resource_type: "user",
                resource_id: user_id,
                resource_label: email,
                status: "success",
            });
            return c.json({ success: true })
        }
        const user_roles = getUserRoles(c);
        if (!user_roles.find((r) => r.role === defaultRole)) {
            return c.text(msgs.InvalidUserDefaultRoleMsg, 500);
        }
        // update user roles
        const { success: success2 } = await c.env.DB.prepare(
            `INSERT INTO user_roles (user_id, role_text)`
            + ` VALUES (?, ?)`
            + ` ON CONFLICT(user_id) DO NOTHING`
        ).bind(user_id, defaultRole).run();
        if (!success2) {
            return c.text(msgs.FailedUpdateUserDefaultRoleMsg, 500);
        }
        await recordAuditEvent(c, {
            action: "user.register",
            actor_type: "user",
            actor_id: user_id,
            actor_label: email,
            resource_type: "user",
            resource_id: user_id,
            resource_label: email,
            status: "success",
            metadata: { default_role: defaultRole },
        });
        return c.json({ success: true })
    },
    login: async (c: Context<HonoCustomType>) => {
        const { email, password, cf_token } = await c.req.json();
        const msgs = i18n.getMessagesbyContext(c);
        if (!email || !password) {
            await recordAccessEvent(c, {
                event_type: "user.login.failed",
                actor_type: "user",
                actor_label: email || null,
                resource_type: "user",
                resource_label: email || null,
                status: "failed",
                failure_reason: "missing_email_or_password",
            });
            return c.text(msgs.InvalidEmailOrPasswordMsg, 400);
        }
        // check cf turnstile if global turnstile is enabled
        if (utils.isGlobalTurnstileEnabled(c)) {
            try {
                await checkCfTurnstile(c, cf_token);
            } catch (error) {
                await recordAccessEvent(c, {
                    event_type: "user.login.failed",
                    actor_type: "user",
                    actor_label: email,
                    resource_type: "user",
                    resource_label: email,
                    status: "failed",
                    failure_reason: "turnstile_failed",
                });
                return c.text(msgs.TurnstileCheckFailedMsg, 400)
            }
        }
        const { id: user_id, password: dbPassword } = await c.env.DB.prepare(
            `SELECT id, password FROM users where user_email = ?`
        ).bind(email).first<{ id: number, password: string }>() || {};
        if (!dbPassword) {
            await recordAccessEvent(c, {
                event_type: "user.login.failed",
                actor_type: "user",
                actor_label: email,
                resource_type: "user",
                resource_label: email,
                status: "failed",
                failure_reason: "user_not_found",
            });
            return c.text(msgs.InvalidEmailOrPasswordMsg, 400)
        }
        const passwordResult = await verifyUserPasswordRecord(dbPassword, password);
        if (!passwordResult.valid) {
            await recordAccessEvent(c, {
                event_type: "user.login.failed",
                actor_type: "user",
                actor_id: user_id,
                actor_label: email,
                resource_type: "user",
                resource_id: user_id,
                resource_label: email,
                status: "failed",
                failure_reason: "invalid_password",
            });
            return c.text(msgs.InvalidEmailOrPasswordMsg, 400)
        }
        if (passwordResult.upgradedRecord) {
            const upgrade = await c.env.DB.prepare(
                `UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ? AND password = ?`
            ).bind(passwordResult.upgradedRecord, user_id, dbPassword).run();
            if (!upgrade.success || Number(upgrade.meta?.changes || 0) !== 1) {
                return c.text(msgs.InvalidEmailOrPasswordMsg, 400)
            }
        }
        // create jwt
        const jwt = await issueUserJwt(c, user_id as number, email);
        await recordAccessEvent(c, {
            event_type: "user.login.success",
            actor_type: "user",
            actor_id: user_id,
            actor_label: email,
            resource_type: "user",
            resource_id: user_id,
            resource_label: email,
            status: "success",
        });
        return c.json({
            jwt: jwt
        })
    },
}
