import { describe, expect, it, vi } from 'vitest'

import {
    consumeOAuthAttempt,
    createOAuthAttempt,
    OAUTH_ATTEMPT_TTL_MS,
} from '../oauth-state'

const memoryStorage = () => {
    const values = new Map()
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    }
}

const cryptoProvider = () => ({
    getRandomValues: vi.fn((bytes) => {
        bytes.forEach((_, index) => { bytes[index] = index + 1 })
        return bytes
    }),
})

describe('OAuth state attempts', () => {
    it('creates a 256-bit state with Web Crypto', () => {
        const storage = memoryStorage()
        const provider = cryptoProvider()
        const attempt = createOAuthAttempt({ clientID: 'provider', storage, cryptoProvider: provider, now: 1000 })

        expect(attempt.state).toMatch(/^[0-9a-f]{64}$/)
        expect(provider.getRandomValues).toHaveBeenCalledOnce()
    })

    it('binds the provider to the state and consumes it once', () => {
        const storage = memoryStorage()
        const attempt = createOAuthAttempt({ clientID: 'provider', storage, cryptoProvider: cryptoProvider(), now: 1000 })

        expect(consumeOAuthAttempt(attempt.state, { storage, now: 2000 })).toEqual({ clientID: 'provider' })
        expect(() => consumeOAuthAttempt(attempt.state, { storage, now: 2000 })).toThrow('missing_attempt')
    })

    it('rejects and consumes a mismatched state', () => {
        const storage = memoryStorage()
        const attempt = createOAuthAttempt({ clientID: 'provider', storage, cryptoProvider: cryptoProvider(), now: 1000 })

        expect(() => consumeOAuthAttempt(`${attempt.state}00`, { storage, now: 2000 })).toThrow('state_mismatch')
        expect(() => consumeOAuthAttempt(attempt.state, { storage, now: 2000 })).toThrow('missing_attempt')
    })

    it('rejects expired attempts', () => {
        const storage = memoryStorage()
        const attempt = createOAuthAttempt({ clientID: 'provider', storage, cryptoProvider: cryptoProvider(), now: 1000 })

        expect(() => consumeOAuthAttempt(attempt.state, {
            storage,
            now: 1000 + OAUTH_ATTEMPT_TTL_MS + 1,
        })).toThrow('expired_attempt')
    })

    it('does not accept an attempt from another browser session', () => {
        const firstSession = memoryStorage()
        const secondSession = memoryStorage()
        const attempt = createOAuthAttempt({
            clientID: 'provider',
            storage: firstSession,
            cryptoProvider: cryptoProvider(),
            now: 1000,
        })

        expect(() => consumeOAuthAttempt(attempt.state, { storage: secondSession, now: 2000 }))
            .toThrow('missing_attempt')
    })
})
