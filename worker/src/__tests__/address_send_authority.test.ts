import { describe, expect, it } from "vitest";

import { authorizeAddressSend } from "../address_authority";

/*
 * `/external/api/send_mail` is the SMTP proxy's only send path. It is mounted
 * under /external/ and so never passes through the /api/* auth middleware,
 * which is where credential-version checking and the share-token read-only
 * allow-list live. Verifying the JWT signature alone would therefore accept:
 *
 *   - an address credential that has since been rotated (revoked), and
 *   - a read-only share link, letting a share recipient send AS the mailbox.
 *
 * These tests pin the replacement check.
 */

const ctx = (row: unknown) => ({
    env: {
        DB: {
            prepare: () => ({
                bind: () => ({ first: async () => row }),
            }),
        },
    },
} as never)

describe("send authority for address-scoped JWTs", () => {
    it("accepts a current address credential", async () => {
        const result = await authorizeAddressSend(
            ctx({ name: "ops@example.test", credential_version: 3 }),
            { address: "ops@example.test", address_id: 1, credential_version: 3 } as never,
        )
        expect(result).toEqual({ ok: true, address: "ops@example.test" })
    })

    it("rejects a credential whose version was rotated away", async () => {
        const result = await authorizeAddressSend(
            ctx({ name: "ops@example.test", credential_version: 4 }),
            { address: "ops@example.test", address_id: 1, credential_version: 3 } as never,
        )
        expect(result).toEqual({ ok: false, reason: "invalid" })
    })

    it("rejects a read-only share token outright, before touching the database", async () => {
        const result = await authorizeAddressSend(
            ctx(null),
            { address: "ops@example.test", address_id: 1, share_token_id: "share-1" } as never,
        )
        expect(result).toEqual({ ok: false, reason: "read_only" })
    })

    it("rejects a token whose address no longer matches the row", async () => {
        const result = await authorizeAddressSend(
            ctx({ name: "renamed@example.test", credential_version: 1 }),
            { address: "ops@example.test", address_id: 1, credential_version: 1 } as never,
        )
        expect(result).toEqual({ ok: false, reason: "invalid" })
    })

    it("rejects a payload with no address binding at all", async () => {
        const result = await authorizeAddressSend(ctx(null), { address: "ops@example.test" } as never)
        expect(result).toEqual({ ok: false, reason: "invalid" })
    })
})
