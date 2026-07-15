import { afterEach, describe, expect, it, vi } from "vitest";

import { sendWebhook } from "../common";

const SECRET_URL = "https://hooks.example.test/path/url-secret-canary";
const SECRET_HEADER = "header-secret-canary";
const SECRET_BODY = "mail-body-secret-canary";

const settings = {
    enabled: true,
    url: SECRET_URL,
    method: "POST",
    headers: JSON.stringify({ Authorization: `Bearer ${SECRET_HEADER}` }),
    body: JSON.stringify({ raw: "${raw}" }),
};

const mail = {
    id: "1",
    url: "https://mail.example.test/?mail_id=1",
    from: "sender@example.test",
    to: "recipient@example.test",
    subject: "subject",
    raw: SECRET_BODY,
    parsedText: SECRET_BODY,
    parsedHtml: `<p>${SECRET_BODY}</p>`,
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("webhook failure logging", () => {
    it("records only non-secret response metadata", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", {
            status: 502,
            statusText: "Bad Gateway",
        })));
        const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const result = await sendWebhook(settings, mail);
        const logOutput = JSON.stringify(warning.mock.calls);

        expect(result).toEqual({ success: false, message: "send webhook error: 502 Bad Gateway" });
        expect(logOutput).toContain("502");
        expect(logOutput).not.toContain(SECRET_URL);
        expect(logOutput).not.toContain(SECRET_HEADER);
        expect(logOutput).not.toContain(SECRET_BODY);
    });

    it("does not expose a secret-bearing transport exception", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
            new TypeError(`request to ${SECRET_URL} failed with ${SECRET_HEADER} and ${SECRET_BODY}`),
        ));
        const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const result = await sendWebhook(settings, mail);
        const logOutput = JSON.stringify(warning.mock.calls);

        expect(result).toEqual({ success: false, message: "send webhook error" });
        expect(logOutput).toContain("TypeError");
        expect(logOutput).not.toContain(SECRET_URL);
        expect(logOutput).not.toContain(SECRET_HEADER);
        expect(logOutput).not.toContain(SECRET_BODY);
    });
});
