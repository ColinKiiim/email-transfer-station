import { Context } from "hono";

import { normalizeDomain } from "./domains";
import { getStringValue } from "./utils";

const API_BASE = "https://api.cloudflare.com/client/v4";

export type CloudflareResponse<T = unknown> = {
    success: boolean
    errors?: { code?: number, message?: string }[]
    messages?: { code?: number, message?: string }[]
    result?: T
}

export type CloudflareZone = {
    id: string
    name: string
    status?: string
}

export type CloudflareRoutingAction = {
    type: string
    value?: string[]
}

export type CloudflareRoutingRule = {
    id?: string
    name?: string
    enabled?: boolean
    priority?: number
    matchers?: { type: string, field?: string, value?: string }[]
    actions?: CloudflareRoutingAction[]
}

export type CloudflareDnsRecord = {
    name?: string
    type?: string
    content?: string
    priority?: number
}

export type CloudflareEmailRoutingSettings = {
    id?: string
    enabled?: boolean
    name?: string
    status?: string
}

export type CloudflareReconcilePlan = {
    dns_enabled: boolean
    enable_dns: boolean
    catch_all_owned: boolean
    catch_all_conflict: boolean
    catch_all_action: "none" | "update" | "conflict"
}

export const hasCloudflareApiToken = (c: Context<HonoCustomType>): boolean => {
    return !!getStringValue(c.env.CLOUDFLARE_API_TOKEN);
}

const safeCloudflareError = (endpoint: string, status: number, response: CloudflareResponse): Error => {
    const messages = [
        ...(response.errors || []),
        ...(response.messages || []),
    ].map((item) => item.message || item.code).filter(Boolean).join("; ");
    return new Error(`Cloudflare API ${status} ${endpoint}: ${messages || "request failed"}`);
}

const cfFetch = async <T>(
    c: Context<HonoCustomType>,
    endpoint: string,
    init: RequestInit = {}
): Promise<CloudflareResponse<T>> => {
    const token = getStringValue(c.env.CLOUDFLARE_API_TOKEN);
    if (!token) {
        throw new Error("missing_cloudflare_api_token");
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...init,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });
    const data = await response.json<CloudflareResponse<T>>().catch(() => ({
        success: false,
        errors: [{ message: "invalid_json_response" }],
    }));
    if (!response.ok || data.success === false) {
        throw safeCloudflareError(endpoint, response.status, data);
    }
    return data;
}

export const getCloudflareWorkerName = (c: Context<HonoCustomType>): string => {
    return getStringValue(c.env.CLOUDFLARE_EMAIL_WORKER_NAME) || "email-transfer-station-api";
}

export const listZonesByName = async (
    c: Context<HonoCustomType>,
    domain: string
): Promise<CloudflareZone[]> => {
    const response = await cfFetch<CloudflareZone[]>(
        c,
        `/zones?name=${encodeURIComponent(normalizeDomain(domain))}&status=active`
    );
    return (response.result || []).map((zone) => ({
        id: zone.id,
        name: normalizeDomain(zone.name),
        status: zone.status,
    }));
}

export const getZoneById = async (
    c: Context<HonoCustomType>,
    zoneId: string
): Promise<CloudflareZone | null> => {
    const response = await cfFetch<CloudflareZone>(c, `/zones/${encodeURIComponent(zoneId)}`);
    return response.result
        ? {
            id: response.result.id,
            name: normalizeDomain(response.result.name),
            status: response.result.status,
        }
        : null;
}

export const isDomainWithinZone = (domain: string, zoneName: string): boolean => {
    const normalizedDomain = normalizeDomain(domain);
    const normalizedZone = normalizeDomain(zoneName);
    return normalizedDomain === normalizedZone || normalizedDomain.endsWith(`.${normalizedZone}`);
}

export const resolveCloudflareZone = async (
    c: Context<HonoCustomType>,
    domain: string,
    configuredZoneId?: string | null
): Promise<CloudflareZone | null> => {
    const normalizedDomain = normalizeDomain(domain);
    if (configuredZoneId) {
        const zone = await getZoneById(c, configuredZoneId);
        if (!zone || zone.status === "pending" || !isDomainWithinZone(normalizedDomain, zone.name)) {
            throw new Error("cloudflare_zone_domain_mismatch");
        }
        return zone;
    }

    const labels = normalizedDomain.split(".");
    for (let index = 0; index <= labels.length - 2; index++) {
        const candidate = labels.slice(index).join(".");
        const zones = await listZonesByName(c, candidate);
        const zone = zones.find((item) => isDomainWithinZone(normalizedDomain, item.name));
        if (zone) return zone;
    }
    return null;
}

export const getEmailRoutingDns = async (
    c: Context<HonoCustomType>,
    zoneId: string
): Promise<CloudflareResponse<CloudflareDnsRecord[]>> => {
    return cfFetch(c, `/zones/${zoneId}/email/routing/dns`);
}

export const getEmailRoutingSettings = async (
    c: Context<HonoCustomType>,
    zoneId: string
): Promise<CloudflareResponse<CloudflareEmailRoutingSettings>> => {
    return cfFetch(c, `/zones/${zoneId}/email/routing`);
}

export const enableEmailRoutingDns = async (
    c: Context<HonoCustomType>,
    zoneId: string
): Promise<CloudflareResponse<CloudflareDnsRecord[]>> => {
    return cfFetch(c, `/zones/${zoneId}/email/routing/dns`, { method: "POST" });
}

export const listEmailRoutingRules = async (
    c: Context<HonoCustomType>,
    zoneId: string
): Promise<CloudflareRoutingRule[]> => {
    const response = await cfFetch<CloudflareRoutingRule[]>(
        c,
        `/zones/${zoneId}/email/routing/rules`
    );
    return response.result || [];
}

export const getEmailRoutingCatchAll = async (
    c: Context<HonoCustomType>,
    zoneId: string
): Promise<CloudflareResponse<CloudflareRoutingRule>> => {
    return cfFetch(c, `/zones/${zoneId}/email/routing/rules/catch_all`);
}

export const isWorkerRoutingRule = (
    rule: CloudflareRoutingRule | null | undefined,
    workerName: string
): boolean => {
    return !!rule?.actions?.some((action) =>
        action.type === "worker" && (action.value || []).includes(workerName)
    );
}

export const planCloudflareReconcile = (
    routingEnabled: boolean,
    catchAll: CloudflareRoutingRule | null | undefined,
    workerName: string,
    confirmReplaceCatchAll = false
): CloudflareReconcilePlan => {
    const catchAllOwned = isWorkerRoutingRule(catchAll, workerName);
    const catchAllConflict = !!catchAll && !catchAllOwned && !confirmReplaceCatchAll;
    return {
        dns_enabled: routingEnabled,
        enable_dns: !routingEnabled,
        catch_all_owned: catchAllOwned,
        catch_all_conflict: catchAllConflict,
        catch_all_action: catchAllOwned
            ? "none"
            : catchAllConflict
                ? "conflict"
                : "update",
    };
}

export const updateCatchAllWorkerRule = async (
    c: Context<HonoCustomType>,
    zoneId: string,
    domain: string,
    workerName = getCloudflareWorkerName(c)
): Promise<CloudflareResponse<CloudflareRoutingRule>> => {
    return cfFetch(c, `/zones/${zoneId}/email/routing/rules/catch_all`, {
        method: "PUT",
        body: JSON.stringify({
            name: `Email Transfer Station catch-all ${normalizeDomain(domain)}`,
            enabled: true,
            matchers: [{ type: "all" }],
            actions: [{ type: "worker", value: [workerName] }],
        }),
    });
}
