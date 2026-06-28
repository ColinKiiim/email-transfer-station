import { Context } from 'hono'

import i18n from '../i18n'
import { getBooleanValue } from '../utils'
import { newAddress, issueAddressJwt, hideObjectFields } from '../common'
import { recordAuditEvent } from '../audit'

const normalizeLabelNames = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter((item) => item.length > 0)
        .slice(0, 20)
        .map((item) => item.slice(0, 128))
    )];
}

const getAddressLabels = async (
    c: Context<HonoCustomType>,
    addressId: number | string
): Promise<{ id: number, name: string, color?: string | null }[]> => {
    const { results } = await c.env.DB.prepare(
        `SELECT l.id, l.name, l.color`
        + ` FROM labels l`
        + ` JOIN address_labels al ON al.label_id = l.id`
        + ` WHERE al.address_id = ?`
        + ` ORDER BY l.name COLLATE NOCASE ASC`
    ).bind(addressId).all<{ id: number, name: string, color?: string | null }>();
    return results || [];
}

const syncAddressLabels = async (
    c: Context<HonoCustomType>,
    addressId: number | string,
    labels: string[]
) => {
    for (const label of labels) {
        await c.env.DB.prepare(
            `INSERT INTO labels(name) VALUES (?)`
            + ` ON CONFLICT(name) DO UPDATE SET updated_at = datetime('now')`
        ).bind(label).run();
    }
    await c.env.DB.prepare(
        `DELETE FROM address_labels WHERE address_id = ?`
    ).bind(addressId).run();
    if (labels.length === 0) return;
    const placeholders = labels.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(
        `SELECT id FROM labels WHERE name IN (${placeholders})`
    ).bind(...labels).all<{ id: number }>();
    for (const row of results || []) {
        await c.env.DB.prepare(
            `INSERT OR IGNORE INTO address_labels(address_id, label_id) VALUES (?, ?)`
        ).bind(addressId, row.id).run();
    }
}

const listAddressLabels = async (c: Context<HonoCustomType>) => {
    try {
        const { results } = await c.env.DB.prepare(
            `SELECT l.name AS value, COUNT(al.address_id) AS usage_count`
            + ` FROM labels l`
            + ` JOIN address_labels al ON al.label_id = l.id`
            + ` JOIN address a ON a.id = al.address_id`
            + ` GROUP BY l.id, l.name`
            + ` ORDER BY l.name COLLATE NOCASE ASC`
            + ` LIMIT 200`
        ).all<{ value: string, usage_count: number }>();
        return c.json({
            results: (results || []).map((row) => ({
                label: `${row.value} (${row.usage_count})`,
                value: row.value,
                usage_count: row.usage_count,
            })),
        });
    } catch (error) {
        console.warn("[listAddressLabels] falling back to display_label", error);
        const { results } = await c.env.DB.prepare(
            `SELECT DISTINCT display_label AS value`
            + ` FROM address`
            + ` WHERE display_label IS NOT NULL AND trim(display_label) != ''`
            + ` ORDER BY display_label COLLATE NOCASE ASC`
            + ` LIMIT 200`
        ).all<{ value: string }>();
        return c.json({
            results: (results || []).map((row) => ({
                label: row.value,
                value: row.value,
            })),
        });
    }
};

const deleteAddressLabel = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { label } = await c.req.json().catch(() => ({}));
    const labelName = typeof label === "string" ? label.trim().slice(0, 128) : "";
    if (!labelName) {
        return c.text(msgs.RequiredFieldMsg, 400);
    }
    const labelRow = await c.env.DB.prepare(
        `SELECT id FROM labels WHERE name = ?`
    ).bind(labelName).first<{ id: number }>();
    if (!labelRow) {
        return c.json({ success: true, removed: 0 });
    }
    const affected = await c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM address_labels WHERE label_id = ?`
    ).bind(labelRow.id).first<number>("count");
    await c.env.DB.prepare(
        `DELETE FROM address_labels WHERE label_id = ?`
    ).bind(labelRow.id).run();
    await c.env.DB.prepare(
        `DELETE FROM labels WHERE id = ?`
    ).bind(labelRow.id).run();
    await c.env.DB.prepare(
        `UPDATE address`
        + ` SET display_label = COALESCE((`
        + ` SELECT l.name`
        + ` FROM address_labels al`
        + ` JOIN labels l ON l.id = al.label_id`
        + ` WHERE al.address_id = address.id`
        + ` ORDER BY l.name COLLATE NOCASE ASC`
        + ` LIMIT 1`
        + `), ''), updated_at = datetime('now')`
        + ` WHERE display_label = ?`
    ).bind(labelName).run();
    await recordAuditEvent(c, {
        action: "address.label.delete",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address_label",
        resource_label: labelName,
        status: "success",
        metadata: { removed: affected || 0 },
    });
    return c.json({ success: true, removed: affected || 0 });
};

const listAddresses = async (c: Context<HonoCustomType>) => {
    const { limit, offset, query, label, sort_by, sort_order } = c.req.query();
    const allowedSortColumns: Record<string, string> = {
        'id': 'a.id',
        'name': 'a.name',
        'display_label': 'a.display_label',
        'created_at': 'a.created_at',
        'updated_at': 'a.updated_at',
        'source_meta': 'a.source_meta',
        'mail_count': 'mail_count',
        'send_count': 'send_count',
    };
    const sortColumn = Object.hasOwn(allowedSortColumns, sort_by) ? allowedSortColumns[sort_by] : 'a.id';
    const sortDirection = sort_order === 'ascend' ? 'asc' : 'desc';
    const orderBy = `${sortColumn} ${sortDirection}`;
    const whereClauses: string[] = [];
    const params: string[] = [];
    if (query) {
        // D1 caps LIKE pattern length at 50 bytes; fall back to instr() for
        // longer queries to avoid "LIKE or GLOB pattern too complex" (#956).
        const useInstr = new TextEncoder().encode(query).length + 2 > 50;
        const whereClause = useInstr ? `instr(a.name, ?) > 0` : `a.name like ?`;
        const param = useInstr ? query : `%${query}%`;
        whereClauses.push(whereClause);
        params.push(param);
    }
    const labelList = typeof label === 'string'
        ? label.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20)
        : [];
    if (labelList.length > 0) {
        const placeholders = labelList.map(() => '?').join(',');
        whereClauses.push(
            `(a.id IN (`
            + `SELECT al.address_id FROM address_labels al`
            + ` JOIN labels l ON l.id = al.label_id`
            + ` WHERE l.name IN (${placeholders})`
            + `) OR a.display_label IN (${placeholders}))`
        );
        params.push(...labelList, ...labelList);
    }
    const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
    const msgs = i18n.getMessagesbyContext(c);
    const normalizedLimit = Number(limit);
    const normalizedOffset = Number(offset);
    if (!normalizedLimit || normalizedLimit < 0 || normalizedLimit > 100) {
        return c.text(msgs.InvalidLimitMsg, 400);
    }
    if (!Number.isFinite(normalizedOffset) || normalizedOffset < 0) {
        return c.text(msgs.InvalidOffsetMsg, 400);
    }
    const baseQuery = `SELECT a.*,`
        + ` COALESCE((SELECT json_group_array(json_object('id', l.id, 'name', l.name, 'color', l.color))`
        + ` FROM address_labels al JOIN labels l ON l.id = al.label_id`
        + ` WHERE al.address_id = a.id), '[]') AS labels_json,`
        + ` (SELECT COUNT(*) FROM raw_mails WHERE address = a.name) AS mail_count,`
        + ` (SELECT COUNT(*) FROM sendbox WHERE address = a.name) AS send_count,`
        + ` (SELECT COUNT(*) FROM address_share_tokens WHERE address_id = a.id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))) AS active_share_token_count`
        + ` FROM address a`
        + whereSql;
    const { results } = await c.env.DB.prepare(
        `${baseQuery} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).bind(...params, normalizedLimit, normalizedOffset).all<any>();
    const count = normalizedOffset === 0 ? await c.env.DB.prepare(
        `SELECT count(*) as count FROM address a` + whereSql
    ).bind(...params).first<number>("count") : 0;
    return c.json({
        results: (results || []).map((row) => {
            const labels = JSON.parse(row.labels_json || '[]');
            delete row.labels_json;
            const filtered = hideObjectFields(row, ['password']);
            return {
                ...filtered,
                labels,
                display_label: filtered.display_label || labels?.[0]?.name || '',
            };
        }),
        count,
    });
};

const updateAddress = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const msgs = i18n.getMessagesbyContext(c);
    const body = await c.req.json().catch(() => ({}));
    const labels = Array.isArray(body.labels) ? normalizeLabelNames(body.labels) : null;
    const displayLabel = labels
        ? labels[0] || ""
        : typeof body.display_label === "string"
        ? body.display_label.trim().slice(0, 128)
        : "";
    const ownerNote = typeof body.owner_note === "string"
        ? body.owner_note.trim().slice(0, 1024)
        : "";
    const { success } = await c.env.DB.prepare(
        `UPDATE address`
        + ` SET display_label = ?, owner_note = ?, updated_at = datetime('now')`
        + ` WHERE id = ?`
    ).bind(displayLabel, ownerNote, id).run();
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500);
    }
    if (labels) {
        await syncAddressLabels(c, id, labels);
    }
    const row = await c.env.DB.prepare(
        `SELECT id, name, display_label, owner_note, updated_at FROM address WHERE id = ?`
    ).bind(id).first<{ id: number, name: string, display_label?: string | null, owner_note?: string | null, updated_at?: string | null }>();
    await recordAuditEvent(c, {
        action: "address.update",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: id,
        resource_label: row?.name || null,
        status: "success",
        metadata: {
            labels: labels || undefined,
            has_owner_note: !!ownerNote,
        },
    });
    return c.json({
        ...row,
        labels: await getAddressLabels(c, id),
    });
};

const createNewAddress = async (c: Context<HonoCustomType>) => {
    const { name, domain, enablePrefix, enableRandomSubdomain } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    if (!name) {
        return c.text(msgs.RequiredFieldMsg, 400)
    }
    try {
        const res = await newAddress(c, {
            name, domain, enablePrefix,
            enableRandomSubdomain: getBooleanValue(enableRandomSubdomain),
            checkLengthByConfig: false,
            addressPrefix: null,
            enableCheckNameRegex: false,
            sourceMeta: 'admin'
        });
        await recordAuditEvent(c, {
            action: "address.create",
            actor_type: "admin",
            actor_label: "admin",
            resource_type: "address",
            resource_id: res.address_id,
            resource_label: res.address,
            status: "success",
            metadata: {
                domain,
                enable_prefix: !!enablePrefix,
                enable_random_subdomain: getBooleanValue(enableRandomSubdomain),
            },
        });
        return c.json(res);
    } catch (e) {
        return c.text(`${msgs.FailedCreateAddressMsg}: ${(e as Error).message}`, 400)
    }
};

const deleteAddress = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { id } = c.req.param();
    const address = await c.env.DB.prepare(
        `SELECT name FROM address WHERE id = ?`
    ).bind(id).first<string>("name");
    if (!address) {
        return c.text(msgs.AddressNotFoundMsg, 404);
    }
    const { success: readStateSuccess } = await c.env.DB.prepare(
        `DELETE FROM mail_read_states WHERE mail_id IN (SELECT id FROM raw_mails WHERE address = ?)`
    ).bind(address).run();
    const { success: mailSuccess } = await c.env.DB.prepare(
        `DELETE FROM raw_mails WHERE address = ?`
    ).bind(address).run();
    if (!mailSuccess) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    const { success: sendboxSuccess } = await c.env.DB.prepare(
        `DELETE FROM sendbox WHERE address = ?`
    ).bind(address).run();
    const { success: sendAccess } = await c.env.DB.prepare(
        `DELETE FROM address_sender WHERE address = ?`
    ).bind(address).run();
    const { success: usersAddressSuccess } = await c.env.DB.prepare(
        `DELETE FROM users_address WHERE address_id = ?`
    ).bind(id).run();
    const { success: shareTokensSuccess } = await c.env.DB.prepare(
        `DELETE FROM address_share_tokens WHERE address_id = ?`
    ).bind(id).run();
    const { success: addressLabelsSuccess } = await c.env.DB.prepare(
        `DELETE FROM address_labels WHERE address_id = ?`
    ).bind(id).run();
    const { success } = await c.env.DB.prepare(
        `DELETE FROM address WHERE id = ? `
    ).bind(id).run();
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    const finalSuccess = success
        && readStateSuccess
        && mailSuccess
        && sendboxSuccess
        && sendAccess
        && usersAddressSuccess
        && shareTokensSuccess
        && addressLabelsSuccess;
    await recordAuditEvent(c, {
        action: "address.delete",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: id,
        resource_label: address,
        status: finalSuccess ? "success" : "failed",
    });
    return c.json({ success: finalSuccess })
};

const clearInbox = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { id } = c.req.param();
    const { success: readStateSuccess } = await c.env.DB.prepare(
        `DELETE FROM mail_read_states`
        + ` WHERE mail_id IN (SELECT id FROM raw_mails WHERE address IN`
        + ` (select name from address where id = ?))`
    ).bind(id).run();
    const { success: mailSuccess } = await c.env.DB.prepare(
        `DELETE FROM raw_mails WHERE address IN`
        + ` (select name from address where id = ?) `
    ).bind(id).run();
    if (!mailSuccess || !readStateSuccess) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    await recordAuditEvent(c, {
        action: "address.inbox.clear",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: id,
        status: "success",
    });
    return c.json({ success: mailSuccess && readStateSuccess });
};

const clearSentItems = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { id } = c.req.param();
    const { success: sendboxSuccess } = await c.env.DB.prepare(
        `DELETE FROM sendbox WHERE address IN`
        + ` (select name from address where id = ?) `
    ).bind(id).run();
    if (!sendboxSuccess) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    await recordAuditEvent(c, {
        action: "address.sent.clear",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: id,
        status: "success",
    });
    return c.json({ success: sendboxSuccess });
};

const showPassword = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const address = await c.env.DB.prepare(
        `SELECT name, COALESCE(credential_version, 1) AS credential_version FROM address WHERE id = ? `
    ).bind(id).first<{ name: string, credential_version: number }>();
    if (!address) {
        return c.text(i18n.getMessagesbyContext(c).AddressNotFoundMsg, 404);
    }
    const jwt = await issueAddressJwt(c, address.name, id, address.credential_version);
    await recordAuditEvent(c, {
        action: "address.credential.view",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: id,
        resource_label: address.name,
        status: "success",
    });
    return c.json({ jwt });
};

const rotateCredential = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const msgs = i18n.getMessagesbyContext(c);
    const address = await c.env.DB.prepare(
        `SELECT id, name FROM address WHERE id = ? `
    ).bind(id).first<{ id: number, name: string }>();
    if (!address) {
        return c.text(msgs.AddressNotFoundMsg, 404);
    }
    const { success } = await c.env.DB.prepare(
        `UPDATE address`
        + ` SET credential_version = COALESCE(credential_version, 1) + 1,`
        + ` updated_at = datetime('now')`
        + ` WHERE id = ?`
    ).bind(id).run();
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500);
    }
    const credentialVersion = await c.env.DB.prepare(
        `SELECT COALESCE(credential_version, 1) AS credential_version FROM address WHERE id = ?`
    ).bind(id).first<number>("credential_version");
    const jwt = await issueAddressJwt(c, address.name, address.id, credentialVersion);
    await recordAuditEvent(c, {
        action: "address.credential.rotate",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: address.id,
        resource_label: address.name,
        status: "success",
        metadata: { credential_version: credentialVersion },
    });
    return c.json({
        jwt,
        address: address.name,
        credential_version: credentialVersion,
    });
};

const resetPassword = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { id } = c.req.param();
    const { password } = await c.req.json();
    // NOTE: Keep the admin API field as password, but the value is a frontend SHA-256 hash.
    if (!getBooleanValue(c.env.ENABLE_ADDRESS_PASSWORD)) {
        return c.text(msgs.PasswordChangeDisabledMsg, 403);
    }
    if (!password) {
        return c.text(msgs.NewPasswordRequiredMsg, 400);
    }
    const { success } = await c.env.DB.prepare(
        `UPDATE address SET password = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(password, id).run();
    if (!success) {
        return c.text(msgs.FailedUpdatePasswordMsg, 500);
    }
    await recordAuditEvent(c, {
        action: "address.password.reset",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "address",
        resource_id: id,
        status: "success",
    });
    return c.json({ success: true });
};

export default {
    listAddressLabels, listAddresses, createNewAddress, deleteAddress, clearInbox, clearSentItems,
    showPassword, resetPassword, rotateCredential, updateAddress, deleteAddressLabel
};
