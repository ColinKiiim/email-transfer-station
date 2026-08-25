import { formatDate, getDomain } from './admin-formatters'
import { adminT } from './admin-i18n'

const t = adminT('admin.identity')

export const buildAdminAddressRows = (rows = [], enableAddressPassword = false) => rows.map((row) => {
    const tags = Array.isArray(row.labels)
        ? row.labels.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean)
        : (row.display_label ? [row.display_label] : [])
    return {
        id: `addr-${row.id}`,
        sourceId: row.id,
        address: row.name,
        label: row.display_label || row.name,
        domain: getDomain(row.name),
        owner: row.user_id ? `user:${row.user_id}` : 'admin',
        tags,
        source: t('sourceAdminCreated'),
        mails: row.mail_count || 0,
        sent: row.send_count || 0,
        packages: row.active_share_token_count || 0,
        credentialVersion: Number(row.credential_version || 1),
        credential: row.credential_version ? `v${row.credential_version}` : t('credentialNormal'),
        password: enableAddressPassword ? t('passwordEnabled') : t('passwordDisabled'),
        note: row.owner_note || row.source_meta || t('defaultNote'),
        updated: row.updated_at || '-',
    }
})

const SHARE_SCOPE_MAP = {
    read: 'shareScopeRead',
}

const SHARE_STATUS_MAP = {
    active: { labelKey: 'shareStatusActive', tone: 'ok' },
    revoked: { labelKey: 'shareStatusRevoked', tone: 'danger' },
    expired: { labelKey: 'shareStatusExpired', tone: 'warn' },
}

export const formatShareScopes = (scopes = 'read') => {
    if (!scopes) return t('shareScopeRead')
    const list = Array.isArray(scopes)
        ? scopes
        : String(scopes).split(',').map((item) => item.trim()).filter(Boolean)
    if (!list.length) return t('shareScopeRead')
    return list.map((scope) => {
        const key = SHARE_SCOPE_MAP[scope]
        return key ? t(key) : scope
    }).join(', ')
}

export const formatShareStatus = (status = 'active') => {
    const matched = SHARE_STATUS_MAP[status]
    if (matched) {
        return {
            label: t(matched.labelKey),
            tone: matched.tone,
        }
    }
    return {
        label: status || '-',
        tone: 'neutral',
    }
}

export const buildAdminShareRows = (rows = []) => rows.map((row) => {
    const rawScopes = row.scopes || 'read'
    const rawStatus = row.status || 'active'
    const statusMeta = formatShareStatus(rawStatus)
    return {
        id: `pkg-${row.id}`,
        sourceId: row.id,
        label: row.label || t('sharePackageLabel', { id: row.id }),
        address: row.address,
        scopes: rawScopes,
        scopeLabel: formatShareScopes(rawScopes),
        status: rawStatus,
        statusLabel: statusMeta.label,
        statusLabelTone: statusMeta.tone,
        expires: formatDate(row.expires_at),
        last: formatDate(row.last_used_at),
        path: '/i/:token',
        pathLabel: t('sharePathLabel'),
    }
})

export const buildAdminUserRows = (rows = []) => rows.map((row) => ({
    id: `user-${row.id}`,
    sourceId: row.id,
    userEmail: row.user_email || '',
    username: row.username || '',
    displayName: row.display_name || '',
    user: row.display_name || row.username || row.user_email || `user:${row.id}`,
    role: row.role_text || '-',
    roleText: row.role_text || '',
    addresses: t('addressCount', { count: row.address_count || 0 }),
    addressCount: row.address_count || 0,
    created: formatDate(row.created_at),
    updated: formatDate(row.updated_at || row.created_at),
}))

export const buildAdminUserRail = (user, boundAddresses = []) => user ? ({
    title: t('userRailTitle'),
    subtitle: user.userEmail || user.user,
    tags: user.roleText ? [user.roleText] : [t('noRoleTag')],
    kv: [
        [t('kvEmail'), user.userEmail || '-'],
        [t('kvUsername'), user.username || '-'],
        [t('kvDisplayName'), user.displayName || '-'],
        [t('kvRole'), user.roleText || t('noRoleText')],
        [t('kvAddresses'), t('addressCount', { count: user.addressCount })],
        [t('kvCreated'), user.created || '-'],
        [t('kvUpdated'), user.updated || '-'],
    ],
    boundAddresses: boundAddresses || [],
    actions: [
        { label: t('actionResetPassword'), modal: 'reset-password', primary: true },
        { label: t('actionChangeRole'), modal: 'edit-role' },
        { label: t('actionManageAddresses'), modal: 'user-addresses' },
        { label: t('actionDeleteUser'), action: 'delete-user', danger: true },
    ],
}) : null

export const buildAdminAuditRows = (auditEvents = [], accessEvents = []) => [
    ...auditEvents.map((row) => ({
        id: `audit-${row.id}`,
        time: formatDate(row.created_at),
        actor: row.actor_label || row.actor_type || '-',
        action: row.action,
        resource: row.resource_label || row.resource_type || '-',
        status: row.status,
        ip: row.ip || '-',
    })),
    ...accessEvents.map((row) => ({
        id: `access-${row.id}`,
        time: formatDate(row.created_at),
        actor: row.actor_label || row.actor_type || '-',
        action: row.event_type,
        resource: row.resource_label || row.resource_type || '-',
        status: row.status,
        ip: row.ip || '-',
    })),
]

export const buildAdminProcessingRows = (rows = []) => rows.slice(0, 8).map((row) => ({
    id: `log-${row.id}`,
    time: row.time,
    event: row.action,
    detail: row.resource,
    domain: '-',
    inbox: row.actor,
    duration: row.status,
}))

export const buildAdminAddressRail = (address) => address ? ({
    title: t('addressRailTitle'),
    subtitle: address.address,
    tags: address.tags,
    kv: [
        [t('kvNote'), address.note],
        [t('kvReceivedSent'), `${address.mails} / ${address.sent}`],
        [t('kvSharePackages'), t('sharePackageCount', { count: address.packages })],
        [t('kvAddressPassword'), address.password],
        [t('kvCredential'), address.credential, 'status'],
    ],
    actions: [
        { label: t('actionShowCredential'), action: 'show-credential', primary: true },
        { label: t('actionRotateCredential'), action: 'rotate' },
        { label: t('actionCreateSharePackage'), modal: 'share-package' },
        { label: t('actionRevokeSharePackage'), action: 'revoke' },
        { label: t('actionClearInbox'), action: 'clear-inbox', danger: true },
        { label: t('actionDeleteAddress'), action: 'delete-address', danger: true },
    ],
}) : null

export const buildAdminExceptionRail = (exception) => exception ? ({
    title: t('exceptionRailTitle'),
    subtitle: exception.title,
    tags: [exception.level, exception.status, t('tagUnknownRecipient')],
    kv: [
        [t('kvRecipient'), exception.owner],
        [t('kvDomain'), exception.domain || '-'],
        [t('kvLevel'), exception.level],
        [t('kvStatus'), exception.status, 'status'],
    ],
    body: exception.detail,
    actions: [
        { label: t('actionCreateAddress'), modal: 'new-address', primary: true },
        { label: t('actionKeepWatching'), action: 'refresh' },
    ],
}) : null
