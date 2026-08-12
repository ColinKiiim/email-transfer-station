/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import {
    CREDENTIAL_STORAGE_KEYS,
    PRESERVED_STORAGE_KEYS,
    clearSessionStorageKeys,
} from '../session'

/*
 * Signing out of one surface used to clear only that surface's credential.
 * `/user` cleared `userJwt` and left the address JWT in localStorage, so on a
 * shared browser the next visitor could open `/` and read the previous user's
 * mailbox. These tests pin the shared teardown.
 */

beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
})

const seedEverything = () => {
    for (const key of CREDENTIAL_STORAGE_KEYS.local) localStorage.setItem(key, `local-${key}`)
    for (const key of CREDENTIAL_STORAGE_KEYS.session) sessionStorage.setItem(key, `session-${key}`)
    for (const key of PRESERVED_STORAGE_KEYS) localStorage.setItem(key, `pref-${key}`)
}

describe('sign-out clears credentials from every surface', () => {
    it('removes the address JWT, not just the user session', () => {
        seedEverything()
        clearSessionStorageKeys()
        expect(localStorage.getItem('jwt')).toBeNull()
        expect(localStorage.getItem('userJwt')).toBeNull()
        expect(sessionStorage.getItem('adminAuth')).toBeNull()
        expect(sessionStorage.getItem('addressPassword')).toBeNull()
    })

    it('removes the compose draft so the next account cannot read it', () => {
        seedEverything()
        clearSessionStorageKeys()
        expect(sessionStorage.getItem('sendMailModel')).toBeNull()
    })

    it('clears every declared credential key', () => {
        seedEverything()
        clearSessionStorageKeys()
        for (const key of CREDENTIAL_STORAGE_KEYS.local) expect(localStorage.getItem(key)).toBeNull()
        for (const key of CREDENTIAL_STORAGE_KEYS.session) expect(sessionStorage.getItem(key)).toBeNull()
    })

    it('keeps device preferences, which are not account data', () => {
        seedEverything()
        clearSessionStorageKeys()
        for (const key of PRESERVED_STORAGE_KEYS) {
            expect(localStorage.getItem(key)).toBe(`pref-${key}`)
        }
    })

    it('never lists the same key as both cleared and preserved', () => {
        const cleared = new Set([...CREDENTIAL_STORAGE_KEYS.local, ...CREDENTIAL_STORAGE_KEYS.session])
        for (const key of PRESERVED_STORAGE_KEYS) expect(cleared.has(key)).toBe(false)
    })

    it('finishes the teardown even when one removal throws', () => {
        const throwing = {
            removeItem: (key) => { if (key === 'jwt') throw new Error('quota') },
        }
        const session = { removed: [], removeItem(key) { this.removed.push(key) } }
        expect(() => clearSessionStorageKeys({ local: throwing, session })).not.toThrow()
        expect(session.removed).toEqual([...CREDENTIAL_STORAGE_KEYS.session])
    })
})
