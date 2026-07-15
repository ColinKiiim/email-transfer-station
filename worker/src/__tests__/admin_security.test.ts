import { Jwt } from "hono/utils/jwt";
import { describe, expect, it } from "vitest";

import {
    ADMIN_SESSION_AUDIENCE,
    ADMIN_SESSION_ISSUER,
    ADMIN_SESSION_TTL_SECONDS,
    adminWriteRequiresConfirmation,
    issueAdminSession,
    verifyAdminSession,
} from "../admin_security";

const SECRET = "fixture-admin-session-secret";
const NOW = Math.floor(Date.now() / 1000);

describe("admin session contract", () => {
    it("issues a bounded audience-specific session with a unique identifier", async () => {
        const token = await issueAdminSession("fixture-admin", SECRET, NOW);
        const payload = await Jwt.verify(token, SECRET, "HS256");

        expect(payload).toMatchObject({
            iss: ADMIN_SESSION_ISSUER,
            aud: ADMIN_SESSION_AUDIENCE,
            sub: "fixture-admin",
            username: "fixture-admin",
            scope: "admin_session",
            iat: NOW,
            nbf: NOW,
            exp: NOW + ADMIN_SESSION_TTL_SECONDS,
        });
        expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
        await expect(verifyAdminSession(token, SECRET, NOW)).resolves.toMatchObject({
            actor_type: "admin",
            actor_label: "fixture-admin",
            auth_method: "admin_session",
            session_id: payload.jti,
        });
    });

    it("rejects missing claims, excessive lifetimes, expiry and the wrong audience", async () => {
        const sign = (claims: Record<string, unknown>) => Jwt.sign({
            iss: ADMIN_SESSION_ISSUER,
            aud: ADMIN_SESSION_AUDIENCE,
            sub: "fixture-admin",
            scope: "admin_session",
            username: "fixture-admin",
            iat: NOW,
            nbf: NOW,
            exp: NOW + 60,
            jti: "fixture-jti",
            ...claims,
        }, SECRET, "HS256");

        await expect(verifyAdminSession(await sign({ aud: "other" }), SECRET, NOW)).resolves.toBeNull();
        await expect(verifyAdminSession(await sign({ sub: "other" }), SECRET, NOW)).resolves.toBeNull();
        await expect(verifyAdminSession(await sign({ jti: undefined }), SECRET, NOW)).resolves.toBeNull();
        await expect(verifyAdminSession(await sign({ exp: NOW - 1 }), SECRET, NOW)).resolves.toBeNull();
        await expect(verifyAdminSession(
            await sign({ exp: NOW + ADMIN_SESSION_TTL_SECONDS + 1 }),
            SECRET,
            NOW,
        )).resolves.toBeNull();
    });
});

describe("admin write confirmation routing", () => {
    it("requires confirmation for every delete and selected high-impact posts", () => {
        expect(adminWriteRequiresConfirmation("DELETE", "/api/admin/mails/7")).toBe(true);
        expect(adminWriteRequiresConfirmation("POST", "/api/admin/address/7/credential")).toBe(true);
        expect(adminWriteRequiresConfirmation("POST", "/api/admin/address/7/rotate_credential")).toBe(true);
        expect(adminWriteRequiresConfirmation("POST", "/api/admin/db_migration")).toBe(true);
        expect(adminWriteRequiresConfirmation("POST", "/api/admin/domains/7/cloudflare/setup")).toBe(true);
    });

    it("does not add ceremonial confirmation to ordinary reads and explicit create payloads", () => {
        expect(adminWriteRequiresConfirmation("GET", "/api/admin/mails")).toBe(false);
        expect(adminWriteRequiresConfirmation("PATCH", "/api/admin/mails/7/read_state")).toBe(false);
        expect(adminWriteRequiresConfirmation("POST", "/api/admin/new_address")).toBe(false);
        expect(adminWriteRequiresConfirmation("POST", "/api/admin/send_mail")).toBe(false);
    });
});
