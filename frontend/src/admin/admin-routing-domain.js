import { modeLabel, setupLabel } from './admin-formatters'

export const buildAdminDomainRows = ({
    domains = [],
    overviewDomains = [],
    mailDomains = [],
    openSettings = {},
}) => {
    const overviewByDomain = new Map(overviewDomains.map((row) => [row.domain, row]))
    const mailByDomain = new Map(mailDomains.map((row) => [row.domain, row]))
    if (domains.length > 0) {
        return domains.map((row) => {
            const overviewRow = overviewByDomain.get(row.domain) || {}
            const mailRow = mailByDomain.get(row.domain) || {}
            return {
                id: `domain-${row.id || row.domain}`,
                sourceId: row.id,
                source: row.source,
                domain: row.domain,
                label: row.display_label || row.domain,
                receiveMode: row.receive_mode,
                setupStatus: row.setup_status,
                mode: modeLabel(row.receive_mode),
                setup: setupLabel(row.setup_status),
                enabled: row.enabled ? '启用' : '关闭',
                allowRandomSubdomain: !!row.allow_random_subdomain,
                configVersion: row.config_version,
                verificationAddress: row.verification_address,
                verificationExpiresAt: row.verification_expires_at,
                lastError: row.last_error,
                canAutoSetupCloudflare: !!row.can_auto_setup_cloudflare,
                missingRequirements: row.missing_requirements || [],
                creation: row.allow_address_creation ? '允许创建' : '仅管理员',
                default: row.is_default ? '默认' : '否',
                collector: row.collector_address || (row.receive_mode === 'cloudflare_email' ? 'catch-all -> Worker' : '-'),
                verification: row.verification_address || row.setup_status || '-',
                auth: row.source === 'env'
                    ? 'env fallback'
                    : row.cloudflare_zone_id ? 'Cloudflare token ready' : 'managed domain',
                addresses: overviewRow.address_count ?? mailRow.address_count ?? 0,
                mails: overviewRow.mail_count ?? mailRow.mail_count ?? 0,
                updated: row.last_verified_at || row.updated_at || '-',
            }
        })
    }
    if (Array.isArray(openSettings.domainRegistry) && openSettings.domainRegistry.length > 0) {
        return openSettings.domainRegistry.map((row, index) => ({
            id: `registry-${row.domain || index}`,
            domain: row.domain,
            source: row.source,
            receiveMode: row.receive_mode,
            setupStatus: row.setup_status,
            label: row.display_label || row.label || row.domain,
            mode: modeLabel(row.receive_mode),
            setup: setupLabel(row.setup_status),
            enabled: row.enabled === false ? '关闭' : '启用',
            allowRandomSubdomain: !!row.allow_random_subdomain,
            creation: row.allow_address_creation ? '允许创建' : '仅管理员',
            default: row.is_default ? '默认' : '否',
            collector: row.collector_address || '-',
            verification: row.verification_address || '-',
            verificationAddress: row.verification_address,
            auth: row.source || 'open settings',
            addresses: 0,
            mails: 0,
            updated: row.last_verified_at || '-',
        }))
    }
    if (Array.isArray(openSettings.domains) && openSettings.domains.length > 0) {
        return openSettings.domains.map((row) => ({
            id: `open-${row.value}`,
            domain: row.value,
            label: row.label || row.value,
            mode: 'Worker env registry',
            setup: '需复核',
            enabled: '启用',
            allowRandomSubdomain: false,
            creation: openSettings.defaultDomains?.includes(row.value) ? '允许创建' : '仅管理员',
            default: openSettings.defaultDomains?.[0] === row.value ? '默认' : '否',
            collector: '-',
            verification: '-',
            auth: 'open settings',
            addresses: 0,
            mails: 0,
            updated: '-',
        }))
    }
    return []
}

export const buildAdminRouteRows = (domains, mailWebhook) => [
    ...domains.map((row) => ({
        id: `route-${row.domain}`,
        destination: row.collector || 'Worker Email Handler',
        domain: row.domain,
        type: row.mode,
        inUse: row.addresses,
        status: row.enabled,
        next: String(row.mode).includes('ImprovMX') ? '复核 collector 与 DMARC' : '保持 catch-all 到 Worker',
    })),
    {
        id: 'route-hook',
        destination: '/api/admin/mail_webhook/settings',
        domain: '全部域名',
        type: 'Webhook',
        inUse: mailWebhook?.enabled ? 1 : 0,
        status: mailWebhook?.enabled ? '启用' : '需更新',
        next: '保存成功门禁未接入前仅显示配置状态',
    },
]

export const buildRoutingActivationRows = (domains, domainAutomation) => {
    const cloudflareDomains = domains.filter((row) => (
        row.receiveMode === 'cloudflare_email' || String(row.mode || '').includes('Cloudflare')
    ))
    const improvmxDomains = domains.filter((row) => (
        row.receiveMode === 'improvmx_forward' || String(row.mode || '').includes('ImprovMX')
    ))
    const cloudflareReady = cloudflareDomains.some((row) => row.setup === '已验证' || row.setupStatus === 'active')
    const improvmxReady = improvmxDomains.some((row) => row.collector && row.collector !== '-')
    const hasPendingVerification = domains.some((row) => row.verificationAddress)
    const hasCloudflareToken = !!domainAutomation?.has_token || domains.some((row) => row.canAutoSetupCloudflare)
    return [
        { code: '01', title: 'Cloudflare 自动配置', state: hasCloudflareToken ? '可用' : '缺 token', tone: hasCloudflareToken ? 'ok' : 'warn' },
        { code: '02', title: 'catch-all 到 Worker', state: cloudflareReady ? '已验证' : '待配置', tone: cloudflareReady ? 'ok' : 'warn' },
        { code: '03', title: 'ImprovMX collector 激活', state: improvmxReady ? '可用' : '待生成', tone: improvmxReady ? 'ok' : 'warn' },
        { code: '04', title: '验证邮件闭环', state: hasPendingVerification ? '待检查' : '按需生成', tone: hasPendingVerification ? 'warn' : 'ok' },
    ]
}

export const buildAdminDomainRail = (domain) => domain ? ({
    title: '域名详情',
    subtitle: domain.domain,
    tags: [domain.mode, domain.enabled],
    kv: [
        ['配置', domain.setup, 'status'],
        ['Collector', domain.collector],
        ['认证', domain.auth],
        ['验证', domain.updated],
    ],
    actions: [
        {
            label: domain.receiveMode === 'improvmx_forward' ? 'ImprovMX 指引' : '自动配置 CF',
            action: domain.receiveMode === 'improvmx_forward' ? 'verify-start' : 'cloudflare-setup',
            primary: true,
        },
        { label: '开始验证', action: 'verify-start' },
        { label: '检查验证', action: 'verify-check' },
        { label: '检查路由', action: 'verify' },
        { label: '停用影响', action: 'domain-impact', danger: true },
        { label: '停用域名', action: 'domain-disable', danger: true },
    ],
}) : null
