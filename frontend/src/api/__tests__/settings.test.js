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
    state.adminAuth.value = ''
    state.showAdminAuth.value = false
    state.showAuth.value = false
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

describe('administrator session recovery', () => {
    it('renews once for concurrent expired requests and preserves a write request id when retrying', async () => {
        state.adminAuth.value = 'expired'
        let resolveRefresh
        mocks.request.mockImplementation((path, options) => {
            if (path === '/open_api/admin_session') return new Promise(resolve => { resolveRefresh = resolve })
            return Promise.resolve(options.headers['x-admin-auth'] === 'renewed'
                ? { status: 200, data: { ok: true } } : { status: 401, data: 'Expired' })
        })
        const pending = Promise.all([
            api.fetch('/api/admin/overview'),
            api.fetch('/api/admin/mails/7', { method: 'DELETE', body: '{"confirm":true}', headers: { 'x-admin-request-id': 'fixture-request-id' } }),
        ])
        await vi.waitFor(() => expect(mocks.request.mock.calls.filter(([path]) => path === '/open_api/admin_session')).toHaveLength(1))
        resolveRefresh({ status: 200, data: { token: 'renewed' } })
        await expect(pending).resolves.toEqual([{ ok: true }, { ok: true }])
        expect(state.adminAuth.value).toBe('renewed')
        expect(state.showAdminAuth.value).toBe(false)
        const writes = mocks.request.mock.calls.filter(([path]) => path === '/api/admin/mails/7')
        expect(writes).toHaveLength(2)
        for (const [, options] of writes) {
            expect(options.headers['x-admin-request-id']).toBe('fixture-request-id')
            expect(options.data).toBe('{"confirm":true}')
        }
        expect(mocks.request.mock.calls.find(([path]) => path === '/open_api/admin_session')[1].withCredentials).toBe(true)
    })

    it.each([['revoked', 401, '', true], ['server failure', 500, 'expired', false]])('handles %s without confusing it with a network failure', async (_label, status, token, challenge) => {
        state.adminAuth.value = 'expired'
        mocks.request.mockImplementation(path => Promise.resolve({ status: path === '/open_api/admin_session' ? status : 401, data: 'fixture' }))
        await expect(api.fetch('/api/admin/overview')).rejects.toMatchObject({ status })
        expect(state.adminAuth.value).toBe(token)
        expect(state.showAdminAuth.value).toBe(challenge)
    })

    it('bounds retry to one even if the newly issued token is denied', async () => {
        state.adminAuth.value = 'expired'
        mocks.request.mockImplementation(path => Promise.resolve(path === '/open_api/admin_session'
            ? { status: 200, data: { token: 'renewed' } } : { status: 401, data: 'Denied' }))
        await expect(api.fetch('/api/admin/overview')).rejects.toMatchObject({ status: 401 })
        expect(mocks.request.mock.calls.filter(([path]) => path === '/open_api/admin_session')).toHaveLength(1)
        expect(state.adminAuth.value).toBe('')
    })

    it('keeps administrator credentials when the separate site password is required', async () => {
        state.adminAuth.value = 'valid'
        mocks.request.mockResolvedValue({ status: 401, data: 'Site password required', headers: { 'x-auth-reason': 'site_password_required' } })
        await expect(api.fetch('/api/admin/overview')).rejects.toMatchObject({ status: 401 })
        expect(state.adminAuth.value).toBe('valid')
        expect(state.showAdminAuth.value).toBe(false)
        expect(state.showAuth.value).toBe(true)
        expect(mocks.request).toHaveBeenCalledTimes(1)
    })

    it('prevents an in-flight renewal from signing the browser back in after logout', async () => {
        let resolveRefresh
        mocks.request.mockImplementation(path => path === '/open_api/admin_session'
            ? new Promise(resolve => { resolveRefresh = resolve })
            : Promise.resolve({ status: 200, data: { success: true } }))
        const renewing = api.refreshAdminSession()
        const rejected = expect(renewing).rejects.toThrow('Admin session changed')
        await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'))
        await api.logoutAdminSession()
        resolveRefresh({ status: 200, data: { token: 'late-token' } })
        await rejected
        expect(state.adminAuth.value).toBe('')
        expect(state.showAdminAuth.value).toBe(true)
    })
})
