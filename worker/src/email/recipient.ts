type InboundRecipient = {
    address: string,
    originalRecipient: string,
    collectorAddress: string | null,
    originalDomain: string,
    ingressSource: "cloudflare-email" | "improvmx-forward" | "collector-unresolved",
    recipientConfidence: string,
    isVerificationRecipient: boolean,
}

export type InboundRecipientDomainConfig = {
    collectorAddresses: string[]
    managedReceiveDomains: string[]
    verificationRecipients?: string[]
}

const HEADER_CANDIDATES = [
    "delivered-to",
    "x-original-to",
    "x-forwarded-to",
    "envelope-to",
    "original-recipient",
    "to",
    "cc",
];

const normalizeAddress = (address: string | undefined | null): string => {
    return (address || "").trim().toLowerCase();
}

const getDomain = (address: string): string => {
    const at = address.lastIndexOf("@");
    return at >= 0 ? address.slice(at + 1).toLowerCase() : "";
}

const getConfiguredList = (value: string | string[] | undefined): string[] => {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.map(normalizeAddress).filter(Boolean);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => normalizeAddress(String(item))).filter(Boolean);
        }
    } catch (_) {
        // Support simple comma-separated values for dashboard-entered variables.
    }
    return trimmed.split(",").map(normalizeAddress).filter(Boolean);
}

const parseHeaderMap = (rawEmail: string): Map<string, string[]> => {
    const separator = rawEmail.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
    const headerSection = rawEmail.split(separator, 1)[0] || "";
    const normalizedLines = headerSection
        .replace(/\r?\n[ \t]+/g, " ")
        .split(/\r?\n/);
    const headers = new Map<string, string[]>();
    for (const line of normalizedLines) {
        const idx = line.indexOf(":");
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        const values = headers.get(key) || [];
        values.push(value);
        headers.set(key, values);
    }
    return headers;
}

const extractEmailAddresses = (value: string): string[] => {
    const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return matches.map(normalizeAddress).filter(Boolean);
}

const isManagedRecipient = (
    address: string,
    managedDomains: string[],
    collectorAddresses: string[],
    verificationRecipients: string[]
): boolean => {
    if (!address || collectorAddresses.includes(address)) {
        return false;
    }
    if (verificationRecipients.includes(address)) {
        return true;
    }
    const domain = getDomain(address);
    return managedDomains.includes(domain);
}

const findOriginalRecipient = (
    rawEmail: string,
    managedDomains: string[],
    collectorAddresses: string[],
    verificationRecipients: string[]
): { address: string, source: string } | null => {
    const headers = parseHeaderMap(rawEmail);
    for (const header of HEADER_CANDIDATES) {
        const values = headers.get(header) || [];
        for (const value of values) {
            for (const address of extractEmailAddresses(value)) {
                if (isManagedRecipient(address, managedDomains, collectorAddresses, verificationRecipients)) {
                    return { address, source: header };
                }
            }
        }
    }
    return null;
}

export const resolveInboundRecipient = (
    message: ForwardableEmailMessage,
    rawEmail: string,
    domainConfig: InboundRecipientDomainConfig
): InboundRecipient => {
    const messageTo = normalizeAddress(message.to);
    const collectorAddresses = domainConfig.collectorAddresses.map(normalizeAddress).filter(Boolean);
    const managedDomains = domainConfig.managedReceiveDomains
        .map((item) => item.startsWith("@") ? item.slice(1) : item)
        .map((item) => item.includes("@") ? getDomain(item) : item)
        .filter(Boolean);
    const verificationRecipients = (domainConfig.verificationRecipients || [])
        .map(normalizeAddress)
        .filter(Boolean);

    if (!collectorAddresses.includes(messageTo)) {
        return {
            address: messageTo,
            originalRecipient: messageTo,
            collectorAddress: null,
            originalDomain: getDomain(messageTo),
            ingressSource: "cloudflare-email",
            recipientConfidence: "message-to",
            isVerificationRecipient: verificationRecipients.includes(messageTo),
        };
    }

    const original = findOriginalRecipient(
        rawEmail,
        managedDomains,
        collectorAddresses,
        verificationRecipients
    );
    if (original) {
        return {
            address: original.address,
            originalRecipient: original.address,
            collectorAddress: messageTo,
            originalDomain: getDomain(original.address),
            ingressSource: "improvmx-forward",
            recipientConfidence: original.source,
            isVerificationRecipient: verificationRecipients.includes(original.address),
        };
    }

    return {
        address: messageTo,
        originalRecipient: messageTo,
        collectorAddress: messageTo,
        originalDomain: getDomain(messageTo),
        ingressSource: "collector-unresolved",
        recipientConfidence: "unresolved",
        isVerificationRecipient: false,
    };
}
