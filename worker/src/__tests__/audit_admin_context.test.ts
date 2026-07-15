import { describe, expect, it } from "vitest";

import { recordAuditEvent } from "../audit";

describe("admin audit attribution", () => {
    it("replaces generic admin labels with the authenticated actor and request ID", async () => {
        let bindings: unknown[] = [];
        const context = {
            env: {
                DB: {
                    prepare: () => ({
                        bind: (...values: unknown[]) => {
                            bindings = values;
                            return { run: async () => ({ success: true }) };
                        },
                    }),
                },
            },
            get: (key: string) => {
                if (key === "adminActor") {
                    return {
                        actor_type: "user",
                        actor_id: 42,
                        actor_label: "operator@example.test",
                        auth_method: "admin_user_role",
                    };
                }
                if (key === "adminRequestId") return "12345678-1234-4123-8123-123456789abc";
                return undefined;
            },
            req: {
                method: "POST",
                path: "/api/admin/account_settings",
                raw: { headers: new Headers() },
            },
        } as unknown as Parameters<typeof recordAuditEvent>[0];

        await recordAuditEvent(context, {
            action: "account.settings.update",
            actor_type: "admin",
            actor_label: "admin",
            resource_type: "account_settings",
            metadata: { block_list_count: 2 },
        });

        expect(bindings[0]).toBe("user");
        expect(bindings[1]).toBe("42");
        expect(bindings[2]).toBe("operator@example.test");
        expect(JSON.parse(String(bindings[13]))).toEqual({
            block_list_count: 2,
            request_id: "12345678-1234-4123-8123-123456789abc",
        });
    });
});
