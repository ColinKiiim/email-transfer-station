import { describe, expect, it } from "vitest";

import { toAdminParsedMailRow } from "../admin_api/admin_mail_api";

describe("admin mail summaries", () => {
    it("keeps list responses lightweight while preserving useful preview fields", async () => {
        const raw = "From: Sender <sender@example.test>\r\nSubject: Large fixture\r\n\r\nHello " + "x".repeat(100_000);

        const summary = await toAdminParsedMailRow({ id: 7, raw }, false);

        expect(summary).not.toHaveProperty("raw");
        expect(summary).toMatchObject({
            id: 7,
            sender: "Sender <sender@example.test>",
            subject: "Large fixture",
            parse_status: "lightweight",
        });
        expect(String(summary.text)).toMatch(/^Hello /);
        expect(String(summary.text).length).toBeLessThanOrEqual(1000);
    });
});
