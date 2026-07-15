const toHex = (value) => value.toString(16).padStart(2, '0')

export const createAdminRequestId = (cryptoProvider = globalThis.crypto) => {
    if (typeof cryptoProvider?.randomUUID === 'function') {
        return cryptoProvider.randomUUID()
    }
    if (typeof cryptoProvider?.getRandomValues !== 'function') {
        throw new Error('secure_random_unavailable')
    }
    const bytes = new Uint8Array(16)
    cryptoProvider.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, toHex).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
