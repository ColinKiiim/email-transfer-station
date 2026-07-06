import { describe, expect, it } from "vitest";

import { fallbackBodyPreview } from "../admin_api/admin_mail_api";

describe("admin mail lightweight parser", () => {
    it("decodes quoted-printable text previews", () => {
        const raw = [
            "From: ChatGPT <noreply@email.openai.com>",
            "Subject: Get updates about ChatGPT",
            "Content-Type: text/plain; charset=UTF-8",
            "Content-Transfer-Encoding: quoted-printable",
            "",
            "Choose how you=E2=80=99d like to stay in the loop.=20",
            "Get updates about ChatGPT",
        ].join("\r\n");

        expect(fallbackBodyPreview(raw)).toBe("Choose how you\u2019d like to stay in the loop. Get updates about ChatGPT");
    });
});
