/** @vitest-environment jsdom */

import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
    getOpenSettings: vi.fn(),
    getUserSettings: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        fetch: mocks.fetch,
        getOpenSettings: mocks.getOpenSettings,
        getUserSettings: mocks.getUserSettings,
    },
}))

vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))

vi.mock('naive-ui', async (importOriginal) => ({
    ...(await importOriginal()),
    useMessage: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
}))

vi.mock('../../utils', async (importOriginal) => ({
    ...(await importOriginal()),
    hashPassword: vi.fn(async () => 'hashed-password'),
}))

vi.mock('../../utils/email-parser', () => ({
    getDownloadEmlUrl: () => '#',
    processItem: vi.fn(async (mail) => ({
        ...mail,
        message: mail.html || mail.text || '',
        messageIsHtml: !!mail.html,
        parseFailed: false,
    })),
}))

import AdminNext from '../AdminNext.vue'
import { useGlobalState } from '../../store'

const state = useGlobalState()

const mail = () => ({
    id: 7,
    address: 'ops@example.test',
    source: 'sender@example.test',
    sender: 'Sender <sender@example.test>',
    subject: 'Invoice ready',
    text: 'Fixture mail body',
    html: '<p>Fixture mail body</p>',
    raw: 'From: sender@example.test\r\nSubject: Invoice ready\r\n\r\nFixture mail body',
    is_read: true,
    created_at: '2026-07-15 10:00:00',
    attachments: [],
})

let runtime

const fixtureResponse = async (path, options = {}) => {
    if (path === '/open_api/admin_login_settings') {
        return { accountHint: '', enableGlobalTurnstileCheck: false, cfTurnstileSiteKey: '' }
    }
    if (path === '/open_api/admin_login') {
        if (runtime.loginError) throw runtime.loginError
        return { token: 'fixture-admin-session' }
    }
    if (runtime.failPath && runtime.failPath(path)) throw new Error(runtime.failMessage || 'fixture api failure')
    if (path === '/api/admin/overview') {
        if (runtime.overviewPromise) return runtime.overviewPromise
        return { totals: {}, domains: [] }
    }
    if (path === '/api/admin/statistics') return {}
    if (path === '/api/admin/domains') return { results: [] }
    if (path === '/api/admin/mail_domains') return { results: [] }
    if (path === '/api/admin/mail_addresses') return { results: [] }
    if (path.startsWith('/api/admin/mails?')) {
        return { results: runtime.mails, count: runtime.mails.length, unread_count: 0 }
    }
    if (path === '/api/admin/mails_unknow?limit=100&offset=0') return { results: [] }
    if (path === '/api/admin/address?limit=50&offset=0') return { results: [] }
    if (path === '/api/admin/access_packages?limit=50&offset=0') return { results: [] }
    if (path === '/api/admin/audit_events?limit=20&offset=0') return { results: [] }
    if (path === '/api/admin/access_events?limit=20&offset=0') return { results: [] }
    if (path === '/api/admin/users?limit=20&offset=0') return { results: [] }
    if (path === '/api/admin/worker/configs') return { DIAGNOSTICS: { bindings: {}, database: {} } }
    if (path === '/api/admin/db_version') return { code_db_version: 'fixture', need_migration: false }
    if (path === '/api/admin/mail_webhook/settings') return { enabled: false }
    if (path === '/api/admin/webhook/settings') return { enabled: false }
    if (path === '/api/admin/telegram/status') return { enabled: false }
    if (path === '/api/admin/ai_extract/settings') return { enabled: false }
    if (path === '/api/admin/address_sender?limit=20&offset=0') return { results: [] }
    if (path === '/api/admin/sendbox?limit=10&offset=0') return { results: [] }
    if (path === '/api/admin/mails/7' && options.method === 'DELETE') {
        if (runtime.deleteError) throw runtime.deleteError
        runtime.mails = []
        return { success: true }
    }
    return { results: [] }
}

const settle = async () => {
    await flushPromises()
    await nextTick()
    await flushPromises()
}

const mountAdmin = async ({
    authenticated = true,
    path = '/admin',
    waitForData = true,
} = {}) => {
    state.adminAuth.value = authenticated ? 'fixture-admin-session' : ''
    state.showAdminAuth.value = false
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/admin', component: AdminNext },
            { path: '/:pathMatch(.*)*', component: { template: '<div>fallback</div>' } },
        ],
    })
    await router.push(path)
    await router.isReady()
    const wrapper = mount(AdminNext, {
        attachTo: document.body,
        global: {
            plugins: [router],
            stubs: {
                Turnstile: true,
                MailContentRenderer: true,
                ShadowHtmlComponent: true,
            },
        },
    })
    if (waitForData) await settle()
    return { router, wrapper }
}

beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    sessionStorage.clear()
    runtime = {
        mails: [mail()],
        loginError: null,
        failPath: null,
        failMessage: '',
        overviewPromise: null,
        deleteError: null,
    }
    mocks.fetch.mockReset()
    mocks.fetch.mockImplementation(fixtureResponse)
    mocks.getOpenSettings.mockReset().mockResolvedValue(undefined)
    mocks.getUserSettings.mockReset().mockResolvedValue(undefined)
    state.adminAuth.value = ''
    state.showAdminAuth.value = false
    state.loading.value = false
    state.openSettings.value.fetched = true
    state.openSettings.value.disableAdminPasswordCheck = false
    state.openSettings.value.enableGlobalTurnstileCheck = false
    state.userSettings.value.fetched = true
    state.userSettings.value.is_admin = false
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('AdminNext behavior baseline', () => {
    it('establishes an admin session after a successful login', async () => {
        const { wrapper } = await mountAdmin({ authenticated: false })

        await wrapper.get('input[autocomplete="username"]').setValue('admin')
        await wrapper.get('input[autocomplete="current-password"]').setValue('secret')
        await wrapper.get('form').trigger('submit')
        await settle()

        expect(mocks.fetch).toHaveBeenCalledWith('/open_api/admin_login', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ username: 'admin', password: 'hashed-password', cf_token: '' }),
        }))
        expect(state.adminAuth.value).toBe('fixture-admin-session')
        expect(wrapper.find('.admin-next.app').exists()).toBe(true)
        expect(wrapper.get('.toast').text()).toContain('管理员会话已建立')
        wrapper.unmount()
    })

    it.each([
        ['401', new Error('管理员凭据无效')],
        ['network failure', new Error('网络不可用')],
    ])('keeps the login form and reports %s', async (_label, error) => {
        runtime.loginError = error
        const { wrapper } = await mountAdmin({ authenticated: false })

        await wrapper.get('input[autocomplete="current-password"]').setValue('wrong')
        await wrapper.get('form').trigger('submit')
        await settle()

        expect(state.adminAuth.value).toBe('')
        expect(wrapper.find('#admin-auth-title').exists()).toBe(true)
        expect(wrapper.get('.toast').text()).toContain(error.message)
        wrapper.unmount()
    })

    it('keeps route query, selected view, mail, and detail mode in sync both ways', async () => {
        const { router, wrapper } = await mountAdmin({ path: '/admin?view=overview' })

        await wrapper.get('button[aria-label="收件流"]').trigger('click')
        await settle()
        expect(router.currentRoute.value.query.view).toBe('flow')

        await wrapper.get('.mail-row').trigger('click')
        await settle()
        expect(router.currentRoute.value.query).toMatchObject({
            view: 'flow',
            mailId: 'mail-7',
            mode: 'detail',
        })
        expect(wrapper.get('.mail-row').attributes('aria-selected')).toBe('true')
        expect(wrapper.get('.mail-workbench').classes()).toContain('flow-mode-detail')

        await router.replace('/admin?view=flow&q=invoice&mailId=mail-7&mode=detail')
        await settle()
        expect(wrapper.get('.searchbox input').element.value).toBe('invoice')
        expect(wrapper.get('.mail-row').attributes('aria-selected')).toBe('true')

        await wrapper.get('button[aria-label="运行总控"]').trigger('click')
        await settle()
        expect(router.currentRoute.value.query.view).toBe('overview')
        expect(router.currentRoute.value.query).not.toHaveProperty('mailId')
        expect(router.currentRoute.value.query).not.toHaveProperty('mode')
        wrapper.unmount()
    })

    it('shows loading, a real empty state, API failure, and unauthorized state without fake data', async () => {
        let resolveOverview
        runtime.mails = []
        runtime.overviewPromise = new Promise((resolve) => { resolveOverview = resolve })
        const pending = await mountAdmin({ path: '/admin?view=flow', waitForData: false })
        await nextTick()
        expect(pending.wrapper.get('.sync-state').text()).toBe('同步中')
        resolveOverview({ totals: {}, domains: [] })
        await settle()
        expect(pending.wrapper.text()).toContain('没有匹配结果')
        expect(pending.wrapper.find('.mail-row').exists()).toBe(false)
        pending.wrapper.unmount()

        runtime.mails = []
        runtime.overviewPromise = null
        runtime.failPath = (path) => path.startsWith('/api/admin/mails?')
        runtime.failMessage = '邮件接口不可用'
        const failed = await mountAdmin({ path: '/admin?view=flow' })
        expect(failed.wrapper.text()).toContain('后台数据加载失败')
        expect(failed.wrapper.text()).toContain('邮件接口不可用')
        expect(failed.wrapper.get('.sync-state').text()).toBe('同步部分失败')
        expect(failed.wrapper.get('.sync-state').text()).not.toContain('已同步')

        state.showAdminAuth.value = true
        await nextTick()
        expect(failed.wrapper.find('#admin-auth-title').exists()).toBe(true)
        expect(failed.wrapper.find('.admin-next.app').exists()).toBe(false)
        failed.wrapper.unmount()
    })

    it('cancels a destructive mail write before the API call', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
        const { wrapper } = await mountAdmin({ path: '/admin?view=flow&mailId=mail-7&mode=detail' })

        await wrapper.get('.mail-reader-actions .danger').trigger('click')
        await settle()

        expect(confirm).toHaveBeenCalledOnce()
        expect(mocks.fetch).not.toHaveBeenCalledWith('/api/admin/mails/7', expect.objectContaining({ method: 'DELETE' }))
        expect(wrapper.find('.mail-row').exists()).toBe(true)
        wrapper.unmount()
    })

    it('reports a failed confirmed mail write and preserves the row', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        runtime.deleteError = new Error('删除接口失败')
        const { wrapper } = await mountAdmin({ path: '/admin?view=flow&mailId=mail-7&mode=detail' })

        await wrapper.get('.mail-reader-actions .danger').trigger('click')
        await settle()

        expect(wrapper.get('.toast').text()).toContain('删除接口失败')
        expect(wrapper.find('.mail-row').exists()).toBe(true)
        wrapper.unmount()
    })

    it('reports a successful confirmed mail write and refreshes the row away', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const { wrapper } = await mountAdmin({ path: '/admin?view=flow&mailId=mail-7&mode=detail' })

        await wrapper.get('.mail-reader-actions .danger').trigger('click')
        await settle()

        expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/mails/7', { method: 'DELETE' })
        expect(wrapper.get('.toast').text()).toContain('已删除 1 封生产邮件')
        expect(wrapper.find('.mail-row').exists()).toBe(false)
        expect(wrapper.text()).toContain('没有匹配结果')
        wrapper.unmount()
    })
})
