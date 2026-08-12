import { Context } from 'hono';
import i18n from '../i18n';
import utils, { getBooleanValue, checkCfTurnstile } from '../utils';
import { issueAddressJwt } from '../common';
import { recordAccessEvent, recordAuditEvent } from '../audit';
import {
    createAddressPasswordRecord,
    isAddressPasswordV2Enabled,
    normalizeAddressPasswordInput,
    verifyAddressPassword,
} from '../address_password';

export default {
    // 修改地址密码
    changePassword: async (c: Context<HonoCustomType>) => {
        const { new_password, password_format } = await c.req.json();
        const msgs = i18n.getMessagesbyContext(c);
        const { address, address_id } = c.get("jwtPayload");

        // 检查功能是否启用
        if (!getBooleanValue(c.env.ENABLE_ADDRESS_PASSWORD)) {
            return c.text(msgs.PasswordChangeDisabledMsg, 403);
        }

        let passwordInput;
        try {
            passwordInput = normalizeAddressPasswordInput(new_password, password_format);
        } catch {
            return c.text(msgs.NewPasswordRequiredMsg, 400);
        }

        if (!address || !address_id) {
            return c.text(msgs.InvalidAddressTokenMsg, 400);
        }

        const storedPassword = await createAddressPasswordRecord(
            passwordInput,
            isAddressPasswordV2Enabled(c.env.ENABLE_ADDRESS_PASSWORD_V2),
        );
        // Changing the password revokes previously issued Address JWTs, so any
        // other device holding one is signed out. The caller gets a fresh token
        // below so the session it is changing from survives.
        const { success } = await c.env.DB.prepare(
            `UPDATE address SET password = ?, credential_version = COALESCE(credential_version, 1) + 1,`
            + ` updated_at = datetime('now') WHERE id = ?`
        ).bind(storedPassword, address_id).run();

        if (!success) {
            return c.text(msgs.FailedUpdatePasswordMsg, 500);
        }

        await recordAuditEvent(c, {
            action: "address.password.change",
            actor_type: "address",
            actor_id: address_id,
            actor_label: address,
            resource_type: "address",
            resource_id: address_id,
            resource_label: address,
            status: "success",
        });

        const jwt = await issueAddressJwt(c, address, address_id);
        return c.json({ success: true, jwt });
    },

    // 地址密码登录
    login: async (c: Context<HonoCustomType>) => {
        const { email, password, password_format, cf_token } = await c.req.json();
        const msgs = i18n.getMessagesbyContext(c);

        // 检查功能是否启用
        if (!getBooleanValue(c.env.ENABLE_ADDRESS_PASSWORD)) {
            await recordAccessEvent(c, {
                event_type: "address.password_login.failed",
                actor_type: "address",
                actor_label: email || null,
                resource_type: "address",
                resource_label: email || null,
                status: "failed",
                failure_reason: "password_login_disabled",
            });
            return c.text(msgs.PasswordLoginDisabledMsg, 403);
        }

        if (!email || !password) {
            await recordAccessEvent(c, {
                event_type: "address.password_login.failed",
                actor_type: "address",
                actor_label: email || null,
                resource_type: "address",
                resource_label: email || null,
                status: "failed",
                failure_reason: "missing_email_or_password",
            });
            return c.text(msgs.EmailPasswordRequiredMsg, 400);
        }

        let passwordInput;
        try {
            passwordInput = normalizeAddressPasswordInput(password, password_format);
        } catch {
            await recordAccessEvent(c, {
                event_type: "address.password_login.failed",
                actor_type: "address",
                actor_label: email,
                resource_type: "address",
                resource_label: email,
                status: "failed",
                failure_reason: "invalid_password_format",
            });
            return c.text(msgs.InvalidEmailOrPasswordMsg, 401);
        }

        // check cf turnstile if global turnstile is enabled
        if (utils.isGlobalTurnstileEnabled(c)) {
            try {
                await checkCfTurnstile(c, cf_token);
            } catch (error) {
                await recordAccessEvent(c, {
                    event_type: "address.password_login.failed",
                    actor_type: "address",
                    actor_label: email,
                    resource_type: "address",
                    resource_label: email,
                    status: "failed",
                    failure_reason: "turnstile_failed",
                });
                return c.text(msgs.TurnstileCheckFailedMsg, 400)
            }
        }

        // 查找地址
        const address = await c.env.DB.prepare(
            `SELECT * FROM address WHERE name = ?`
        ).bind(email).first<{
            id: number,
            name: string,
            password: string | null,
            credential_version: number,
        }>();

        if (!address) {
            await recordAccessEvent(c, {
                event_type: "address.password_login.failed",
                actor_type: "address",
                actor_label: email,
                resource_type: "address",
                resource_label: email,
                status: "failed",
                failure_reason: "address_not_found",
            });
            return c.text(msgs.AddressNotFoundMsg, 404);
        }

        const verification = await verifyAddressPassword(
            address.password,
            passwordInput,
            isAddressPasswordV2Enabled(c.env.ENABLE_ADDRESS_PASSWORD_V2),
        );
        if (!verification.valid) {
            await recordAccessEvent(c, {
                event_type: "address.password_login.failed",
                actor_type: "address",
                actor_id: address.id as number,
                actor_label: address.name as string,
                resource_type: "address",
                resource_id: address.id as number,
                resource_label: address.name as string,
                status: "failed",
                failure_reason: "invalid_password",
            });
            return c.text(msgs.InvalidEmailOrPasswordMsg, 401);
        }

        if (verification.upgradedRecord) {
            const upgrade = await c.env.DB.prepare(
                `UPDATE address SET password = ?, updated_at = datetime('now') WHERE id = ? AND password = ?`
            ).bind(verification.upgradedRecord, address.id, address.password).run();
            if (upgrade.success && (upgrade.meta.changes || 0) > 0) {
                await recordAuditEvent(c, {
                    action: "address.password.upgrade",
                    actor_type: "address",
                    actor_id: address.id,
                    actor_label: address.name,
                    resource_type: "address",
                    resource_id: address.id,
                    resource_label: address.name,
                    status: "success",
                    metadata: {
                        from: verification.storedMode,
                        to: passwordInput.mode,
                    },
                });
            }
        }

        const jwt = await issueAddressJwt(c, address.name, address.id, address.credential_version);
        await recordAccessEvent(c, {
            event_type: "address.password_login.success",
            actor_type: "address",
            actor_id: address.id as number,
            actor_label: address.name as string,
            resource_type: "address",
            resource_id: address.id as number,
            resource_label: address.name as string,
            status: "success",
        });

        return c.json({
            jwt: jwt,
            address: address.name
        });
    }
};
