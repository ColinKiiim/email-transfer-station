import { describe, expect, it } from "vitest";

import {
    isDomainWithinZone,
    planCloudflareReconcile,
} from "../cloudflare_api";
import {
    findMatchedAddressCreationDomain,
    isVerificationPending,
    ManagedDomain,
    toPublicManagedDomain,
} from "../domains";
import { resolveInboundRecipient } from "../email/recipient";

const domain = (overrides: Partial<ManagedDomain> = {}): ManagedDomain => ({
    id: 1,
    domain: "example.com",
    display_label: "Example",
    enabled: true,
    receive_mode: "cloudflare_email",
    allow_address_creation: true,
    is_default: false,
    allow_random_subdomain: false,
    allow_subdomain_match: null,
    setup_status: "active",
    config_version: 1,
    source: "db",
    ...overrides,
});

describe("managed domain policy", () => {
    it("keeps the public DTO free of verification and Cloudflare identifiers", () => {
        const result = toPublicManagedDomain(domain({
            verification_token: "secret-token",
            cloudflare_zone_id: "zone-id",
            notes: "internal",
        }));
        expect(result).toEqual({
            domain: "example.com",
            display_label: "Example",
            is_default: false,
            allow_random_subdomain: false,
        });
        expect(result).not.toHaveProperty("verification_token");
        expect(result).not.toHaveProperty("cloudflare_zone_id");
    });

    it("applies per-domain subdomain overrides and the global kill switch", () => {
        const inherited = domain({ allow_subdomain_match: null });
        const denied = domain({ domain: "denied.example", allow_subdomain_match: false });
        const allowed = domain({ domain: "allowed.example", allow_subdomain_match: true });

        expect(findMatchedAddressCreationDomain("team.example.com", [inherited], true)?.domain)
            .toBe("example.com");
        expect(findMatchedAddressCreationDomain("team.denied.example", [denied], true))
            .toBeNull();
        expect(findMatchedAddressCreationDomain("team.allowed.example", [allowed], false)?.domain)
            .toBe("allowed.example");
        expect(findMatchedAddressCreationDomain("team.allowed.example", [allowed], true, true))
            .toBeNull();
    });

    it("requires a live, unconsumed verification window", () => {
        const now = Date.parse("2026-06-18T12:00:00Z");
        expect(isVerificationPending({
            verification_token: "token",
            verification_started_at: "2026-06-18 11:55:00",
            verification_expires_at: "2026-06-18 12:25:00",
            verification_consumed_at: null,
        }, now)).toBe(true);
        expect(isVerificationPending({
            verification_token: "token",
            verification_started_at: "2026-06-18 11:00:00",
            verification_expires_at: "2026-06-18 11:30:00",
            verification_consumed_at: null,
        }, now)).toBe(false);
    });
});

describe("Cloudflare reconcile policy", () => {
    const existingForward = {
        id: "catch-all",
        actions: [{ type: "forward", value: ["owner@example.net"] }],
        matchers: [{ type: "all" }],
    };
    const ownedWorker = {
        id: "catch-all",
        actions: [{ type: "worker", value: ["email-transfer-station-api"] }],
        matchers: [{ type: "all" }],
    };

    it("refuses to replace an unknown catch-all without explicit confirmation", () => {
        expect(planCloudflareReconcile(
            true,
            existingForward,
            "email-transfer-station-api",
            false,
        )).toMatchObject({
            enable_dns: false,
            catch_all_conflict: true,
            catch_all_action: "conflict",
        });
    });

    it("is idempotent when the catch-all already targets this Worker", () => {
        expect(planCloudflareReconcile(
            true,
            ownedWorker,
            "email-transfer-station-api",
            false,
        )).toMatchObject({
            enable_dns: false,
            catch_all_owned: true,
            catch_all_action: "none",
        });
    });

    it("validates that a configured zone is the domain or a parent", () => {
        expect(isDomainWithinZone("mail.example.com", "example.com")).toBe(true);
        expect(isDomainWithinZone("example.net", "example.com")).toBe(false);
    });
});

describe("ImprovMX verification recipient resolution", () => {
    const collector = "mx-new-example@collector.example";
    const verification = "verify-token@new.example";
    const message = {
        to: collector,
    } as ForwardableEmailMessage;

    it("accepts only the exact pending verification recipient", () => {
        const raw = [
            "From: sender@example.net",
            `Delivered-To: ${verification}`,
            `To: ${collector}`,
            "",
            "test",
        ].join("\r\n");
        const result = resolveInboundRecipient(message, raw, {
            collectorAddresses: [collector],
            managedReceiveDomains: [],
            verificationRecipients: [verification],
        });
        expect(result.address).toBe(verification);
        expect(result.ingressSource).toBe("improvmx-forward");
        expect(result.isVerificationRecipient).toBe(true);
    });

    it("does not trust arbitrary forwarded recipients for an unverified domain", () => {
        const raw = [
            "From: sender@example.net",
            "Delivered-To: arbitrary@new.example",
            `To: ${collector}`,
            "",
            "test",
        ].join("\r\n");
        const result = resolveInboundRecipient(message, raw, {
            collectorAddresses: [collector],
            managedReceiveDomains: [],
            verificationRecipients: [verification],
        });
        expect(result.address).toBe(collector);
        expect(result.ingressSource).toBe("collector-unresolved");
        expect(result.isVerificationRecipient).toBe(false);
    });
});
