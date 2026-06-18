import { Context } from "hono";

import i18n from "../i18n";
import {
    generateShareToken,
    hashShareToken,
    normalizeShareScopes,
} from "../share_tokens";
import { recordAuditEvent } from "../audit";

type ShareTokenAdminRow = {
    id: number,
    address_id: number,
    address: string,
    label?: string | null,
    scopes?: string | null,
    expires_at?: string | null,
    revoked_at?: string | null,
    last_used_at?: string | null,
    created_at?: string | null,
}

const getAddressById = async (
    c: Context<HonoCustomType>,
    addressId: string | number
): Promise<{ id: number, name: string } | null> => {
    return await c.env.DB.prepare(
        `SELECT id, name FROM address WHERE id = ?`
    ).bind(addressId).first<{ id: number, name: string }>();
}

const list = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const address = await getAddressById(c, id);
    if (!address) {
        return c.text(i18n.getMessagesbyContext(c).AddressNotFoundMsg, 404);
    }
    const { results } = await c.env.DB.prepare(
        `SELECT id, address_id, label, scopes, expires_at, revoked_at, last_used_at, created_at`
        + ` FROM address_share_tokens`
        + ` WHERE address_id = ?`
        + ` ORDER BY id DESC`
    ).bind(id).all();
    return c.json({ address: address.name, results });
}

const create = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const msgs = i18n.getMessagesbyContext(c);
    const address = await getAddressById(c, id);
    if (!address) {
        return c.text(msgs.AddressNotFoundMsg, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 128) : "";
    const scopes = normalizeShareScopes(body.scopes);
    const expiresAt = typeof body.expires_at === "string" && body.expires_at.trim()
        ? body.expires_at.trim()
        : null;
    const token = generateShareToken();
    const tokenHash = await hashShareToken(token);
    const { success } = await c.env.DB.prepare(
        `INSERT INTO address_share_tokens`
        + ` (address_id, token_hash, label, scopes, expires_at)`
        + ` VALUES (?, ?, ?, ?, ?)`
    ).bind(address.id, tokenHash, label, scopes, expiresAt).run();
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500);
    }
    const tokenId = await c.env.DB.prepare(
        `SELECT id FROM address_share_tokens WHERE token_hash = ?`
    ).bind(tokenHash).first<number>("id");
    await recordAuditEvent(c, {
        action: "share.create",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "access_package",
        resource_id: tokenId || null,
        resource_label: label || address.name,
        status: "success",
        metadata: {
            address_id: address.id,
            address: address.name,
            scopes,
            expires_at: expiresAt,
        },
    });
    return c.json({
        id: tokenId,
        address: address.name,
        token,
        label,
        scopes,
        expires_at: expiresAt,
    });
}

const update = async (c: Context<HonoCustomType>) => {
    const { token_id } = c.req.param();
    const msgs = i18n.getMessagesbyContext(c);
    const body = await c.req.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 128) : "";
    const scopes = body.scopes === undefined ? null : normalizeShareScopes(body.scopes);
    const expiresAt = typeof body.expires_at === "string" && body.expires_at.trim()
        ? body.expires_at.trim()
        : null;
    const existing = await c.env.DB.prepare(
        `SELECT id FROM address_share_tokens WHERE id = ?`
    ).bind(token_id).first("id");
    if (!existing) {
        return c.text(msgs.ShareTokenNotFoundMsg, 404);
    }
    const { success } = await c.env.DB.prepare(
        `UPDATE address_share_tokens`
        + ` SET label = ?, expires_at = ?, scopes = COALESCE(?, scopes)`
        + ` WHERE id = ?`
    ).bind(label, expiresAt, scopes, token_id).run();
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500);
    }
    const row = await c.env.DB.prepare(
        `SELECT t.id, t.address_id, a.name AS address, t.label, t.scopes, t.expires_at, t.revoked_at, t.last_used_at, t.created_at`
        + ` FROM address_share_tokens t`
        + ` JOIN address a ON a.id = t.address_id`
        + ` WHERE t.id = ?`
    ).bind(token_id).first<ShareTokenAdminRow>();
    await recordAuditEvent(c, {
        action: "share.update",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "access_package",
        resource_id: token_id,
        resource_label: row?.label || row?.address || null,
        status: "success",
        metadata: {
            address_id: row?.address_id || null,
            scopes,
            expires_at: expiresAt,
        },
    });
    return c.json(row);
}

const revoke = async (c: Context<HonoCustomType>) => {
    const { token_id } = c.req.param();
    const row = await c.env.DB.prepare(
        `SELECT t.id, t.address_id, a.name AS address, t.label`
        + ` FROM address_share_tokens t`
        + ` JOIN address a ON a.id = t.address_id`
        + ` WHERE t.id = ?`
    ).bind(token_id).first<{ id: number, address_id: number, address: string, label?: string | null }>();
    const { success } = await c.env.DB.prepare(
        `UPDATE address_share_tokens`
        + ` SET revoked_at = datetime('now')`
        + ` WHERE id = ? AND revoked_at IS NULL`
    ).bind(token_id).run();
    await recordAuditEvent(c, {
        action: "share.revoke",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "access_package",
        resource_id: token_id,
        resource_label: row?.label || row?.address || null,
        status: success ? "success" : "failed",
        metadata: {
            address_id: row?.address_id || null,
            address: row?.address || null,
        },
    });
    return c.json({ success });
}

const revokeAll = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const address = await getAddressById(c, id);
    if (!address) {
        return c.text(i18n.getMessagesbyContext(c).AddressNotFoundMsg, 404);
    }
    const { success } = await c.env.DB.prepare(
        `UPDATE address_share_tokens`
        + ` SET revoked_at = datetime('now')`
        + ` WHERE address_id = ? AND revoked_at IS NULL`
    ).bind(id).run();
    await recordAuditEvent(c, {
        action: "share.revoke_all",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: address.id,
        resource_label: address.name,
        status: success ? "success" : "failed",
    });
    return c.json({ success });
}

export default { list, create, update, revoke, revokeAll };
