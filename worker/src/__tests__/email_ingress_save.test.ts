import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above module scope, so the spies they close over
// have to be created with vi.hoisted.
const {
    forwardEmail,
    sendMailToTelegram,
    triggerWebhook,
    triggerAnotherWorker,
    autoReply,
    extractEmailInfo,
} = vi.hoisted(() => ({
    forwardEmail: vi.fn(async () => undefined),
    sendMailToTelegram: vi.fn(async () => undefined),
    triggerWebhook: vi.fn(async () => undefined),
    triggerAnotherWorker: vi.fn(async () => undefined),
    autoReply: vi.fn(async () => undefined),
    extractEmailInfo: vi.fn(async () => undefined),
}));

vi.mock("../email/forward", () => ({ forwardEmail }));
vi.mock("../telegram_api", () => ({ sendMailToTelegram }));
vi.mock("../email/auto_reply", () => ({ auto_reply: autoReply }));
vi.mock("../email/ai_extract", () => ({ extractEmailInfo }));
vi.mock("../email/black_list", () => ({ isBlocked: async () => false }));
vi.mock("../email/check_junk", () => ({ check_if_junk_mail: async () => false }));
vi.mock("../email/check_attachment", () => ({ remove_attachment_if_need: async () => undefined }));
vi.mock("../common", () => ({
    triggerWebhook,
    triggerAnotherWorker,
    commonParseMail: async () => ({ text: "body" }),
}));
vi.mock("../domains", () => ({
    getCollectorAddresses: async () => [],
    getManagedReceiveDomains: async () => [],
    getPendingVerificationRecipients: async () => [],
}));
vi.mock("../utils", () => ({
    getBooleanValue: () => false,
    getJsonSetting: async () => null,
}));
vi.mock("../email/recipient", () => ({
    resolveInboundRecipient: () => ({
        address: "inbox@example.test",
        originalRecipient: "inbox@example.test",
        collectorAddress: null,
        originalDomain: "example.test",
        ingressSource: "cloudflare",
        recipientConfidence: "exact",
        isVerificationRecipient: false,
    }),
}));

import { email } from "../email/index";
import { buildInboundDedupKey } from "../email/idempotency";

const RAW = "From: sender@example.test\r\nSubject: hi\r\n\r\nbody";

const makeMessage = () => ({
    from: "sender@example.test",
    to: "inbox@example.test",
    raw: new Response(RAW).body,
    rawSize: RAW.length,
    headers: new Headers({ "Message-ID": "<m1@example.test>" }),
    setReject: vi.fn(),
});

/** DB whose durable mail INSERT behaviour the test controls. */
const makeEnv = (
    run: () => Promise<{ success: boolean }>,
    duplicate = false,
) => ({
    DB: {
        prepare: (sql: string) => ({
            bind: () => ({ sql }),
            first: async () => null,
        }),
        batch: async () => {
            if (duplicate) {
                throw new Error(
                    "UNIQUE constraint failed: inbound_mail_receipts.address, inbound_mail_receipts.dedup_key"
                );
            }
            const saved = await run();
            return [
                { success: true, meta: { changes: 1 } },
                { ...saved, meta: { last_row_id: 7 } },
            ];
        },
    },
} as unknown as Bindings);

const sideEffects = [forwardEmail, sendMailToTelegram, triggerWebhook, triggerAnotherWorker, autoReply, extractEmailInfo];

beforeEach(() => {
    for (const fn of sideEffects) fn.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("inbound mail is never silently dropped", () => {
    it("rejects the delivery and skips side effects when the insert throws", async () => {
        const message = makeMessage();
        const env = makeEnv(async () => { throw new Error("D1_ERROR: statement too large"); });

        await email(message as never, env, {} as ExecutionContext);

        expect(message.setReject).toHaveBeenCalledTimes(1);
        expect(message.setReject.mock.calls[0][0]).toContain("inbox@example.test");
        for (const fn of sideEffects) expect(fn).not.toHaveBeenCalled();
    });

    it("rejects the delivery and skips side effects when the insert reports failure", async () => {
        const message = makeMessage();
        const env = makeEnv(async () => ({ success: false }));

        await email(message as never, env, {} as ExecutionContext);

        expect(message.setReject).toHaveBeenCalledTimes(1);
        for (const fn of sideEffects) expect(fn).not.toHaveBeenCalled();
    });

    it("accepts the delivery and runs side effects when the insert succeeds", async () => {
        const message = makeMessage();
        const env = makeEnv(async () => ({ success: true }));

        await email(message as never, env, {} as ExecutionContext);

        expect(message.setReject).not.toHaveBeenCalled();
        expect(forwardEmail).toHaveBeenCalledTimes(1);
        expect(autoReply).toHaveBeenCalledTimes(1);
        expect(extractEmailInfo).toHaveBeenCalledTimes(1);
    });

    it("accepts a duplicate receipt without repeating storage or side effects", async () => {
        const message = makeMessage();
        const insert = vi.fn(async () => ({ success: true }));

        await email(message as never, makeEnv(insert, true), {} as ExecutionContext);

        expect(message.setReject).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
        for (const fn of sideEffects) expect(fn).not.toHaveBeenCalled();
    });

    it("falls back to a stable content hash when Message-ID is absent", async () => {
        const first = await buildInboundDedupKey("inbox@example.test", null, RAW);
        const second = await buildInboundDedupKey("inbox@example.test", null, RAW);
        expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(second).toBe(first);
    });
});
