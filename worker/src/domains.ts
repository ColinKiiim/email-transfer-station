import { Context } from "hono";

import {
    getBooleanValue,
    getDefaultDomains,
    getDomains,
    getRandomSubdomainDomains,
    getStringArray,
} from "./utils";

export type ReceiveMode = "cloudflare_email" | "improvmx_forward" | "external_webhook" | "manual";
export type SetupStatus = "draft" | "pending_dns" | "pending_forwarding" | "pending_verification" | "active" | "disabled" | "error";

export type ManagedDomain = {
    id?: number
    domain: string
    display_label?: string | null
    enabled: boolean
    receive_mode: ReceiveMode
    allow_address_creation: boolean
    is_default: boolean
    allow_random_subdomain: boolean
    allow_subdomain_match?: boolean | null
    collector_address?: string | null
    cloudflare_zone_id?: string | null
    cloudflare_routing_rule_id?: string | null
    cloudflare_catch_all_rule_id?: string | null
    setup_status: SetupStatus
    verification_token?: string | null
    verification_started_at?: string | null
    verification_expires_at?: string | null
    verification_consumed_at?: string | null
    last_verified_at?: string | null
    last_error?: string | null
    notes?: string | null
    config_version: number
    created_at?: string | null
    updated_at?: string | null
    source: "env" | "db"
}

export type PublicManagedDomain = {
    domain: string
    display_label: string
    is_default: boolean
    allow_random_subdomain: boolean
}

type DbManagedDomainRow = Omit<
    ManagedDomain,
    "enabled" | "allow_address_creation" | "is_default" | "allow_random_subdomain" | "allow_subdomain_match" | "source"
> & {
    enabled: number
    allow_address_creation: number
    is_default: number
    allow_random_subdomain: number
    allow_subdomain_match?: number | null
}

export const RECEIVE_MODES = new Set<ReceiveMode>([
    "cloudflare_email",
    "improvmx_forward",
    "external_webhook",
    "manual",
]);
export const SETUP_STATUSES = new Set<SetupStatus>([
    "draft",
    "pending_dns",
    "pending_forwarding",
    "pending_verification",
    "active",
    "disabled",
    "error",
]);

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const normalizeDomain = (domain: string | undefined | null): string => {
    return String(domain || "").trim().toLowerCase();
}

export const normalizeEmail = (email: string | undefined | null): string => {
    return String(email || "").trim().toLowerCase();
}

export const isValidDomain = (domain: string): boolean => DOMAIN_RE.test(normalizeDomain(domain));
export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
export const isReceiveMode = (value: unknown): value is ReceiveMode => RECEIVE_MODES.has(String(value || "") as ReceiveMode);
export const isSetupStatus = (value: unknown): value is SetupStatus => SETUP_STATUSES.has(String(value || "") as SetupStatus);

export const normalizeReceiveMode = (value: unknown): ReceiveMode => {
    const mode = String(value || "manual").trim() as ReceiveMode;
    return RECEIVE_MODES.has(mode) ? mode : "manual";
}

export const normalizeSetupStatus = (value: unknown): SetupStatus => {
    const status = String(value || "draft").trim() as SetupStatus;
    return SETUP_STATUSES.has(status) ? status : "draft";
}

const parseSqliteDate = (value: string | null | undefined): number => {
    if (!value) return Number.NaN;
    const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
    return Date.parse(normalized);
}

export const isVerificationPending = (
    domain: Pick<
        ManagedDomain,
        "verification_token" | "verification_started_at" | "verification_expires_at" | "verification_consumed_at"
    >,
    now = Date.now()
): boolean => {
    if (
        !domain.verification_token
        || !domain.verification_started_at
        || !domain.verification_expires_at
        || domain.verification_consumed_at
    ) {
        return false;
    }
    const startedAt = parseSqliteDate(domain.verification_started_at);
    const expiresAt = parseSqliteDate(domain.verification_expires_at);
    return Number.isFinite(startedAt)
        && Number.isFinite(expiresAt)
        && startedAt <= now
        && expiresAt >= now;
}

const collectorLocalPart = (domain: string): string => {
    return `mx-${normalizeDomain(domain).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const getEnvManagedReceiveDomains = (c: Context<HonoCustomType>): string[] => {
    return getStringArray(c.env.MANAGED_RECEIVE_DOMAINS)
        .map((item) => {
            const value = normalizeEmail(item);
            if (value.startsWith("@")) return value.slice(1);
            if (value.includes("@")) return value.split("@").pop() || "";
            return value;
        })
        .filter(Boolean);
}

const getEnvCollectorAddresses = (c: Context<HonoCustomType>): string[] => {
    return getStringArray(c.env.COLLECTOR_ADDRESSES).map(normalizeEmail).filter(Boolean);
}

const findEnvCollectorAddress = (c: Context<HonoCustomType>, domain: string): string | null => {
    const expectedLocalPart = collectorLocalPart(domain);
    return getEnvCollectorAddresses(c).find((address) => address.split("@")[0] === expectedLocalPart) || null;
}

export const getEnvDomainRegistry = (c: Context<HonoCustomType>): ManagedDomain[] => {
    const domains = getDomains(c).map(normalizeDomain).filter(Boolean);
    const defaultDomains = new Set(getDefaultDomains(c).map(normalizeDomain));
    const randomDomains = new Set(getRandomSubdomainDomains(c).map(normalizeDomain));
    const labels = getStringArray(c.env.DOMAIN_LABELS);
    const managedReceiveDomains = new Set(getEnvManagedReceiveDomains(c));
    return domains.map((domain, index) => {
        const receiveMode: ReceiveMode = managedReceiveDomains.has(domain)
            ? "improvmx_forward"
            : "cloudflare_email";
        return {
            domain,
            display_label: labels[index] || domain,
            enabled: true,
            receive_mode: receiveMode,
            allow_address_creation: true,
            is_default: defaultDomains.has(domain),
            allow_random_subdomain: randomDomains.has(domain),
            allow_subdomain_match: getBooleanValue(c.env.ENABLE_CREATE_ADDRESS_SUBDOMAIN_MATCH),
            collector_address: receiveMode === "improvmx_forward"
                ? findEnvCollectorAddress(c, domain)
                : null,
            setup_status: "active",
            config_version: 0,
            source: "env",
        };
    });
}

const rowToManagedDomain = (row: DbManagedDomainRow): ManagedDomain => ({
    ...row,
    domain: normalizeDomain(row.domain),
    enabled: !!row.enabled,
    receive_mode: normalizeReceiveMode(row.receive_mode),
    allow_address_creation: !!row.allow_address_creation,
    is_default: !!row.is_default,
    allow_random_subdomain: !!row.allow_random_subdomain,
    allow_subdomain_match: row.allow_subdomain_match === null || row.allow_subdomain_match === undefined
        ? null
        : !!row.allow_subdomain_match,
    setup_status: normalizeSetupStatus(row.setup_status),
    config_version: Number(row.config_version || 1),
    source: "db",
});

export const getDbDomainRegistry = async (
    c: Context<HonoCustomType>
): Promise<ManagedDomain[]> => {
    try {
        const { results } = await c.env.DB.prepare(
            `SELECT * FROM managed_domains ORDER BY domain ASC`
        ).all<DbManagedDomainRow>();
        return (results || []).map(rowToManagedDomain);
    } catch (error) {
        console.warn("[domains] managed_domains unavailable, using env fallback", error);
        return [];
    }
}

export const getDomainRegistry = async (
    c: Context<HonoCustomType>
): Promise<ManagedDomain[]> => {
    const merged = new Map<string, ManagedDomain>();
    for (const domain of getEnvDomainRegistry(c)) {
        merged.set(domain.domain, domain);
    }
    for (const domain of await getDbDomainRegistry(c)) {
        merged.set(domain.domain, domain);
    }
    return [...merged.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

const sortCreationDomains = (domains: ManagedDomain[]): ManagedDomain[] => {
    return [...domains].sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.domain.localeCompare(b.domain);
    });
}

export const getAddressCreationDomains = async (
    c: Context<HonoCustomType>
): Promise<ManagedDomain[]> => {
    return sortCreationDomains((await getDomainRegistry(c)).filter((domain) =>
        domain.enabled
        && domain.allow_address_creation
        && domain.setup_status === "active"
    ));
}

export const getAddressCreationDomainNames = async (
    c: Context<HonoCustomType>
): Promise<string[]> => {
    return (await getAddressCreationDomains(c)).map((domain) => domain.domain);
}

export const getDefaultAddressCreationDomainNames = async (
    c: Context<HonoCustomType>
): Promise<string[]> => {
    const domains = await getAddressCreationDomains(c);
    return domains.filter((domain) => domain.is_default).map((domain) => domain.domain);
}

export const getActiveDomainNames = async (
    c: Context<HonoCustomType>
): Promise<string[]> => {
    return (await getDomainRegistry(c))
        .filter((domain) => domain.enabled && domain.setup_status === "active")
        .map((domain) => domain.domain);
}

export const toPublicManagedDomain = (domain: ManagedDomain): PublicManagedDomain => ({
    domain: domain.domain,
    display_label: domain.display_label || domain.domain,
    is_default: domain.is_default,
    allow_random_subdomain: domain.allow_random_subdomain,
});

export const getOpenSettingsDomainPayload = async (
    c: Context<HonoCustomType>
): Promise<{
    domains: string[]
    defaultDomains: string[]
    domainLabels: string[]
    randomSubdomainDomains: string[]
    domainRegistry: PublicManagedDomain[]
}> => {
    const creationDomains = await getAddressCreationDomains(c);
    const configuredDefaults = creationDomains.filter((domain) => domain.is_default);
    const effectiveDefaults = configuredDefaults.length
        ? configuredDefaults
        : creationDomains.slice(0, 1);
    return {
        domains: creationDomains.map((domain) => domain.domain),
        defaultDomains: effectiveDefaults.map((domain) => domain.domain),
        domainLabels: creationDomains.map((domain) => domain.display_label || domain.domain),
        randomSubdomainDomains: creationDomains
            .filter((domain) => domain.allow_random_subdomain)
            .map((domain) => domain.domain),
        domainRegistry: creationDomains.map(toPublicManagedDomain),
    };
}

const domainHasExistingAddress = async (
    c: Context<HonoCustomType>,
    domain: string
): Promise<boolean> => {
    const addressId = await c.env.DB.prepare(
        `SELECT id FROM address WHERE lower(name) LIKE ? LIMIT 1`
    ).bind(`%@${normalizeDomain(domain)}`).first<number>("id");
    return !!addressId;
}

export const getManagedReceiveDomains = async (
    c: Context<HonoCustomType>
): Promise<string[]> => {
    const improvmxDomains = (await getDomainRegistry(c))
        .filter((domain) => domain.receive_mode === "improvmx_forward");
    const results = await Promise.all(improvmxDomains.map(async (domain) => {
        if (domain.enabled && domain.setup_status === "active") return domain.domain;
        return await domainHasExistingAddress(c, domain.domain) ? domain.domain : null;
    }));
    return results.filter((domain): domain is string => !!domain);
}

export const getPendingVerificationRecipients = async (
    c: Context<HonoCustomType>
): Promise<string[]> => {
    return (await getDomainRegistry(c))
        .filter((domain) =>
            domain.enabled
            && domain.receive_mode === "improvmx_forward"
            && isVerificationPending(domain)
        )
        .map((domain) => `verify-${domain.verification_token}@${domain.domain}`);
}

export const getCollectorAddresses = async (
    c: Context<HonoCustomType>
): Promise<string[]> => {
    const dbCollectors = (await getDomainRegistry(c))
        .filter((domain) => domain.receive_mode === "improvmx_forward")
        .map((domain) => normalizeEmail(domain.collector_address))
        .filter(Boolean);
    return [...new Set([...getEnvCollectorAddresses(c), ...dbCollectors])];
}

export const generateCollectorAddress = async (
    c: Context<HonoCustomType>,
    domain: string
): Promise<string | null> => {
    const normalizedDomain = normalizeDomain(domain);
    const registry = await getDomainRegistry(c);
    const candidates = registry
        .filter((item) =>
            item.domain !== normalizedDomain
            && item.enabled
            && item.setup_status === "active"
            && item.receive_mode === "cloudflare_email"
        )
        .sort((a, b) => {
            if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
            return a.domain.localeCompare(b.domain);
        });
    const collectorDomain = candidates[0]?.domain
        || getDefaultDomains(c).map(normalizeDomain).find((item) => item && item !== normalizedDomain)
        || getDomains(c).map(normalizeDomain).find((item) => item && item !== normalizedDomain);
    if (!collectorDomain) return null;
    return `${collectorLocalPart(normalizedDomain)}@${collectorDomain}`;
}

export const findMatchedAddressCreationDomain = (
    requestedDomain: string,
    domains: ManagedDomain[],
    inheritedSubdomainMatch: boolean,
    forceSubdomainMatchDisabled = false
): ManagedDomain | null => {
    const normalized = normalizeDomain(requestedDomain);
    if (!isValidDomain(normalized)) return null;
    const candidates = sortCreationDomains(domains.filter((domain) =>
        domain.enabled
        && domain.allow_address_creation
        && domain.setup_status === "active"
    ));
    const exact = candidates.find((domain) => domain.domain === normalized);
    if (exact) return exact;
    return [...candidates]
        .sort((a, b) => b.domain.length - a.domain.length)
        .find((domain) => {
            const allowSubdomainMatch = forceSubdomainMatchDisabled
                ? false
                : domain.allow_subdomain_match ?? inheritedSubdomainMatch;
            return allowSubdomainMatch && normalized.endsWith(`.${domain.domain}`);
        }) || null;
}

export const isDomainAllowedForAddressCreation = async (
    c: Context<HonoCustomType>,
    domain: string
): Promise<boolean> => {
    const normalized = normalizeDomain(domain);
    return (await getAddressCreationDomainNames(c)).includes(normalized);
}

export const getDomainById = async (
    c: Context<HonoCustomType>,
    id: string | number
): Promise<ManagedDomain | null> => {
    const row = await c.env.DB.prepare(
        `SELECT * FROM managed_domains WHERE id = ?`
    ).bind(id).first<DbManagedDomainRow>();
    return row ? rowToManagedDomain(row) : null;
}
