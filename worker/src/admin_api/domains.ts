import { Context } from "hono";

import { recordAuditEvent } from "../audit";
import {
    CloudflareRoutingRule,
    getCloudflareWorkerName,
    getEmailRoutingCatchAll,
    getEmailRoutingDns,
    getEmailRoutingSettings,
    hasCloudflareApiToken,
    isWorkerRoutingRule,
    listEmailRoutingRules,
    planCloudflareReconcile,
    resolveCloudflareZone,
    updateCatchAllWorkerRule,
    enableEmailRoutingDns,
} from "../cloudflare_api";
import {
    generateCollectorAddress,
    getDomainById,
    getDomainRegistry,
    getEnvDomainRegistry,
    isReceiveMode,
    isValidDomain,
    isValidEmail,
    ManagedDomain,
    normalizeDomain,
    normalizeEmail,
    ReceiveMode,
} from "../domains";

const VERIFICATION_TTL_MINUTES = 30;

class DomainApiError extends Error {
    status: number
    details?: Record<string, unknown>

    constructor(status: number, message: string, details?: Record<string, unknown>) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

const boolToInt = (value: boolean): number => value ? 1 : 0;

const jsonBody = async (c: Context<HonoCustomType>): Promise<Record<string, unknown>> => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new DomainApiError(400, "invalid_json_body");
    }
    return body as Record<string, unknown>;
}

const optionalBoolean = (
    input: Record<string, unknown>,
    key: string,
    fallback: boolean
): boolean => {
    if (input[key] === undefined) return fallback;
    if (typeof input[key] !== "boolean") {
        throw new DomainApiError(400, `invalid_${key}`);
    }
    return input[key];
}

const optionalNullableBoolean = (
    input: Record<string, unknown>,
    key: string,
    fallback: boolean | null
): boolean | null => {
    if (input[key] === undefined) return fallback;
    if (input[key] === null) return null;
    if (typeof input[key] !== "boolean") {
        throw new DomainApiError(400, `invalid_${key}`);
    }
    return input[key];
}

const optionalString = (
    input: Record<string, unknown>,
    key: string,
    fallback: string | null,
    maxLength = 500
): string | null => {
    if (input[key] === undefined) return fallback;
    if (input[key] === null || input[key] === "") return null;
    if (typeof input[key] !== "string") {
        throw new DomainApiError(400, `invalid_${key}`);
    }
    const value = input[key].trim();
    if (value.length > maxLength) {
        throw new DomainApiError(400, `${key}_too_long`);
    }
    return value || null;
}

const requiredConfigVersion = (
    input: Record<string, unknown>,
    existing: ManagedDomain
): number => {
    if (!Number.isInteger(input.config_version) || Number(input.config_version) < 1) {
        throw new DomainApiError(400, "invalid_config_version");
    }
    const configVersion = Number(input.config_version);
    if (configVersion !== existing.config_version) {
        throw new DomainApiError(409, "domain_config_conflict", {
            current_config_version: existing.config_version,
        });
    }
    return configVersion;
}

const apiError = (c: Context<HonoCustomType>, error: unknown) => {
    if (error instanceof DomainApiError) {
        return c.json({
            success: false,
            error: error.message,
            ...(error.details || {}),
        }, error.status as 400);
    }
    const message = (error as Error)?.message || "domain_request_failed";
    if (message.includes("UNIQUE constraint failed") || message.includes("managed_domains.domain")) {
        return c.json({ success: false, error: "domain_already_exists" }, 409);
    }
    console.error("[domains] request failed", message);
    return c.json({ success: false, error: message }, 500);
}

const verificationAddress = (domain: ManagedDomain): string | null => {
    return domain.verification_token
        ? `verify-${domain.verification_token}@${domain.domain}`
        : null;
}

const adminDomain = (c: Context<HonoCustomType>, domain: ManagedDomain) => {
    const { verification_token: _verificationToken, ...safeDomain } = domain;
    return {
        ...safeDomain,
        verification_address: verificationAddress(domain),
        can_auto_setup_cloudflare: domain.receive_mode === "cloudflare_email" && hasCloudflareApiToken(c),
        missing_requirements: [
            domain.receive_mode === "cloudflare_email" && !hasCloudflareApiToken(c)
                ? "CLOUDFLARE_API_TOKEN"
                : null,
            domain.receive_mode === "improvmx_forward" && !domain.collector_address
                ? "collector_address"
                : null,
        ].filter(Boolean),
    };
}

const sanitizeReceiveMode = (
    input: Record<string, unknown>,
    fallback: ReceiveMode
): ReceiveMode => {
    const value = input.receive_mode ?? fallback;
    if (!isReceiveMode(value)) {
        throw new DomainApiError(400, "invalid_receive_mode");
    }
    return value;
}

const sanitizeCreateInput = async (
    c: Context<HonoCustomType>,
    input: Record<string, unknown>
) => {
    if (input.setup_status !== undefined) {
        throw new DomainApiError(400, "setup_status_read_only");
    }
    const domain = normalizeDomain(typeof input.domain === "string" ? input.domain : "");
    if (!isValidDomain(domain)) {
        throw new DomainApiError(400, "invalid_domain");
    }
    const enabled = optionalBoolean(input, "enabled", true);
    const receiveMode = sanitizeReceiveMode(input, "manual");
    const requestedAllowAddressCreation = optionalBoolean(input, "allow_address_creation", false);
    const requestedDefault = optionalBoolean(input, "is_default", false);
    if (requestedAllowAddressCreation || requestedDefault) {
        throw new DomainApiError(409, "domain_verification_required");
    }
    const collectorInput = optionalString(input, "collector_address", null, 320);
    const collectorAddress = collectorInput ? normalizeEmail(collectorInput) : "";
    if (collectorAddress && !isValidEmail(collectorAddress)) {
        throw new DomainApiError(400, "invalid_collector_address");
    }
    const collector = receiveMode === "improvmx_forward"
        ? (collectorAddress || await generateCollectorAddress(c, domain))
        : (collectorAddress || null);
    return {
        domain,
        display_label: optionalString(input, "display_label", null, 120),
        enabled,
        receive_mode: receiveMode,
        allow_address_creation: false,
        is_default: false,
        allow_random_subdomain: optionalBoolean(input, "allow_random_subdomain", false),
        allow_subdomain_match: optionalNullableBoolean(input, "allow_subdomain_match", null),
        collector_address: collector,
        cloudflare_zone_id: optionalString(input, "cloudflare_zone_id", null, 64),
        setup_status: enabled ? "draft" : "disabled",
        notes: optionalString(input, "notes", null, 2000),
    };
}

const sanitizeUpdateInput = async (
    c: Context<HonoCustomType>,
    input: Record<string, unknown>,
    existing: ManagedDomain
) => {
    if (input.setup_status !== undefined) {
        throw new DomainApiError(400, "setup_status_read_only");
    }
    if (input.domain !== undefined && normalizeDomain(String(input.domain)) !== existing.domain) {
        throw new DomainApiError(400, "domain_read_only");
    }
    const configVersion = requiredConfigVersion(input, existing);
    const enabled = optionalBoolean(input, "enabled", existing.enabled);
    const receiveMode = sanitizeReceiveMode(input, existing.receive_mode);
    const collectorInput = optionalString(
        input,
        "collector_address",
        existing.collector_address || null,
        320
    );
    const collectorAddress = collectorInput ? normalizeEmail(collectorInput) : "";
    if (collectorAddress && !isValidEmail(collectorAddress)) {
        throw new DomainApiError(400, "invalid_collector_address");
    }
    const collector = receiveMode === "improvmx_forward"
        ? (collectorAddress || await generateCollectorAddress(c, existing.domain))
        : (collectorAddress || null);
    const cloudflareZoneId = optionalString(
        input,
        "cloudflare_zone_id",
        existing.cloudflare_zone_id || null,
        64
    );
    const ingressChanged = receiveMode !== existing.receive_mode
        || normalizeEmail(collector) !== normalizeEmail(existing.collector_address)
        || cloudflareZoneId !== (existing.cloudflare_zone_id || null);
    const reenabled = !existing.enabled && enabled;
    const setupStatus = !enabled
        ? "disabled"
        : ingressChanged || reenabled
            ? "draft"
            : existing.setup_status;
    const allowAddressCreation = enabled
        && optionalBoolean(input, "allow_address_creation", existing.allow_address_creation);
    if (allowAddressCreation && setupStatus !== "active") {
        throw new DomainApiError(409, "domain_verification_required");
    }
    const isDefault = allowAddressCreation
        && optionalBoolean(input, "is_default", existing.is_default);
    return {
        config_version: configVersion,
        domain: existing.domain,
        display_label: optionalString(
            input,
            "display_label",
            existing.display_label || null,
            120
        ),
        enabled,
        receive_mode: receiveMode,
        allow_address_creation: allowAddressCreation,
        is_default: isDefault,
        allow_random_subdomain: optionalBoolean(
            input,
            "allow_random_subdomain",
            existing.allow_random_subdomain
        ),
        allow_subdomain_match: optionalNullableBoolean(
            input,
            "allow_subdomain_match",
            existing.allow_subdomain_match ?? null
        ),
        collector_address: collector,
        cloudflare_zone_id: cloudflareZoneId,
        setup_status: setupStatus,
        notes: optionalString(input, "notes", existing.notes || null, 2000),
        clear_verification: ingressChanged || reenabled || !enabled,
    };
}

const countDomainData = async (c: Context<HonoCustomType>, domain: string) => {
    const suffix = `%@${domain}`;
    const address_count = await c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM address WHERE lower(name) LIKE ?`
    ).bind(suffix).first<number>("count");
    const mail_count = await c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM raw_mails WHERE lower(address) LIKE ? OR lower(original_domain) = ?`
    ).bind(suffix, domain).first<number>("count");
    return {
        address_count: Number(address_count || 0),
        mail_count: Number(mail_count || 0),
    };
}

const improvmxInstructions = (domain: ManagedDomain) => [
    `Open ImprovMX for ${domain.domain}.`,
    `Create an alias or catch-all rule that forwards mail to ${domain.collector_address || ""}.`,
    `Send a test email to ${verificationAddress(domain) || `verify-token@${domain.domain}`}.`,
    "Return here and run verification check.",
];

const cloudflareState = async (
    c: Context<HonoCustomType>,
    domain: ManagedDomain,
    confirmReplaceCatchAll = false
) => {
    const zone = await resolveCloudflareZone(c, domain.domain, domain.cloudflare_zone_id);
    if (!zone) {
        throw new DomainApiError(404, "cloudflare_zone_not_found");
    }
    const [settings, dns, rules, catchAllResponse] = await Promise.all([
        getEmailRoutingSettings(c, zone.id),
        getEmailRoutingDns(c, zone.id),
        listEmailRoutingRules(c, zone.id),
        getEmailRoutingCatchAll(c, zone.id),
    ]);
    const catchAll = catchAllResponse.result || null;
    const workerName = getCloudflareWorkerName(c);
    const plan = planCloudflareReconcile(
        !!settings.result?.enabled,
        catchAll,
        workerName,
        confirmReplaceCatchAll
    );
    const ownedRuleIds = rules
        .filter((rule) => rule.id !== catchAll?.id && isWorkerRoutingRule(rule, workerName))
        .map((rule) => rule.id)
        .filter(Boolean);
    return {
        zone,
        settings,
        dns,
        rules,
        catchAll,
        workerName,
        plan,
        warnings: ownedRuleIds.length
            ? [{ code: "additional_worker_rules_found", rule_ids: ownedRuleIds }]
            : [],
    };
}

export default {
    list: async (c: Context<HonoCustomType>) => {
        const registry = await getDomainRegistry(c);
        return c.json({
            results: registry.map((domain) => adminDomain(c, domain)),
            cloudflare_automation: {
                has_token: hasCloudflareApiToken(c),
                worker_name: getCloudflareWorkerName(c),
            },
        });
    },

    create: async (c: Context<HonoCustomType>) => {
        try {
            const value = await sanitizeCreateInput(c, await jsonBody(c));
            const result = await c.env.DB.prepare(
                `INSERT INTO managed_domains`
                + ` (domain, display_label, enabled, receive_mode, allow_address_creation, is_default,`
                + ` allow_random_subdomain, allow_subdomain_match, collector_address, cloudflare_zone_id, setup_status, notes)`
                + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                value.domain,
                value.display_label,
                boolToInt(value.enabled),
                value.receive_mode,
                0,
                0,
                boolToInt(value.allow_random_subdomain),
                value.allow_subdomain_match === null ? null : boolToInt(value.allow_subdomain_match),
                value.collector_address,
                value.cloudflare_zone_id,
                value.setup_status,
                value.notes,
            ).run();
            await recordAuditEvent(c, {
                action: "domain.create",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                resource_label: value.domain,
                metadata: { receive_mode: value.receive_mode, setup_status: value.setup_status },
            });
            return c.json({ success: true, id: result.meta?.last_row_id }, 201);
        } catch (error) {
            return apiError(c, error);
        }
    },

    update: async (c: Context<HonoCustomType>) => {
        try {
            const id = c.req.param("id");
            const existing = await getDomainById(c, id);
            if (!existing) throw new DomainApiError(404, "domain_not_found");
            const value = await sanitizeUpdateInput(c, await jsonBody(c), existing);
            const result = await c.env.DB.prepare(
                `UPDATE managed_domains SET`
                + ` display_label = ?, enabled = ?, receive_mode = ?, allow_address_creation = ?,`
                + ` is_default = ?, allow_random_subdomain = ?, allow_subdomain_match = ?, collector_address = ?,`
                + ` cloudflare_zone_id = ?, setup_status = ?, notes = ?,`
                + ` verification_token = CASE WHEN ? THEN NULL ELSE verification_token END,`
                + ` verification_started_at = CASE WHEN ? THEN NULL ELSE verification_started_at END,`
                + ` verification_expires_at = CASE WHEN ? THEN NULL ELSE verification_expires_at END,`
                + ` verification_consumed_at = CASE WHEN ? THEN NULL ELSE verification_consumed_at END,`
                + ` config_version = config_version + 1, updated_at = datetime('now')`
                + ` WHERE id = ? AND config_version = ?`
            ).bind(
                value.display_label,
                boolToInt(value.enabled),
                value.receive_mode,
                boolToInt(value.allow_address_creation),
                boolToInt(value.is_default),
                boolToInt(value.allow_random_subdomain),
                value.allow_subdomain_match === null ? null : boolToInt(value.allow_subdomain_match),
                value.collector_address,
                value.cloudflare_zone_id,
                value.setup_status,
                value.notes,
                boolToInt(value.clear_verification),
                boolToInt(value.clear_verification),
                boolToInt(value.clear_verification),
                boolToInt(value.clear_verification),
                id,
                value.config_version,
            ).run();
            if (!result.success || Number(result.meta?.changes || 0) !== 1) {
                throw new DomainApiError(409, "domain_config_conflict");
            }
            await recordAuditEvent(c, {
                action: "domain.update",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                resource_id: id,
                resource_label: existing.domain,
                metadata: { receive_mode: value.receive_mode, setup_status: value.setup_status },
            });
            return c.json({ success: true, config_version: value.config_version + 1 });
        } catch (error) {
            return apiError(c, error);
        }
    },

    impact: async (c: Context<HonoCustomType>) => {
        try {
            const existing = await getDomainById(c, c.req.param("id"));
            if (!existing) throw new DomainApiError(404, "domain_not_found");
            const counts = await countDomainData(c, existing.domain);
            return c.json({
                success: true,
                ...counts,
                will_disable_address_creation: true,
                will_preserve_existing_address_receive: existing.receive_mode === "improvmx_forward"
                    && counts.address_count > 0,
            });
        } catch (error) {
            return apiError(c, error);
        }
    },

    disable: async (c: Context<HonoCustomType>) => {
        try {
            const id = c.req.param("id");
            const existing = await getDomainById(c, id);
            if (!existing) throw new DomainApiError(404, "domain_not_found");
            const input = await jsonBody(c);
            const configVersion = requiredConfigVersion(input, existing);
            const confirmed = optionalBoolean(input, "confirm", false);
            const counts = await countDomainData(c, existing.domain);
            if (!confirmed && (counts.address_count > 0 || counts.mail_count > 0)) {
                throw new DomainApiError(409, "domain_disable_confirmation_required", counts);
            }
            const result = await c.env.DB.prepare(
                `UPDATE managed_domains`
                + ` SET enabled = 0, allow_address_creation = 0, is_default = 0, setup_status = 'disabled',`
                + ` verification_token = NULL, verification_started_at = NULL, verification_expires_at = NULL,`
                + ` verification_consumed_at = NULL, config_version = config_version + 1, updated_at = datetime('now')`
                + ` WHERE id = ? AND config_version = ?`
            ).bind(id, configVersion).run();
            if (!result.success || Number(result.meta?.changes || 0) !== 1) {
                throw new DomainApiError(409, "domain_config_conflict");
            }
            await recordAuditEvent(c, {
                action: "domain.disable",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                resource_id: id,
                resource_label: existing.domain,
                metadata: counts,
            });
            return c.json({
                success: true,
                ...counts,
                config_version: configVersion + 1,
            });
        } catch (error) {
            return apiError(c, error);
        }
    },

    importEnv: async (c: Context<HonoCustomType>) => {
        try {
            const body = await jsonBody(c);
            const overwrite = optionalBoolean(body, "overwrite", false);
            let imported = 0;
            for (const domain of getEnvDomainRegistry(c)) {
                const existing = await c.env.DB.prepare(
                    `SELECT id FROM managed_domains WHERE domain = ?`
                ).bind(domain.domain).first<number>("id");
                if (existing && !overwrite) continue;
                if (existing) {
                    await c.env.DB.prepare(
                        `UPDATE managed_domains SET display_label = ?, enabled = ?, receive_mode = ?,`
                        + ` allow_address_creation = ?, is_default = ?, allow_random_subdomain = ?,`
                        + ` allow_subdomain_match = ?, collector_address = ?, setup_status = ?,`
                        + ` config_version = config_version + 1, updated_at = datetime('now')`
                        + ` WHERE domain = ?`
                    ).bind(
                        domain.display_label,
                        boolToInt(domain.enabled),
                        domain.receive_mode,
                        boolToInt(domain.allow_address_creation),
                        boolToInt(domain.is_default),
                        boolToInt(domain.allow_random_subdomain),
                        domain.allow_subdomain_match === null ? null : boolToInt(!!domain.allow_subdomain_match),
                        domain.collector_address || null,
                        domain.setup_status,
                        domain.domain,
                    ).run();
                } else {
                    await c.env.DB.prepare(
                        `INSERT INTO managed_domains`
                        + ` (domain, display_label, enabled, receive_mode, allow_address_creation, is_default,`
                        + ` allow_random_subdomain, allow_subdomain_match, collector_address, setup_status)`
                        + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    ).bind(
                        domain.domain,
                        domain.display_label,
                        boolToInt(domain.enabled),
                        domain.receive_mode,
                        boolToInt(domain.allow_address_creation),
                        boolToInt(domain.is_default),
                        boolToInt(domain.allow_random_subdomain),
                        domain.allow_subdomain_match === null ? null : boolToInt(!!domain.allow_subdomain_match),
                        domain.collector_address || null,
                        domain.setup_status,
                    ).run();
                }
                imported += 1;
            }
            await recordAuditEvent(c, {
                action: "domain.import_env",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                metadata: { imported, overwrite },
            });
            return c.json({ success: true, imported });
        } catch (error) {
            return apiError(c, error);
        }
    },

    startVerification: async (c: Context<HonoCustomType>) => {
        try {
            const id = c.req.param("id");
            const existing = await getDomainById(c, id);
            if (!existing) throw new DomainApiError(404, "domain_not_found");
            if (!existing.enabled) throw new DomainApiError(409, "domain_disabled");
            const input = await jsonBody(c);
            const configVersion = requiredConfigVersion(input, existing);
            const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
            const collectorAddress = existing.receive_mode === "improvmx_forward"
                ? (existing.collector_address || await generateCollectorAddress(c, existing.domain))
                : existing.collector_address;
            if (existing.receive_mode === "improvmx_forward" && !collectorAddress) {
                throw new DomainApiError(422, "collector_address_required");
            }
            const setupStatus = existing.setup_status === "active"
                ? "active"
                : existing.receive_mode === "improvmx_forward"
                    ? "pending_forwarding"
                    : "pending_verification";
            const result = await c.env.DB.prepare(
                `UPDATE managed_domains SET verification_token = ?, collector_address = ?, setup_status = ?,`
                + ` verification_started_at = datetime('now'),`
                + ` verification_expires_at = datetime('now', ?),`
                + ` verification_consumed_at = NULL, last_error = NULL,`
                + ` config_version = config_version + 1, updated_at = datetime('now')`
                + ` WHERE id = ? AND config_version = ?`
            ).bind(
                token,
                collectorAddress || null,
                setupStatus,
                `+${VERIFICATION_TTL_MINUTES} minutes`,
                id,
                configVersion,
            ).run();
            if (!result.success || Number(result.meta?.changes || 0) !== 1) {
                throw new DomainApiError(409, "domain_config_conflict");
            }
            const domain = {
                ...existing,
                verification_token: token,
                collector_address: collectorAddress,
                setup_status: setupStatus,
                config_version: configVersion + 1,
            } as ManagedDomain;
            await recordAuditEvent(c, {
                action: "domain.verify.start",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                resource_id: id,
                resource_label: existing.domain,
                metadata: { ttl_minutes: VERIFICATION_TTL_MINUTES },
            });
            return c.json({
                success: true,
                verification_address: verificationAddress(domain),
                collector_address: collectorAddress,
                expires_in_minutes: VERIFICATION_TTL_MINUTES,
                config_version: configVersion + 1,
                improvmx_instructions: domain.receive_mode === "improvmx_forward"
                    ? improvmxInstructions(domain)
                    : [],
            });
        } catch (error) {
            return apiError(c, error);
        }
    },

    checkVerification: async (c: Context<HonoCustomType>) => {
        try {
            const id = c.req.param("id");
            const existing = await getDomainById(c, id);
            if (!existing) throw new DomainApiError(404, "domain_not_found");
            const input = await jsonBody(c);
            const configVersion = requiredConfigVersion(input, existing);
            if (
                !existing.verification_token
                || !existing.verification_started_at
                || !existing.verification_expires_at
            ) {
                throw new DomainApiError(400, "verification_not_started");
            }
            const now = Date.now();
            const expiry = Date.parse(existing.verification_expires_at.replace(" ", "T") + "Z");
            if (!Number.isFinite(expiry) || expiry < now) {
                const expiredResult = await c.env.DB.prepare(
                    `UPDATE managed_domains SET`
                    + ` setup_status = CASE WHEN setup_status = 'active' THEN 'active' ELSE 'error' END,`
                    + ` verification_token = NULL, verification_consumed_at = datetime('now'),`
                    + ` last_error = 'verification_expired', config_version = config_version + 1,`
                    + ` updated_at = datetime('now') WHERE id = ? AND config_version = ?`
                ).bind(id, configVersion).run();
                if (!expiredResult.success || Number(expiredResult.meta?.changes || 0) !== 1) {
                    throw new DomainApiError(409, "domain_config_conflict");
                }
                throw new DomainApiError(410, "verification_expired");
            }
            const expected = `verify-${existing.verification_token}@${existing.domain}`;
            const row = await c.env.DB.prepare(
                `SELECT id, created_at FROM raw_mails`
                + ` WHERE (lower(address) = ? OR lower(original_recipient) = ?)`
                + ` AND datetime(created_at) >= datetime(?)`
                + ` AND datetime(created_at) <= datetime(?)`
                + ` ORDER BY id DESC LIMIT 1`
            ).bind(
                expected,
                expected,
                existing.verification_started_at,
                existing.verification_expires_at,
            ).first<{ id: number, created_at: string }>();
            if (!row) {
                const notFoundResult = await c.env.DB.prepare(
                    `UPDATE managed_domains SET last_error = ?, config_version = config_version + 1,`
                    + ` updated_at = datetime('now') WHERE id = ? AND config_version = ?`
                ).bind(
                    `No verification mail found for ${expected}`,
                    id,
                    configVersion,
                ).run();
                if (!notFoundResult.success || Number(notFoundResult.meta?.changes || 0) !== 1) {
                    throw new DomainApiError(409, "domain_config_conflict");
                }
                return c.json({
                    success: false,
                    verification_address: expected,
                    message: "verification_mail_not_found",
                    config_version: configVersion + 1,
                });
            }
            const result = await c.env.DB.prepare(
                `UPDATE managed_domains SET setup_status = 'active', enabled = 1,`
                + ` verification_token = NULL, verification_consumed_at = datetime('now'),`
                + ` last_verified_at = datetime('now'), last_error = NULL,`
                + ` config_version = config_version + 1, updated_at = datetime('now')`
                + ` WHERE id = ? AND config_version = ?`
            ).bind(id, configVersion).run();
            if (!result.success || Number(result.meta?.changes || 0) !== 1) {
                throw new DomainApiError(409, "domain_config_conflict");
            }
            await recordAuditEvent(c, {
                action: "domain.verify.success",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                resource_id: id,
                resource_label: existing.domain,
                metadata: { raw_mail_id: row.id },
            });
            return c.json({
                success: true,
                verification_address: expected,
                raw_mail_id: row.id,
                config_version: configVersion + 1,
            });
        } catch (error) {
            return apiError(c, error);
        }
    },

    cloudflareCheck: async (c: Context<HonoCustomType>) => {
        try {
            const id = c.req.param("id");
            const existing = await getDomainById(c, id);
            if (!existing) throw new DomainApiError(404, "domain_not_found");
            if (existing.receive_mode !== "cloudflare_email") {
                throw new DomainApiError(400, "cloudflare_mode_required");
            }
            if (!hasCloudflareApiToken(c)) {
                throw new DomainApiError(503, "missing_cloudflare_api_token");
            }
            const state = await cloudflareState(c, existing);
            await recordAuditEvent(c, {
                action: "domain.cloudflare.check",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                resource_id: id,
                resource_label: existing.domain,
                metadata: { zone_id: state.zone.id, rules_count: state.rules.length },
            });
            return c.json({
                success: true,
                zone: state.zone,
                automatic_setup_supported: normalizeDomain(state.zone.name) === existing.domain,
                dns: state.dns.result || [],
                routing_settings: state.settings.result || null,
                rules: state.rules,
                catch_all: state.catchAll,
                setup_preview: state.plan,
                warnings: state.warnings,
            });
        } catch (error) {
            return apiError(c, error);
        }
    },

    cloudflareSetup: async (c: Context<HonoCustomType>) => {
        const id = c.req.param("id");
        let existing: ManagedDomain | null = null;
        try {
            existing = await getDomainById(c, id);
            if (!existing) throw new DomainApiError(404, "domain_not_found");
            if (existing.receive_mode !== "cloudflare_email") {
                throw new DomainApiError(400, "cloudflare_mode_required");
            }
            if (!hasCloudflareApiToken(c)) {
                throw new DomainApiError(503, "missing_cloudflare_api_token");
            }
            const input = await jsonBody(c);
            const configVersion = requiredConfigVersion(input, existing);
            const confirmReplaceCatchAll = optionalBoolean(
                input,
                "confirm_replace_catch_all",
                false
            );
            const state = await cloudflareState(c, existing, confirmReplaceCatchAll);
            if (normalizeDomain(state.zone.name) !== existing.domain) {
                throw new DomainApiError(422, "cloudflare_subdomain_automatic_setup_unsupported", {
                    zone_name: state.zone.name,
                });
            }
            if (state.plan.catch_all_conflict) {
                throw new DomainApiError(409, "cloudflare_catch_all_conflict", {
                    setup_preview: state.plan,
                    catch_all: state.catchAll,
                });
            }
            const versionClaim = await c.env.DB.prepare(
                `UPDATE managed_domains SET cloudflare_zone_id = ?, last_error = NULL,`
                + ` config_version = config_version + 1, updated_at = datetime('now')`
                + ` WHERE id = ? AND config_version = ?`
            ).bind(state.zone.id, id, configVersion).run();
            if (!versionClaim.success || Number(versionClaim.meta?.changes || 0) !== 1) {
                throw new DomainApiError(409, "domain_config_conflict");
            }

            let dnsResult = state.dns;
            if (state.plan.enable_dns) {
                dnsResult = await enableEmailRoutingDns(c, state.zone.id);
            }

            let catchAll: CloudflareRoutingRule | null = state.catchAll;
            if (state.plan.catch_all_action === "update") {
                const catchAllResult = await updateCatchAllWorkerRule(
                    c,
                    state.zone.id,
                    existing.domain,
                    state.workerName
                );
                catchAll = catchAllResult.result || null;
                await c.env.DB.prepare(
                    `UPDATE managed_domains SET cloudflare_catch_all_rule_id = ?,`
                    + ` config_version = config_version + 1, updated_at = datetime('now') WHERE id = ?`
                ).bind(catchAll?.id || null, id).run();
            }

            const nextSetupStatus = existing.setup_status === "active"
                ? "active"
                : "pending_verification";
            await c.env.DB.prepare(
                `UPDATE managed_domains SET cloudflare_zone_id = ?, cloudflare_catch_all_rule_id = ?,`
                + ` setup_status = ?, last_error = NULL, config_version = config_version + 1,`
                + ` updated_at = datetime('now') WHERE id = ?`
            ).bind(
                state.zone.id,
                catchAll?.id || null,
                nextSetupStatus,
                id,
            ).run();
            await recordAuditEvent(c, {
                action: "domain.cloudflare.setup",
                actor_type: "admin",
                actor_label: "admin",
                resource_type: "managed_domain",
                resource_id: id,
                resource_label: existing.domain,
                metadata: {
                    zone_id: state.zone.id,
                    catch_all_rule_id: catchAll?.id || null,
                    worker_name: state.workerName,
                    replaced_existing_catch_all: state.plan.catch_all_action === "update"
                        && !!state.catchAll,
                },
            });
            const updated = await getDomainById(c, id);
            return c.json({
                success: true,
                zone: state.zone,
                dns: dnsResult.result || [],
                catch_all: catchAll,
                setup_preview: state.plan,
                warnings: state.warnings,
                config_version: updated?.config_version,
            });
        } catch (error) {
            if (existing && !(error instanceof DomainApiError)) {
                await c.env.DB.prepare(
                    `UPDATE managed_domains SET`
                    + ` setup_status = CASE WHEN setup_status = 'active' THEN 'active' ELSE 'error' END,`
                    + ` last_error = ?, config_version = config_version + 1, updated_at = datetime('now')`
                    + ` WHERE id = ?`
                ).bind((error as Error).message, id).run().catch(() => undefined);
            }
            return apiError(c, error);
        }
    },
}
