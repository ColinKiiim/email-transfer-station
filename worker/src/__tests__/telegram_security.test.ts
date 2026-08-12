import { Context } from "hono";
import { Jwt } from "hono/utils/jwt";
import { describe, expect, it } from "vitest";

import { validateTelegramCredential } from "../telegram_api/common";
import {
    deriveTelegramWebhookSecret,
    isPrivateTelegramIdentity,
    verifyTelegramWebhookSecret,
} from "../telegram_api/security";

const SECRET = "fixture-jwt-secret";

const context = (credentialVersion = 1) => ({
    env: {
        JWT_SECRET: SECRET,
        DB: {
            prepare: (sql: string) => {
                let bindings: unknown[] = [];
                return {
                    bind(...values: unknown[]) {
                        bindings = values;
                        return this;
                    },
                    first: async (column?: string) => {
                        if (/FROM address_share_tokens/i.test(sql)) return column === "id" ? 9 : { id: 9 };
                        if (/FROM address WHERE id/i.test(sql) && bindings[0] === 7) {
                            return { name: "ops@example.test", credential_version: credentialVersion };
                        }
                        return null;
                    },
                };
            },
        } as unknown as D1Database,
    } as Bindings,
}) as Context<HonoCustomType>;

describe("Telegram webhook boundary", () => {
    it("requires the derived webhook secret and a matching private-chat identity", async () => {
        const token = "123456:fixture-bot-token";
        const secret = await deriveTelegramWebhookSecret(token);

        expect(secret).toMatch(/^[0-9a-f]{64}$/);
        await expect(verifyTelegramWebhookSecret(token, secret)).resolves.toBe(true);
        await expect(verifyTelegramWebhookSecret(token, "wrong-secret")).resolves.toBe(false);
        await expect(verifyTelegramWebhookSecret(token, undefined)).resolves.toBe(false);
        expect(isPrivateTelegramIdentity("private", 42, 42)).toBe(true);
        expect(isPrivateTelegramIdentity("private", 7, 42)).toBe(false);
        expect(isPrivateTelegramIdentity("group", 42, 42)).toBe(false);
    });

    it("reuses address and share-token authority instead of trusting a signature alone", async () => {
        const addressToken = await Jwt.sign({
            address: "ops@example.test",
            address_id: 7,
            credential_version: 1,
        }, SECRET, "HS256");
        const shareToken = await Jwt.sign({
            address: "ops@example.test",
            address_id: 7,
            share_token_id: 9,
        }, SECRET, "HS256");

        await expect(validateTelegramCredential(context(1), addressToken)).resolves.toEqual({
            address: "ops@example.test",
            addressId: 7,
            readOnly: false,
        });
        await expect(validateTelegramCredential(context(2), addressToken)).resolves.toBeNull();
        await expect(validateTelegramCredential(context(1), shareToken)).resolves.toEqual({
            address: "ops@example.test",
            addressId: 7,
            readOnly: true,
        });
    });
});
