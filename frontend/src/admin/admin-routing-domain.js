import { modeLabel, setupLabel } from './admin-formatters'
import { adminT } from './admin-i18n'

const t = adminT('admin.routing')


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
                enabled: row.enabled ? t('enabled') : t('disabled'),
                // Semantic companion to `enabled`; every condition and badge
                // colour keys off these, never off the display string.
                isEnabled: !!row.enabled,
                enabledTone: row.enabled ? 'ok' : 'danger',
                allowRandomSubdomain: !!row.allow_random_subdomain,
                configVersion: row.config_version,
                verificationAddress: row.verification_address,
                verificationExpiresAt: row.verification_expires_at,
                lastError: row.last_error,
                canAutoSetupCloudflare: !!row.can_auto_setup_cloudflare,
                missingRequirements: row.missing_requirements || [],
                creation: row.allow_address_creation ? t('creationAllowed') : t('creationAdminOnly'),
                default: row.is_default ? t('defaultYes') : t('defaultNo'),
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
            enabled: row.enabled === false ? t('disabled') : t('enabled'),
            isEnabled: row.enabled !== false,
            enabledTone: row.enabled === false ? 'danger' : 'ok',
            allowRandomSubdomain: !!row.allow_random_subdomain,
            creation: row.allow_address_creation ? t('creationAllowed') : t('creationAdminOnly'),
            default: row.is_default ? t('defaultYes') : t('defaultNo'),
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
            setup: t('setupNeedsReview'),
            enabled: t('enabled'),
            isEnabled: true,
            enabledTone: 'ok',
            allowRandomSubdomain: false,
            creation: openSettings.defaultDomains?.includes(row.value) ? t('creationAllowed') : t('creationAdminOnly'),
            default: openSettings.defaultDomains?.[0] === row.value ? t('defaultYes') : t('defaultNo'),
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
        next: String(row.mode).includes('ImprovMX') ? t('nextReviewCollector') : t('nextKeepCatchAll'),
    })),
    {
        id: 'route-hook',
        destination: '/api/admin/mail_webhook/settings',
        domain: t('allDomains'),
        type: 'Webhook',
        inUse: mailWebhook?.enabled ? 1 : 0,
        status: mailWebhook?.enabled ? t('enabled') : t('needsUpdate'),
        next: t('webhookNext'),
    },
]

export const buildRoutingActivationRows = (domains, domainAutomation) => {
    const cloudflareDomains = domains.filter((row) => (
        row.receiveMode === 'cloudflare_email' || String(row.mode || '').includes('Cloudflare')
    ))
    const improvmxDomains = domains.filter((row) => (
        row.receiveMode === 'improvmx_forward' || String(row.mode || '').includes('ImprovMX')
    ))
    // Semantic status only. Comparing against the localised `setup` label
    // would silently stop matching as soon as the console is translated.
    const cloudflareReady = cloudflareDomains.some((row) => row.setupStatus === 'active')
    const improvmxReady = improvmxDomains.some((row) => row.collector && row.collector !== '-')
    const hasPendingVerification = domains.some((row) => row.verificationAddress)
    const hasCloudflareToken = !!domainAutomation?.has_token || domains.some((row) => row.canAutoSetupCloudflare)
    return [
        { code: '01', title: t('activationCloudflareAuto'), state: hasCloudflareToken ? t('stateAvailable') : t('stateMissingToken'), tone: hasCloudflareToken ? 'ok' : 'warn' },
        { code: '02', title: t('activationCatchAll'), state: cloudflareReady ? t('stateVerified') : t('statePendingSetup'), tone: cloudflareReady ? 'ok' : 'warn' },
        { code: '03', title: t('activationImprovmxCollector'), state: improvmxReady ? t('stateAvailable') : t('statePendingGeneration'), tone: improvmxReady ? 'ok' : 'warn' },
        { code: '04', title: t('activationVerificationLoop'), state: hasPendingVerification ? t('statePendingCheck') : t('stateOnDemand'), tone: hasPendingVerification ? 'warn' : 'ok' },
    ]
}

export const buildAdminDomainRail = (domain) => domain ? ({
    title: t('railTitle'),
    subtitle: domain.domain,
    tags: [domain.mode, domain.enabled],
    kv: [
        [t('kvSetup'), domain.setup, 'status'],
        ['Collector', domain.collector],
        [t('kvAuth'), domain.auth],
        [t('kvVerification'), domain.updated],
    ],
    actions: [
        {
            label: domain.receiveMode === 'improvmx_forward' ? t('actionImprovmxGuide') : t('actionCloudflareSetup'),
            action: domain.receiveMode === 'improvmx_forward' ? 'verify-start' : 'cloudflare-setup',
            primary: true,
        },
        { label: t('actionVerifyStart'), action: 'verify-start' },
        { label: t('actionVerifyCheck'), action: 'verify-check' },
        { label: t('actionVerifyRoute'), action: 'verify' },
        { label: t('actionDisableImpact'), action: 'domain-impact', danger: true },
        { label: t('actionDisableDomain'), action: 'domain-disable', danger: true },
    ],
}) : null
