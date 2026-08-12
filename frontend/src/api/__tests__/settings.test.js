/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('axios', () => ({
    default: { create: () => ({ request: mocks.request }) },
}))
vi.mock('../../utils/fingerprint', () => ({ getFingerprint: vi.fn(async () => 'fixture') }))

import { api } from '../index'
import { useGlobalState } from '../../store'

const state = useGlobalState()

beforeEach(() => {
    mocks.request.mockReset()
    state.jwt.value = ''
    state.settings.value = { fetched: false, address: '', auto_reply: {}, send_balance: 0 }
    state.openSettings.value.fetched = true
    state.openSettings.value.needAuth = false
})

describe('address settings credential recovery', () => {
    it('clears a definitively stale address JWT after a 401', async () => {
        state.jwt.value = 'stale-address-jwt'
        mocks.request.mockResolvedValue({ status: 401, data: 'Invalid address credential' })

        await expect(api.getSettings()).resolves.toBe('')

        expect(state.jwt.value).toBe('')
        expect(state.settings.value.fetched).toBe(true)
    })

    it('preserves the address JWT while the site password is still required', async () => {
        state.jwt.value = 'address-jwt'
        state.openSettings.value.needAuth = true
        mocks.request.mockResolvedValue({ status: 401, data: 'Site password required' })

        await expect(api.getSettings()).rejects.toMatchObject({ status: 401 })

        expect(state.jwt.value).toBe('address-jwt')
    })

    it('does not request protected settings without an address JWT', async () => {
        await expect(api.getSettings()).resolves.toBe('')
        expect(mocks.request).not.toHaveBeenCalled()
    })
})

describe('global request loading state', () => {
    it('stays busy until all concurrent requests settle', async () => {
        let resolveFirst
        let resolveSecond
        mocks.request
            .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
            .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

        const first = api.fetch('/open_api/first')
        const second = api.fetch('/open_api/second')
        expect(state.loading.value).toBe(true)
        await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))

        resolveFirst({ status: 200, data: { ok: 1 } })
        await first
        expect(state.loading.value).toBe(true)

        resolveSecond({ status: 200, data: { ok: 2 } })
        await second
        expect(state.loading.value).toBe(false)
    })
})
