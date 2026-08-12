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

export const buildAdminShareRows = (rows = []) => rows.map((row) => ({
    id: `pkg-${row.id}`,
    sourceId: row.id,
    label: row.label || t('sharePackageLabel', { id: row.id }),
    address: row.address,
    scopes: row.scopes || 'read',
    status: row.status || 'active',
    expires: formatDate(row.expires_at),
    last: formatDate(row.last_used_at),
    path: '/i/:token',
}))

export const buildAdminUserRows = (rows = []) => rows.map((row) => ({
    id: `user-${row.id}`,
    user: row.display_name || row.username || row.email || `user:${row.id}`,
    role: row.role || '-',
    addresses: t('addressCount', { count: row.address_count || 0 }),
    auth: row.oauth_provider || t('authLocal'),
    status: row.enabled === false ? t('userDisabled') : t('userEnabled'),
    last: formatDate(row.updated_at || row.created_at),
}))

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
