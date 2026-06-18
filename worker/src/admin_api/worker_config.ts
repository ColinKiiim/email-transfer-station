import { Context } from 'hono';

import utils from '../utils';
import { CONSTANTS } from '../constants';
import { isS3Enabled } from '../mails_api/s3_attachment';
import { UserSettings } from '../models';
import { isAnySendMailEnabled } from '../common';
import { getAddressCreationDomains, getCollectorAddresses, getDomainRegistry, getManagedReceiveDomains } from '../domains';
import { hasCloudflareApiToken, getCloudflareWorkerName } from '../cloudflare_api';

const readDatabaseDiagnostic = async (c: Context<HonoCustomType>) => {
    try {
        const version = await utils.getSetting(c, CONSTANTS.DB_VERSION_KEY);
        const tableRows = await c.env.DB.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
        ).all<{ name: string }>();
        const tables = tableRows.results?.map((row) => row.name) || [];
        return {
            ok: true,
            current_version: version || '',
            code_version: CONSTANTS.DB_VERSION,
            need_initialization: !version,
            need_migration: !!version && version !== CONSTANTS.DB_VERSION,
            tables,
        };
    } catch (error) {
        return {
            ok: false,
            current_version: '',
            code_version: CONSTANTS.DB_VERSION,
            need_initialization: false,
            need_migration: false,
            tables: [],
            error: (error as Error).message,
        };
    }
}

const hasBinding = (value: unknown): boolean => value !== undefined && value !== null;

export default {
    getConfig: async (c: Context<HonoCustomType>) => {
        const domains = utils.getDomains(c);
        const collectorAddresses = utils.getStringArray(c.env.COLLECTOR_ADDRESSES);
        const managedReceiveDomains = utils.getStringArray(c.env.MANAGED_RECEIVE_DOMAINS).map((domain) => domain.toLowerCase());
        const domainRegistry = await getDomainRegistry(c);
        const activeCreationDomains = await getAddressCreationDomains(c);
        const dynamicCollectorAddresses = await getCollectorAddresses(c);
        const dynamicManagedReceiveDomains = await getManagedReceiveDomains(c);
        const userSettingsValue = await utils.getJsonSetting<UserSettings>(c, CONSTANTS.USER_SETTINGS_KEY);
        const userSettings = new UserSettings(userSettingsValue);
        const smtpImapProxyConfig = utils.getJsonObjectValue<SmtpImapProxyConfig>(c.env.SMTP_IMAP_PROXY_CONFIG) || {};
        const databaseDiagnostic = await readDatabaseDiagnostic(c);
        const kvAvailable = hasBinding(c.env.KV);
        const webhookEnabled = utils.getBooleanValue(c.env.ENABLE_WEBHOOK);
        const addressWebhookEnabled = webhookEnabled && utils.getBooleanValue(c.env.ENABLE_ADDRESS_WEBHOOK);
        const warnings = [] as string[];
        if (domainRegistry.length === 0) warnings.push("No env or D1 managed domains are configured");
        if (activeCreationDomains.length === 0) warnings.push("No active domain currently allows address creation");
        if (dynamicManagedReceiveDomains.length > 0 && dynamicCollectorAddresses.length === 0) {
            warnings.push("ImprovMX forwarding domains exist but collector addresses are empty");
        }
        if ((webhookEnabled || userSettings.enableMailVerify) && !kvAvailable) {
            warnings.push("KV is required by webhook, mail verification, Telegram, or KV-backed limits");
        }
        if (utils.getBooleanValue(c.env.ENABLE_AI_EMAIL_EXTRACT) && !hasBinding(c.env.AI)) {
            warnings.push("AI extraction is enabled but AI binding is unavailable");
        }
        return c.json({
            "DEFAULT_LANG": c.env.DEFAULT_LANG,
            "TITLE": c.env.TITLE,
            "HAS_PASSWORD": utils.getPasswords(c).length,
            "HAS_ADMIN_PASSWORDS": utils.getAdminPasswords(c).length,
            "ANNOUNCEMENT": utils.getStringValue(c.env.ANNOUNCEMENT),
            "ALWAYS_SHOW_ANNOUNCEMENT": utils.getBooleanValue(c.env.ALWAYS_SHOW_ANNOUNCEMENT),

            "PREFIX": utils.getStringValue(c.env.PREFIX),
            "ADDRESS_CHECK_REGEX": utils.getStringValue(c.env.ADDRESS_CHECK_REGEX),
            "ADDRESS_REGEX": utils.getStringValue(c.env.ADDRESS_REGEX),
            "MIN_ADDRESS_LEN": utils.getIntValue(c.env.MIN_ADDRESS_LEN, 1),
            "MAX_ADDRESS_LEN": utils.getIntValue(c.env.MAX_ADDRESS_LEN, 30),

            "FORWARD_ADDRESS_LIST": utils.getStringArray(c.env.FORWARD_ADDRESS_LIST),
            "SUBDOMAIN_FORWARD_ADDRESS_LIST": utils.getJsonObjectValue<SubdomainForwardAddressList[]>(c.env.SUBDOMAIN_FORWARD_ADDRESS_LIST),
            "DEFAULT_DOMAINS": utils.getDefaultDomains(c),
            "DOMAINS": domains,
            "COLLECTOR_ADDRESSES": collectorAddresses,
            "MANAGED_RECEIVE_DOMAINS": managedReceiveDomains,
            "DOMAIN_ROUTING_STATUS": domains.map((domain) => ({
                domain,
                mode: managedReceiveDomains.includes(domain.toLowerCase())
                    ? "improvmx-collector"
                    : "cloudflare-native",
                collectorAddresses,
            })),
            "ENABLE_CREATE_ADDRESS_SUBDOMAIN_MATCH": utils.getBooleanValue(c.env.ENABLE_CREATE_ADDRESS_SUBDOMAIN_MATCH),
            "RANDOM_SUBDOMAIN_DOMAINS": utils.getRandomSubdomainDomains(c),
            "RANDOM_SUBDOMAIN_LENGTH": utils.getIntValue(c.env.RANDOM_SUBDOMAIN_LENGTH, 8),
            "DOMAIN_LABELS": utils.getStringArray(c.env.DOMAIN_LABELS),
            "MANAGED_DOMAIN_REGISTRY": domainRegistry,
            "ACTIVE_CREATION_DOMAINS": activeCreationDomains.map((domain) => domain.domain),
            "CLOUDFLARE_AUTOMATION": {
                has_token: hasCloudflareApiToken(c),
                worker_name: getCloudflareWorkerName(c),
            },

            "HAS_JWT_SECRET": !!utils.getStringValue(c.env.JWT_SECRET),

            "ADMIN_USER_ROLE": utils.getStringValue(c.env.ADMIN_USER_ROLE),
            "USER_DEFAULT_ROLE": utils.getStringValue(c.env.USER_DEFAULT_ROLE),
            "USER_ROLES": utils.getUserRoles(c),
            "NO_LIMIT_SEND_ROLE": utils.getSplitStringListValue(c.env.NO_LIMIT_SEND_ROLE),

            "ADMIN_CONTACT": c.env.ADMIN_CONTACT,
            "ENABLE_USER_CREATE_EMAIL": utils.getBooleanValue(c.env.ENABLE_USER_CREATE_EMAIL),
            "DISABLE_ANONYMOUS_USER_CREATE_EMAIL": utils.getBooleanValue(c.env.DISABLE_ANONYMOUS_USER_CREATE_EMAIL),
            "ENABLE_USER_DELETE_EMAIL": utils.getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL),
            "ENABLE_AUTO_REPLY": utils.getBooleanValue(c.env.ENABLE_AUTO_REPLY),
            "COPYRIGHT": c.env.COPYRIGHT,
            "ENABLE_WEBHOOK": utils.getBooleanValue(c.env.ENABLE_WEBHOOK),
            "ENABLE_ADDRESS_WEBHOOK": utils.getBooleanValue(c.env.ENABLE_ADDRESS_WEBHOOK),
            "S3_ENABLED": isS3Enabled(c),
            "VERSION": CONSTANTS.VERSION,
            "DISABLE_SHOW_GITHUB": !utils.getBooleanValue(c.env.DISABLE_SHOW_GITHUB),
            "DISABLE_ADMIN_PASSWORD_CHECK": utils.getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK),
            "ENABLE_CHECK_JUNK_MAIL": utils.getBooleanValue(c.env.ENABLE_CHECK_JUNK_MAIL),
            "JUNK_MAIL_CHECK_LIST": utils.getStringArray(c.env.JUNK_MAIL_CHECK_LIST),
            "JUNK_MAIL_FORCE_PASS_LIST": utils.getStringArray(c.env.JUNK_MAIL_FORCE_PASS_LIST),

            "REMOVE_EXCEED_SIZE_ATTACHMENT": utils.getBooleanValue(c.env.REMOVE_EXCEED_SIZE_ATTACHMENT),
            "REMOVE_ALL_ATTACHMENT": utils.getBooleanValue(c.env.REMOVE_ALL_ATTACHMENT),

            "ENABLE_ANOTHER_WORKER": utils.getBooleanValue(c.env.ENABLE_ANOTHER_WORKER),
            "ANOTHER_WORKER_LIST": utils.getAnotherWorkerList(c),
            "DIAGNOSTICS": {
                generated_at: new Date().toISOString(),
                database: databaseDiagnostic,
                bindings: {
                    DB: hasBinding(c.env.DB),
                    KV: kvAvailable,
                    RATE_LIMITER: hasBinding(c.env.RATE_LIMITER),
                    SEND_MAIL: hasBinding(c.env.SEND_MAIL),
                    AI: hasBinding(c.env.AI),
                    ASSETS: hasBinding(c.env.ASSETS),
                    CLOUDFLARE_API_TOKEN: hasCloudflareApiToken(c),
                },
                domains: {
                    domains,
                    default_domains: utils.getDefaultDomains(c),
                    managed_receive_domains: managedReceiveDomains,
                    collector_addresses: collectorAddresses,
                    registry: domainRegistry,
                    active_creation_domains: activeCreationDomains.map((domain) => domain.domain),
                    dynamic_managed_receive_domains: dynamicManagedReceiveDomains,
                    dynamic_collector_addresses: dynamicCollectorAddresses,
                    routing_status: domains.map((domain) => ({
                        domain,
                        mode: managedReceiveDomains.includes(domain.toLowerCase())
                            ? "improvmx-collector"
                            : "cloudflare-native",
                    })),
                },
                features: {
                    user_create_email: utils.getBooleanValue(c.env.ENABLE_USER_CREATE_EMAIL),
                    anonymous_create_disabled: utils.getBooleanValue(c.env.DISABLE_ANONYMOUS_USER_CREATE_EMAIL),
                    mail_verify: !!userSettings.enableMailVerify,
                    webhook: webhookEnabled,
                    address_webhook: addressWebhookEnabled,
                    send_mail: await isAnySendMailEnabled(c),
                    s3_attachment: isS3Enabled(c),
                    agent_email_info: utils.getBooleanValue(c.env.ENABLE_AGENT_EMAIL_INFO),
                    smtp_imap_proxy: !!(smtpImapProxyConfig.smtp?.host || smtpImapProxyConfig.imap?.host),
                    ai_extract: utils.getBooleanValue(c.env.ENABLE_AI_EMAIL_EXTRACT),
                    status_url: !!utils.getStringValue(c.env.STATUS_URL),
                },
                warnings,
            },
        })
    }
}
