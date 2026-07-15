import {
    compactRaw,
    compactText,
    extractHeader,
    formatDate,
    formatShortDate,
    getDomain,
} from './admin-formatters'

export const buildAdminSenderAccessRows = (rows = []) => rows.map((row) => ({
    id: `sender-${row.id}`,
    sourceId: row.id,
    address: row.address || '-',
    balance: Number.isFinite(Number(row.balance)) ? Number(row.balance) : 0,
    status: row.enabled === 0 || row.enabled === false ? '关闭' : '启用',
    created: formatDate(row.created_at),
    note: row.enabled === 0 || row.enabled === false ? '发送权限已关闭' : '地址级发送权限记录',
}))

export const buildAdminSendBoxRows = (rows = []) => rows.map((row) => {
    const raw = String(row.raw || '')
    return {
        id: `sendbox-${row.id}`,
        sourceId: row.id,
        time: formatShortDate(row.created_at),
        fullTime: formatDate(row.created_at),
        sender: compactText(extractHeader(raw, 'From') || row.address || '-'),
        to: compactText(extractHeader(raw, 'To') || '-'),
        domain: getDomain(row.address),
        subject: compactText(extractHeader(raw, 'Subject') || `Sendbox #${row.id}`),
        result: '已发送',
        risk: '发送箱记录',
        auth: 'sendbox',
        ip: row.address || '-',
        body: compactRaw(raw),
        raw,
        attachmentCount: 0,
    }
})

export const buildAdminNotificationRows = ({
    mailWebhook,
    telegram,
    aiSettings,
    enableSendMail,
}) => [
    {
        id: 'notify-mailhook',
        channel: '邮件 Webhook',
        target: '/api/admin/mail_webhook/settings',
        type: '入站通知',
        status: mailWebhook?.enabled ? '可用' : '需更新',
        detail: mailWebhook?.url ? `Endpoint: ${mailWebhook.url}` : '未配置 endpoint',
    },
    {
        id: 'notify-telegram',
        channel: 'Telegram Bot',
        target: 'Telegram WebApp',
        type: '移动通知',
        status: telegram?.enabled || telegram?.ok ? '可用' : '待配置',
        detail: telegram?.enabled || telegram?.ok ? '已配置' : '需要 TELEGRAM_BOT_TOKEN',
    },
    {
        id: 'notify-send',
        channel: '地址级发送',
        target: '/api/admin/send_mail',
        type: '出站邮件',
        status: enableSendMail ? '可用' : '待产品化',
        detail: enableSendMail ? '已启用' : '未启用',
    },
    {
        id: 'notify-ai',
        channel: 'AI 提取',
        target: 'AiExtractInfo',
        type: '内容处理',
        status: aiSettings?.enabled ? '可用' : '灰度中',
        detail: aiSettings?.enabled ? '已启用' : '未启用',
    },
]

export const buildAdminOpsRows = ({ workerConfig, dbVersion, showAdminPage }) => {
    const diagnostics = workerConfig?.DIAGNOSTICS || {}
    const database = diagnostics.database || {}
    return [
        {
            id: 'worker',
            name: 'Worker 运行配置',
            status: !showAdminPage ? '需登录' : diagnostics.bindings ? '可用' : '需巡检',
            detail: `API: /api/admin/* · bindings: ${Object.keys(diagnostics.bindings || {}).join(', ') || '-'}`,
            action: '打开配置',
        },
        {
            id: 'database',
            name: 'D1 数据库',
            status: !showAdminPage ? '需登录' : database.need_migration || dbVersion?.need_migration ? '需巡检' : '可用',
            detail: `current ${database.current_version || dbVersion?.current_db_version || '-'} / code ${database.code_version || dbVersion?.code_db_version || '-'}`,
            action: '检查迁移',
        },
        {
            id: 'kv',
            name: 'KV / 附件索引',
            status: !showAdminPage ? '需登录' : diagnostics.bindings?.KV ? '可用' : '待确认',
            detail: '附件、Webhook 配置、运行缓存需要在详情页暴露恢复动作',
            action: '查看空间',
        },
        {
            id: 'blacklist',
            name: '阻止与限流',
            status: '待整理',
            detail: 'IP 黑名单、地址创建权限、发送权限合并到策略中心',
            action: '打开策略',
        },
    ]
}

export const buildAdminOpsBoundaryItems = (opsRows) => [
    { label: 'Worker', value: opsRows[0]?.status || '-' },
    { label: 'D1', value: opsRows[1]?.status || '-' },
    { label: 'KV', value: opsRows[2]?.status || '-' },
    { label: 'Pages', value: 'admin-next preview' },
]

export const buildAdminStateCards = ({
    workerConfig,
    workerStatusLabel,
    showAdminPage,
    mailTotalCount,
    mailRowCount,
    mailWebhook,
}) => {
    const database = workerConfig?.DIAGNOSTICS?.database || {}
    const webhookStatus = mailWebhook?.enabled ? '入站通知已启用' : '通知通道需复核'
    const mailTotal = Number.isFinite(Number(mailTotalCount)) ? Number(mailTotalCount) : mailRowCount
    return [
        { value: workerStatusLabel, label: 'Worker / D1', tone: database.ok === false || !showAdminPage ? 'warn' : 'ok' },
        { value: `${mailTotal}`, label: '邮件总数', tone: 'ok' },
        { value: webhookStatus, label: '通知通道', tone: mailWebhook?.enabled ? 'ok' : 'warn' },
    ]
}

export const buildAdminNotificationRail = (notification) => notification ? ({
    title: '通道详情',
    subtitle: notification.channel,
    tags: [notification.type, notification.status],
    kv: [
        ['入口', notification.target],
        ['状态', notification.status, 'status'],
        ['说明', notification.detail],
    ],
}) : null

export const buildAdminOpsRail = (opsRows) => ({
    title: '运行边界',
    subtitle: '维护入口',
    tags: ['Worker', 'D1', 'KV', 'Pages'],
    kv: [
        ['Worker', opsRows[0]?.status || '-'],
        ['D1', opsRows[1]?.status || '-'],
        ['KV', opsRows[2]?.status || '-'],
        ['Pages', 'admin-next preview'],
    ],
})
