import { describe, expect, it } from "vitest";

import {
    ADMIN_MAIL_READ_ACTOR,
    getAddressMailReadActor,
    getUserMailReadActor,
} from "../mail_read_state";

describe("mail read-state actor scope", () => {
    it("uses a single global admin actor for password-admin console reads", () => {
        expect(ADMIN_MAIL_READ_ACTOR).toEqual({
            actorType: "admin",
            actorId: "global",
        });
    });

    it("scopes address JWT reads by address id", () => {
        expect(getAddressMailReadActor({
            address: "ops@example.com",
            address_id: 42,
        })).toEqual({
            actorType: "address",
            actorId: "42",
            address: "ops@example.com",
        });
    });

    it("scopes share-token reads separately from address JWT reads", () => {
        expect(getAddressMailReadActor({
            address: "ops@example.com",
            address_id: 42,
            share_token_id: 7,
        })).toEqual({
            actorType: "share_token",
            actorId: "7",
            address: "ops@example.com",
        });
    });

    it("scopes account mailbox reads by user id", () => {
        expect(getUserMailReadActor({
            user_email: "user@example.com",
            user_id: 9,
            exp: 1,
            iat: 1,
        })).toEqual({
            actorType: "user",
            actorId: "9",
        });
    });
});
