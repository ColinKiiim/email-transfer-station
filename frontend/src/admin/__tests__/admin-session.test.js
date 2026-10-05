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
            restoreSession: vi.fn().mockRejectedValue({ status: 401 }),
            logout: vi.fn().mockResolvedValue({ success: true }),
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
    it('restores a new tab before showing the login form', async () => {
        const { dependencies, session } = createSession()
        dependencies.client.restoreSession.mockResolvedValue({ token: 'restored-session' })
        expect(session.needsAdminLogin.value).toBe(false)
        expect(session.restoringAdminSession.value).toBe(true)
        await session.initializeAdminSession()
        expect(dependencies.adminAuth.value).toBe('restored-session')
        expect(session.restoringAdminSession.value).toBe(false)
        expect(dependencies.notify).not.toHaveBeenCalled()
    })

    it('shows login after definitive persistent-session expiry without reporting it as an error', async () => {
        const { dependencies, session } = createSession()
        await session.initializeAdminSession()
        expect(session.needsAdminLogin.value).toBe(true)
        expect(dependencies.adminAuth.value).toBe('')
        expect(dependencies.notify).not.toHaveBeenCalled()
    })
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
        expect(dependencies.notify).toHaveBeenCalledWith('管理员会话已建立', 'success')
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
        expect(session.tmpAdminAuth.value).toBe('')
        expect(refreshTurnstile).toHaveBeenCalledTimes(1)
        expect(dependencies.notify).toHaveBeenCalledWith(error.message, 'error')
    })

    it('rejects a legacy login response that does not contain a session token', async () => {
        const client = {
            getLoginSettings: vi.fn(),
            login: vi.fn().mockResolvedValue({ success: true }),
        }
        const { dependencies, session } = createSession({ client })
        session.tmpAdminAuth.value = 'secret'

        await session.authFunc()

        expect(dependencies.adminAuth.value).toBe('')
        expect(session.tmpAdminAuth.value).toBe('')
        expect(dependencies.refreshAdminData).not.toHaveBeenCalled()
        expect(dependencies.notify).toHaveBeenCalledWith('管理员登录未返回有效会话', 'error')
    })

    it('clears data on logout or a renewed challenge and refreshes on authorization', async () => {
        const { dependencies, session } = createSession()
        await session.initializeAdminSession()
        dependencies.adminAuth.value = 'fixture-session'

        await session.resetAdminLogin()
        expect(dependencies.adminAuth.value).toBe('')
        expect(dependencies.client.logout).toHaveBeenCalledTimes(1)

        dependencies.showAdminAuth.value = true
        await nextTick()
        expect(dependencies.clearAdminData).toHaveBeenCalledTimes(2)

        dependencies.showAdminPage.value = true
        await nextTick()
        expect(dependencies.refreshAdminData).toHaveBeenCalledTimes(1)
    })
})
