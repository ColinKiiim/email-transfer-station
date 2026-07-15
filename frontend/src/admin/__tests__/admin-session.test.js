import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAdminSession } from '../admin-session'

const scopes = []

const createSession = (overrides = {}) => {
    const dependencies = {
        client: {
            getLoginSettings: vi.fn().mockResolvedValue({
                accountHint: 'fixture-admin',
                enableGlobalTurnstileCheck: true,
                cfTurnstileSiteKey: 'fixture-site-key',
            }),
            login: vi.fn().mockResolvedValue({ token: 'fixture-session' }),
        },
        adminAuth: ref(''),
        showAdminAuth: ref(false),
        showAdminPage: ref(false),
        openSettings: ref({}),
        hashPassword: vi.fn().mockResolvedValue('fixture-hash'),
        hasAdminData: vi.fn().mockReturnValue(false),
        clearAdminData: vi.fn(),
        refreshAdminData: vi.fn().mockResolvedValue(undefined),
        notify: vi.fn(),
        ...overrides,
    }
    const scope = effectScope()
    scopes.push(scope)
    const session = scope.run(() => useAdminSession(dependencies))
    return { dependencies, session }
}

afterEach(() => {
    scopes.splice(0).forEach((scope) => scope.stop())
})

describe('admin session state', () => {
    it('loads login settings once and keeps the account hint as a fallback', async () => {
        const { dependencies, session } = createSession()
        session.tmpAdminAccount.value = ''

        await session.fetchAdminLoginSettings()
        await session.fetchAdminLoginSettings()

        expect(dependencies.client.getLoginSettings).toHaveBeenCalledTimes(1)
        expect(dependencies.openSettings.value).toMatchObject({
            enableGlobalTurnstileCheck: true,
            cfTurnstileSiteKey: 'fixture-site-key',
        })
        expect(session.tmpAdminAccount.value).toBe('fixture-admin')
    })

    it('establishes a session with normalized credentials and refreshes data', async () => {
        const { dependencies, session } = createSession()
        session.tmpAdminAccount.value = ' admin '
        session.tmpAdminAuth.value = 'secret'
        session.cfToken.value = 'fixture-turnstile'

        await session.authFunc()

        expect(dependencies.client.login).toHaveBeenCalledWith({
            username: 'admin',
            passwordHash: 'fixture-hash',
            cfToken: 'fixture-turnstile',
        })
        expect(dependencies.adminAuth.value).toBe('fixture-session')
        expect(session.tmpAdminAuth.value).toBe('')
        expect(dependencies.refreshAdminData).toHaveBeenCalledTimes(1)
        expect(dependencies.notify).toHaveBeenCalledWith('管理员会话已建立')
    })

    it('keeps the login challenge active and refreshes Turnstile after failure', async () => {
        const refreshTurnstile = vi.fn()
        const error = new Error('fixture login failure')
        const client = {
            getLoginSettings: vi.fn(),
            login: vi.fn().mockRejectedValue(error),
        }
        const { dependencies, session } = createSession({ client })
        session.tmpAdminAuth.value = 'wrong'
        session.turnstileRef.value = { refresh: refreshTurnstile }

        await session.authFunc()

        expect(dependencies.adminAuth.value).toBe('')
        expect(session.tmpAdminAuth.value).toBe('wrong')
        expect(refreshTurnstile).toHaveBeenCalledTimes(1)
        expect(dependencies.notify).toHaveBeenCalledWith(error.message)
    })

    it('clears data on logout or a renewed challenge and refreshes on authorization', async () => {
        const { dependencies, session } = createSession()
        dependencies.adminAuth.value = 'fixture-session'

        session.resetAdminLogin()
        expect(dependencies.adminAuth.value).toBe('')
        expect(dependencies.clearAdminData).toHaveBeenCalledTimes(1)

        dependencies.showAdminAuth.value = true
        await nextTick()
        expect(dependencies.clearAdminData).toHaveBeenCalledTimes(2)

        dependencies.showAdminPage.value = true
        await nextTick()
        expect(dependencies.refreshAdminData).toHaveBeenCalledTimes(1)
    })
})
