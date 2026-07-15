import { describe, expect, it, vi } from 'vitest'

import { createAdminRequestId } from '../admin-request'

describe('admin request identifiers', () => {
    it('uses the platform random UUID implementation when available', () => {
        const randomUUID = vi.fn(() => '12345678-1234-4123-8123-123456789abc')

        expect(createAdminRequestId({ randomUUID })).toBe('12345678-1234-4123-8123-123456789abc')
        expect(randomUUID).toHaveBeenCalledOnce()
    })

    it('builds an RFC 4122 version 4 identifier from CSPRNG bytes', () => {
        const getRandomValues = vi.fn((bytes) => {
            bytes.set(Array.from({ length: 16 }, (_, index) => index))
            return bytes
        })

        const value = createAdminRequestId({ getRandomValues })

        expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        expect(getRandomValues).toHaveBeenCalledOnce()
    })

    it('fails closed when secure randomness is unavailable', () => {
        expect(() => createAdminRequestId({})).toThrow('secure_random_unavailable')
    })
})
