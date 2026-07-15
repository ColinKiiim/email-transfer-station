import { formatDate, getDomain } from './admin-formatters'

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
        source: row.source || '管理员创建',
        mails: row.mail_count || 0,
        sent: row.send_count || 0,
        packages: row.active_share_token_count || 0,
        credential: row.credential_version ? `v${row.credential_version}` : '正常',
        password: enableAddressPassword ? '启用' : '关闭',
        note: row.owner_note || row.source_meta || '地址身份记录',
        updated: row.updated_at || '-',
    }
})

export const buildAdminShareRows = (rows = []) => rows.map((row) => ({
    id: `pkg-${row.id}`,
    sourceId: row.id,
    label: row.label || `访问包 #${row.id}`,
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
    addresses: `${row.address_count || 0} 个地址`,
    auth: row.oauth_provider || '本地账号',
    status: row.enabled === false ? '停用' : '启用',
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
    title: '地址详情',
    subtitle: address.address,
    tags: address.tags,
    kv: [
        ['备注', address.note],
        ['收件 / 发送', `${address.mails} / ${address.sent}`],
        ['分享包', `${address.packages} 个`],
        ['地址密码', address.password],
        ['凭证', address.credential, 'status'],
    ],
    actions: [
        { label: '显示凭证', action: 'show-credential', primary: true },
        { label: '轮换凭证', action: 'rotate' },
        { label: '创建访问包', modal: 'share-package' },
        { label: '撤销访问包', action: 'revoke' },
        { label: '清空收件', action: 'clear-inbox', danger: true },
        { label: '删除地址', action: 'delete-address', danger: true },
    ],
}) : null

export const buildAdminExceptionRail = (exception) => exception ? ({
    title: '异常邮件',
    subtitle: exception.title,
    tags: [exception.level, exception.status, '未知收件人'],
    kv: [
        ['收件对象', exception.owner],
        ['域名', exception.domain || '-'],
        ['级别', exception.level],
        ['状态', exception.status, 'status'],
    ],
    body: exception.detail,
    actions: [
        { label: '创建地址', modal: 'new-address', primary: true },
        { label: '保留观察', action: 'refresh' },
    ],
}) : null
