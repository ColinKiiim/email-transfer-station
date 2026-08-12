import {
    compactRaw,
    compactText,
    extractHeader,
    formatDate,
    formatShortDate,
    getDomain,
} from './admin-formatters'
import { adminT } from './admin-i18n'

const t = adminT('admin.ops')


export const buildAdminSenderAccessRows = (rows = []) => rows.map((row) => ({
    id: `sender-${row.id}`,
    sourceId: row.id,
    address: row.address || '-',
    balance: Number.isFinite(Number(row.balance)) ? Number(row.balance) : 0,
    status: row.enabled === 0 || row.enabled === false ? t('statusDisabled') : t('statusEnabled'),
    created: formatDate(row.created_at),
    note: row.enabled === 0 || row.enabled === false ? t('senderNoteDisabled') : t('senderNoteRecord'),
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
        result: t('sendboxResultSent'),
        risk: t('sendboxRisk'),
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
        channel: t('channelMailWebhook'),
        target: '/api/admin/mail_webhook/settings',
        type: t('typeInboundNotify'),
        status: mailWebhook?.enabled ? t('statusAvailable') : t('statusNeedsUpdate'),
        detail: mailWebhook?.url ? `Endpoint: ${mailWebhook.url}` : t('detailEndpointMissing'),
    },
    {
        id: 'notify-telegram',
        channel: 'Telegram Bot',
        target: 'Telegram WebApp',
        type: t('typeMobileNotify'),
        status: telegram?.enabled || telegram?.ok ? t('statusAvailable') : t('statusPendingConfig'),
        detail: telegram?.enabled || telegram?.ok ? t('detailConfigured') : t('detailTelegramTokenRequired'),
    },
    {
        id: 'notify-send',
        channel: t('channelAddressSend'),
        target: '/api/admin/send_mail',
        type: t('typeOutboundMail'),
        status: enableSendMail ? t('statusAvailable') : t('statusPendingProduct'),
        detail: enableSendMail ? t('detailEnabled') : t('detailDisabled'),
    },
    {
        id: 'notify-ai',
        channel: t('channelAiExtract'),
        target: 'AiExtractInfo',
        type: t('typeContentProcessing'),
        status: aiSettings?.enabled ? t('statusAvailable') : t('statusCanary'),
        detail: aiSettings?.enabled ? t('detailEnabled') : t('detailDisabled'),
    },
]

export const buildAdminOpsRows = ({ workerConfig, dbVersion, showAdminPage }) => {
    const diagnostics = workerConfig?.DIAGNOSTICS || {}
    const database = diagnostics.database || {}
    return [
        {
            id: 'worker',
            name: t('opsWorkerName'),
            status: !showAdminPage ? t('statusNeedsSignIn') : diagnostics.bindings ? t('statusAvailable') : t('statusNeedsInspection'),
            detail: `API: /api/admin/* · bindings: ${Object.keys(diagnostics.bindings || {}).join(', ') || '-'}`,
            action: t('opsWorkerAction'),
        },
        {
            id: 'database',
            name: t('opsDatabaseName'),
            status: !showAdminPage ? t('statusNeedsSignIn') : database.need_migration || dbVersion?.need_migration ? t('statusNeedsInspection') : t('statusAvailable'),
            detail: `current ${database.current_version || dbVersion?.current_db_version || '-'} / code ${database.code_version || dbVersion?.code_db_version || '-'}`,
            action: t('opsDatabaseAction'),
        },
        {
            id: 'kv',
            name: t('opsKvName'),
            status: !showAdminPage ? t('statusNeedsSignIn') : diagnostics.bindings?.KV ? t('statusAvailable') : t('statusPendingCheck'),
            detail: t('opsKvDetail'),
            action: t('opsKvAction'),
        },
        {
            id: 'blacklist',
            name: t('opsBlocklistName'),
            status: t('statusPendingCleanup'),
            detail: t('opsBlocklistDetail'),
            action: t('opsBlocklistAction'),
        },
    ]
}

export const buildAdminOpsBoundaryItems = (opsRows) => [
    { label: 'Worker', value: opsRows[0]?.status || '-' },
    { label: 'D1', value: opsRows[1]?.status || '-' },
    { label: 'KV', value: opsRows[2]?.status || '-' },
    // The backend exposes no Pages health signal; show it as uncollected
    // rather than inventing a status string.
    { label: 'Pages', value: '-' },
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
    const webhookStatus = mailWebhook?.enabled ? t('cardWebhookEnabled') : t('cardWebhookNeedsReview')
    const mailTotal = Number.isFinite(Number(mailTotalCount)) ? Number(mailTotalCount) : mailRowCount
    return [
        { value: workerStatusLabel, label: 'Worker / D1', tone: database.ok === false || !showAdminPage ? 'warn' : 'ok' },
        { value: `${mailTotal}`, label: t('cardMailTotal'), tone: 'ok' },
        { value: webhookStatus, label: t('cardNotifyChannel'), tone: mailWebhook?.enabled ? 'ok' : 'warn' },
    ]
}

export const buildAdminNotificationRail = (notification) => notification ? ({
    title: t('railNotificationTitle'),
    subtitle: notification.channel,
    tags: [notification.type, notification.status],
    kv: [
        [t('railEntry'), notification.target],
        [t('railStatus'), notification.status, 'status'],
        [t('railNote'), notification.detail],
    ],
}) : null

export const buildAdminOpsRail = (opsRows) => ({
    title: t('railOpsTitle'),
    subtitle: t('railOpsSubtitle'),
    tags: ['Worker', 'D1', 'KV', 'Pages'],
    kv: [
        ['Worker', opsRows[0]?.status || '-'],
        ['D1', opsRows[1]?.status || '-'],
        ['KV', opsRows[2]?.status || '-'],
        ['Pages', '-'],
    ],
})
