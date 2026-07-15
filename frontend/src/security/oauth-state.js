const OAUTH_ATTEMPT_KEY = 'ets-oauth-attempt'
export const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000

export class OAuthStateError extends Error {
    constructor(code) {
        super(code)
        this.name = 'OAuthStateError'
        this.code = code
    }
}

const defaultStorage = () => globalThis.sessionStorage
const defaultCrypto = () => globalThis.crypto

export const createOAuthAttempt = ({
    clientID,
    storage = defaultStorage(),
    cryptoProvider = defaultCrypto(),
    now = Date.now(),
} = {}) => {
    if (typeof clientID !== 'string' || !clientID.trim()) throw new OAuthStateError('invalid_client')
    if (!cryptoProvider?.getRandomValues) throw new OAuthStateError('crypto_unavailable')

    const bytes = new Uint8Array(32)
    cryptoProvider.getRandomValues(bytes)
    const state = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    storage.setItem(OAUTH_ATTEMPT_KEY, JSON.stringify({ version: 1, state, clientID, createdAt: now }))
    return { state, clientID }
}

export const consumeOAuthAttempt = (returnedState, {
    storage = defaultStorage(),
    now = Date.now(),
} = {}) => {
    const raw = storage.getItem(OAUTH_ATTEMPT_KEY)
    storage.removeItem(OAUTH_ATTEMPT_KEY)
    if (!raw) throw new OAuthStateError('missing_attempt')

    let attempt
    try {
        attempt = JSON.parse(raw)
    } catch {
        throw new OAuthStateError('invalid_attempt')
    }
    if (attempt?.version !== 1
        || typeof attempt.state !== 'string'
        || typeof attempt.clientID !== 'string'
        || !Number.isFinite(attempt.createdAt)) {
        throw new OAuthStateError('invalid_attempt')
    }
    if (now < attempt.createdAt || now - attempt.createdAt > OAUTH_ATTEMPT_TTL_MS) {
        throw new OAuthStateError('expired_attempt')
    }
    if (typeof returnedState !== 'string' || returnedState !== attempt.state) {
        throw new OAuthStateError('state_mismatch')
    }
    return { clientID: attempt.clientID }
}
