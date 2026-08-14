import { api } from '../api'
import { createAdminRequestId } from '../security/admin-request'

const ADMIN_MAIL_PAGE_LIMIT = 25
const ADMIN_MAIL_FETCH_MAX = 500

const pathId = (value) => encodeURIComponent(String(value))
const jsonOptions = (method, body) => ({
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export const createAdminApi = (fetcher, { requestIdFactory = createAdminRequestId } = {}) => {
    const writeOptions = (method, body) => ({
        ...jsonOptions(method, body),
        headers: { 'x-admin-request-id': requestIdFactory() },
    })
    return {
    getLoginSettings: () => fetcher('/open_api/admin_login_settings'),
    login: ({ username, passwordHash, cfToken }) => fetcher('/open_api/admin_login', jsonOptions('POST', {
        username,
        password: passwordHash,
        cf_token: cfToken,
    })),

    getOverview: () => fetcher('/api/admin/overview'),
    getStatistics: () => fetcher('/api/admin/statistics'),
    listDomains: () => fetcher('/api/admin/domains'),
    listMailDomains: () => fetcher('/api/admin/mail_domains'),
    listMailAddresses: () => fetcher('/api/admin/mail_addresses'),
    listMails: ({ limit = ADMIN_MAIL_PAGE_LIMIT, offset = 0 } = {}) => fetcher(`/api/admin/mails?limit=${limit}&offset=${offset}&include_raw=false`),
    getMail: (id) => fetcher(`/api/admin/mails/${pathId(id)}`),
    listUnknownMails: () => fetcher('/api/admin/mails_unknow?limit=100&offset=0&include_raw=false'),
    listAddresses: () => fetcher('/api/admin/address?limit=50&offset=0'),
    listAccessPackages: () => fetcher('/api/admin/access_packages?limit=50&offset=0'),
    listAuditEvents: () => fetcher('/api/admin/audit_events?limit=20&offset=0'),
    listAccessEvents: () => fetcher('/api/admin/access_events?limit=20&offset=0'),
    listUsers: () => fetcher('/api/admin/users?limit=20&offset=0'),
    getWorkerConfig: () => fetcher('/api/admin/worker/configs'),
    getDbVersion: () => fetcher('/api/admin/db_version'),
    getMailWebhook: () => fetcher('/api/admin/mail_webhook/settings'),
    getGlobalWebhook: () => fetcher('/api/admin/webhook/settings'),
    getTelegramStatus: () => fetcher('/api/admin/telegram/status'),
    getAiSettings: () => fetcher('/api/admin/ai_extract/settings'),
    listSenderAccess: () => fetcher('/api/admin/address_sender?limit=20&offset=0'),
    listSendBox: () => fetcher('/api/admin/sendbox?limit=10&offset=0'),

    markMailRead: (id) => fetcher(`/api/admin/mails/${pathId(id)}/read_state`, writeOptions('PATCH', { read: true })),
    deleteMail: (id) => fetcher(`/api/admin/mails/${pathId(id)}`, writeOptions('DELETE', { confirm: true })),
    createAddress: ({ name, domain, enablePrefix, enableRandomSubdomain }) => fetcher('/api/admin/new_address', writeOptions('POST', {
        name,
        domain,
        enablePrefix,
        enableRandomSubdomain,
    })),
    createShareToken: (id, { label, expiresAt }) => fetcher(`/api/admin/address/${pathId(id)}/share_tokens`, writeOptions('POST', {
        label,
        scopes: ['read'],
        expires_at: expiresAt,
    })),
    deleteAddress: (id, { credentialVersion, mailCount, sentCount, shareCount }) => fetcher(`/api/admin/delete_address/${pathId(id)}`, writeOptions('DELETE', {
        confirm: true,
        expected_credential_version: credentialVersion,
        expected_mail_count: mailCount,
        expected_sent_count: sentCount,
        expected_share_count: shareCount,
    })),
    getDomainImpact: (id) => fetcher(`/api/admin/domains/${pathId(id)}/impact`),
    disableDomain: (id, { configVersion, confirm = true }) => fetcher(`/api/admin/domains/${pathId(id)}`, writeOptions('DELETE', {
        config_version: configVersion,
        confirm,
    })),
    showAddressCredential: (id, credentialVersion) => fetcher(`/api/admin/address/${pathId(id)}/credential`, writeOptions('POST', {
        confirm: true,
        expected_credential_version: credentialVersion,
    })),
    rotateAddressCredential: (id, credentialVersion) => fetcher(`/api/admin/address/${pathId(id)}/rotate_credential`, writeOptions('POST', {
        confirm: true,
        expected_credential_version: credentialVersion,
    })),
    revokeShareTokens: (id) => fetcher(`/api/admin/address/${pathId(id)}/share_tokens`, writeOptions('DELETE', { confirm: true })),
    clearAddressInbox: (id, mailCount) => fetcher(`/api/admin/clear_inbox/${pathId(id)}`, writeOptions('DELETE', {
        confirm: true,
        expected_mail_count: mailCount,
    })),
    checkCloudflareDomain: (id) => fetcher(`/api/admin/domains/${pathId(id)}/cloudflare/check`, writeOptions('POST')),
    startDomainVerification: (id, configVersion) => fetcher(`/api/admin/domains/${pathId(id)}/verify/start`, writeOptions('POST', {
        confirm: true,
        config_version: configVersion,
    })),
    checkDomainVerification: (id, configVersion) => fetcher(`/api/admin/domains/${pathId(id)}/verify/check`, writeOptions('POST', {
        config_version: configVersion,
    })),
    setupCloudflareDomain: (id, { configVersion, confirmReplaceCatchAll }) => fetcher(`/api/admin/domains/${pathId(id)}/cloudflare/setup`, writeOptions('POST', {
        confirm: true,
        config_version: configVersion,
        confirm_replace_catch_all: confirmReplaceCatchAll,
    })),
    createDomain: ({ domain, displayLabel, receiveMode, collectorAddress, cloudflareZoneId, allowRandomSubdomain }) => fetcher('/api/admin/domains', writeOptions('POST', {
        domain,
        display_label: displayLabel,
        receive_mode: receiveMode,
        collector_address: collectorAddress,
        cloudflare_zone_id: cloudflareZoneId,
        allow_random_subdomain: allowRandomSubdomain,
    })),
    }
}

export const adminApi = createAdminApi((path, options) =>
    options === undefined ? api.fetch(path) : api.fetch(path, options),
)

const resultRows = (response) => Array.isArray(response?.results) ? response.results : []
const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null

export const normalizeAdminSnapshot = (raw, errors = []) => ({
    overview: raw.overview ?? null,
    statistics: raw.statistics ?? null,
    domains: resultRows(raw.domains),
    domainAutomation: raw.domains?.cloudflare_automation || null,
    mailDomains: resultRows(raw.mailDomains),
    mailAddresses: resultRows(raw.mailAddresses),
    mails: resultRows(raw.mails),
    mailTotalCount: finiteNumber(raw.mails?.count),
    mailUnreadCount: finiteNumber(raw.mails?.unread_count),
    unknownMails: resultRows(raw.unknownMails),
    addresses: resultRows(raw.addresses),
    accessPackages: resultRows(raw.accessPackages),
    auditEvents: resultRows(raw.auditEvents),
    accessEvents: resultRows(raw.accessEvents),
    users: resultRows(raw.users),
    workerConfig: raw.workerConfig ?? null,
    dbVersion: raw.dbVersion ?? null,
    mailWebhook: raw.mailWebhook ?? null,
    globalWebhook: raw.globalWebhook ?? null,
    telegram: raw.telegram ?? null,
    aiSettings: raw.aiSettings ?? null,
    senderAccess: resultRows(raw.senderAccess),
    sendBox: resultRows(raw.sendBox),
    errors: [...errors],
})

export const loadRemainingAdminMails = async (client, total, onPage) => {
    const upperBound = Math.min(Number(total) || 0, ADMIN_MAIL_FETCH_MAX)
    for (let offset = ADMIN_MAIL_PAGE_LIMIT; offset < upperBound; offset += ADMIN_MAIL_PAGE_LIMIT) {
        const rows = resultRows(await client.listMails({ limit: ADMIN_MAIL_PAGE_LIMIT, offset }))
        if (!rows.length || onPage(rows) === false) break
    }
}

export const loadAdminSnapshot = async (client = adminApi, seed = {}) => {
    const errors = []
    const recordError = (label, error) => {
        errors.push(`${label}: ${error?.message || error || 'error'}`)
    }
    const safeRead = async (key, label, loader, shouldRecord = true) => {
        try {
            return [key, await loader()]
        } catch (error) {
            if (shouldRecord) recordError(label, error)
            return [key, null]
        }
    }
    const reads = [
        ['overview', 'overview', () => seed.overview ?? client.getOverview()],
        ['statistics', 'statistics', () => client.getStatistics()],
        ['domains', 'domains', () => client.listDomains()],
        ['mailDomains', 'mail domains', () => client.listMailDomains()],
        ['mailAddresses', 'mail addresses', () => client.listMailAddresses()],
        ['mails', 'mails', () => client.listMails({ limit: ADMIN_MAIL_PAGE_LIMIT, offset: 0 })],
        ['unknownMails', 'unknown mails', () => client.listUnknownMails()],
        ['addresses', 'addresses', () => client.listAddresses()],
        ['accessPackages', 'access packages', () => client.listAccessPackages()],
        ['auditEvents', 'audit events', () => client.listAuditEvents()],
        ['accessEvents', 'access events', () => client.listAccessEvents()],
        ['users', 'users', () => client.listUsers()],
        ['workerConfig', 'worker configs', () => client.getWorkerConfig()],
        ['dbVersion', 'db version', () => client.getDbVersion()],
        ['mailWebhook', 'mail webhook', () => client.getMailWebhook()],
        ['globalWebhook', 'global webhook', () => client.getGlobalWebhook()],
        ['telegram', 'telegram', () => client.getTelegramStatus(), false],
        ['aiSettings', 'ai extract', () => client.getAiSettings()],
        ['senderAccess', 'sender access', () => client.listSenderAccess()],
        ['sendBox', 'sendbox', () => client.listSendBox()],
    ]
    const entries = await Promise.all(
        reads.map(([key, label, loader, shouldRecord]) => safeRead(key, label, loader, shouldRecord)),
    )
    return normalizeAdminSnapshot(Object.fromEntries(entries), errors)
}
