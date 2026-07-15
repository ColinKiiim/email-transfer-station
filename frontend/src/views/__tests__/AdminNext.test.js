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
    if (path === '/api/admin/domains') return { results: runtime.domains }
    if (path === '/api/admin/mail_domains') return { results: [] }
    if (path === '/api/admin/mail_addresses') return { results: [] }
    if (path.startsWith('/api/admin/mails?')) {
        return { results: runtime.mails, count: runtime.mails.length, unread_count: 0 }
    }
    if (path === '/api/admin/mails_unknow?limit=100&offset=0') return { results: [] }
    if (path === '/api/admin/address?limit=50&offset=0') return { results: runtime.addresses }
    if (path === '/api/admin/access_packages?limit=50&offset=0') return { results: runtime.accessPackages }
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
    if (path === '/api/admin/new_address' && options.method === 'POST') {
        runtime.lastAddressCreate = JSON.parse(options.body)
        const address = `${runtime.lastAddressCreate.name}@${runtime.lastAddressCreate.domain}`
        runtime.addresses.push({ id: 9, name: address, credential_version: 1 })
        return { address_id: 9, address, jwt: 'fixture-address-jwt', password: 'fixture-address-password' }
    }
    if (path === '/api/admin/address/3/share_tokens' && options.method === 'POST') {
        runtime.lastShareCreate = JSON.parse(options.body)
        runtime.accessPackages.push({ id: 11, address_id: 3, address: 'ops@example.test', scopes: 'read' })
        return { id: 11, address: 'ops@example.test', token: 'fixture-share-token' }
    }
    if (path === '/api/admin/address/3/credential' && options.method === 'POST') {
        return { jwt: 'fixture-current-jwt' }
    }
    if (path === '/api/admin/delete_address/3' && options.method === 'DELETE') {
        runtime.addresses = runtime.addresses.filter((row) => row.id !== 3)
        return { success: true }
    }
    if (path === '/api/admin/domains/1/impact') {
        return { success: true, address_count: 2, mail_count: 4 }
    }
    if (path === '/api/admin/domains/1' && options.method === 'DELETE') {
        runtime.lastDomainDisable = JSON.parse(options.body)
        runtime.domains = runtime.domains.map((row) => row.id === 1
            ? { ...row, enabled: false, setup_status: 'disabled', config_version: row.config_version + 1 }
            : row)
        return { success: true, address_count: 2, mail_count: 4, config_version: 8 }
    }
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
        addresses: [],
        accessPackages: [],
        domains: [],
        loginError: null,
        failPath: null,
        failMessage: '',
        overviewPromise: null,
        deleteError: null,
        lastAddressCreate: null,
        lastShareCreate: null,
        lastDomainDisable: null,
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
        expect(wrapper.get('.toast').attributes('role')).toBe('status')
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
        expect(wrapper.get('.toast').attributes('role')).toBe('alert')
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

    it('restores canonical view state after back, forward, and refresh', async () => {
        const selectedPath = '/admin?view=flow&q=invoice&mailId=mail-7&mode=detail'
        const mounted = await mountAdmin({ path: '/admin?view=overview' })

        await mounted.router.push(selectedPath)
        await settle()
        expect(mounted.wrapper.get('.searchbox input').element.value).toBe('invoice')
        expect(mounted.wrapper.get('.mail-row').attributes('aria-selected')).toBe('true')
        expect(mounted.wrapper.get('.mail-workbench').classes()).toContain('flow-mode-detail')

        await mounted.router.push('/admin?view=overview')
        await settle()
        expect(mounted.wrapper.get('h1').text()).toBe('运行总控')

        mounted.router.back()
        await settle()
        expect(mounted.router.currentRoute.value.fullPath).toBe(selectedPath)
        expect(mounted.wrapper.get('.mail-row').attributes('aria-selected')).toBe('true')

        mounted.router.forward()
        await settle()
        expect(mounted.router.currentRoute.value.query.view).toBe('overview')
        expect(mounted.wrapper.get('h1').text()).toBe('运行总控')
        mounted.wrapper.unmount()

        const refreshed = await mountAdmin({ path: selectedPath })
        expect(refreshed.wrapper.get('.searchbox input').element.value).toBe('invoice')
        expect(refreshed.wrapper.get('.mail-row').attributes('aria-selected')).toBe('true')
        expect(refreshed.wrapper.get('.mail-workbench').classes()).toContain('flow-mode-detail')
        refreshed.wrapper.unmount()
    })

    it('shows loading, a real empty state, API failure, and unauthorized state without fake data', async () => {
        let resolveOverview
        runtime.mails = []
        runtime.overviewPromise = new Promise((resolve) => { resolveOverview = resolve })
        const pending = await mountAdmin({ path: '/admin?view=flow', waitForData: false })
        await nextTick()
        expect(pending.wrapper.get('.sync-state').text()).toBe('同步中')
        expect(pending.wrapper.text()).toContain('后台数据同步中')
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
        expect(failed.wrapper.get('.notice[role="alert"]').text()).toContain('邮件接口不可用')
        expect(failed.wrapper.get('.notice[role="alert"] button').text()).toBe('重新同步')

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
        expect(wrapper.get('.toast').attributes('role')).toBe('alert')
        expect(wrapper.find('.mail-row').exists()).toBe(true)
        wrapper.unmount()
    })

    it('reports a successful confirmed mail write and refreshes the row away', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const { wrapper } = await mountAdmin({ path: '/admin?view=flow&mailId=mail-7&mode=detail' })

        await wrapper.get('.mail-reader-actions .danger').trigger('click')
        await settle()

        expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/mails/7', expect.objectContaining({
            method: 'DELETE',
            body: JSON.stringify({ confirm: true }),
            headers: expect.objectContaining({ 'x-admin-request-id': expect.any(String) }),
        }))
        expect(wrapper.get('.toast').text()).toContain('已删除 1 封生产邮件')
        expect(wrapper.get('.toast').attributes('role')).toBe('status')
        expect(wrapper.find('.mail-row').exists()).toBe(false)
        expect(wrapper.text()).toContain('没有匹配结果')
        expect(wrapper.get('.empty-state').attributes('role')).toBe('status')
        wrapper.unmount()
    })

    it('creates a production address and exposes its credentials exactly once', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        runtime.domains = [{
            id: 1,
            domain: 'example.test',
            enabled: true,
            receive_mode: 'cloudflare_email',
            setup_status: 'active',
            allow_address_creation: true,
            allow_random_subdomain: true,
            config_version: 7,
        }]
        const { wrapper } = await mountAdmin({ path: '/admin?view=identity' })

        const createButton = wrapper.findAll('.toolbar button').find((button) => button.text().includes('新增地址'))
        expect(createButton).toBeTruthy()
        await createButton.trigger('click')
        await wrapper.get('[data-testid="address-name"]').setValue('team')
        await wrapper.get('[data-testid="address-random-subdomain"]').setValue(true)
        await wrapper.get('[data-testid="action-submit"]').trigger('click')
        await settle()

        expect(runtime.lastAddressCreate).toEqual({
            name: 'team',
            domain: 'example.test',
            enablePrefix: false,
            enableRandomSubdomain: true,
        })
        const oneTimeResult = wrapper.get('[data-testid="one-time-result"]').element.value
        expect(oneTimeResult).toContain('team@example.test')
        expect(oneTimeResult).toContain('fixture-address-jwt')
        expect(oneTimeResult).toContain('fixture-address-password')
        expect(oneTimeResult).toContain('/?jwt=fixture-address-jwt')
        expect(wrapper.text()).toContain('仅显示本次')
        wrapper.unmount()
    })

    it('keeps modal focus contained and restores the trigger after Escape', async () => {
        runtime.domains = [{
            id: 1,
            domain: 'example.test',
            enabled: true,
            receive_mode: 'cloudflare_email',
            setup_status: 'active',
            allow_address_creation: true,
            config_version: 7,
        }]
        const { wrapper } = await mountAdmin({ path: '/admin?view=identity' })
        const createButton = wrapper.findAll('.toolbar button').find((button) => button.text().includes('新增地址'))
        createButton.element.focus()

        await createButton.trigger('click')
        await settle()

        const modal = wrapper.get('[aria-labelledby="action-modal-title"]')
        const addressInput = wrapper.get('[data-testid="address-name"]')
        expect(document.activeElement).toBe(addressInput.element)

        const submit = wrapper.get('[data-testid="action-submit"]')
        submit.element.focus()
        await modal.trigger('keydown', { key: 'Tab' })
        expect(document.activeElement).toBe(modal.get('button[aria-label="关闭"]').element)

        await modal.trigger('keydown', { key: 'Escape' })
        await settle()
        expect(wrapper.find('[aria-labelledby="action-modal-title"]').exists()).toBe(false)
        expect(document.activeElement).toBe(createButton.element)
        wrapper.unmount()
    })

    it('reveals the selected address credential behind an explicit confirmation', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        runtime.addresses = [{ id: 3, name: 'ops@example.test', credential_version: 2 }]
        const { wrapper } = await mountAdmin({ path: '/admin?view=identity' })

        const revealButton = wrapper.findAll('.toolbar button')
            .find((button) => button.text().includes('显示凭证'))
        expect(revealButton).toBeTruthy()
        await revealButton.trigger('click')
        await settle()

        expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/address/3/credential', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ confirm: true, expected_credential_version: 2 }),
            headers: expect.objectContaining({ 'x-admin-request-id': expect.any(String) }),
        }))
        const oneTimeResult = wrapper.get('[data-testid="one-time-result"]').element.value
        expect(oneTimeResult).toContain('fixture-current-jwt')
        expect(oneTimeResult).toContain('/?jwt=fixture-current-jwt')
        wrapper.unmount()
    })

    it('creates a read-only access package for the selected address', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        runtime.addresses = [{ id: 3, name: 'ops@example.test', credential_version: 1 }]
        const { wrapper } = await mountAdmin({ path: '/admin?view=identity' })

        const shareButton = wrapper.findAll('.cell-actions button').find((button) => button.text() === '分享')
        expect(shareButton).toBeTruthy()
        await shareButton.trigger('click')
        await wrapper.get('[data-testid="share-label"]').setValue('外部审阅')
        await wrapper.get('[data-testid="share-expiry"]').setValue('2026-07-16T18:30')
        await wrapper.get('[data-testid="action-submit"]').trigger('click')
        await settle()

        expect(runtime.lastShareCreate).toEqual({
            label: '外部审阅',
            scopes: ['read'],
            expires_at: '2026-07-16 18:30:00',
        })
        expect(wrapper.get('[data-testid="one-time-result"]').element.value).toContain('/i/fixture-share-token')
        wrapper.unmount()
    })

    it('deletes the selected address and disables a domain with impact confirmation', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        runtime.addresses = [{
            id: 3,
            name: 'ops@example.test',
            credential_version: 1,
            mail_count: 2,
            send_count: 1,
            active_share_token_count: 1,
        }]
        let mounted = await mountAdmin({ path: '/admin?view=identity' })

        const deleteAddressButton = mounted.wrapper.findAll('.toolbar button')
            .find((button) => button.text().includes('删除地址'))
        expect(deleteAddressButton).toBeTruthy()
        await deleteAddressButton.trigger('click')
        await settle()
        expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/delete_address/3', expect.objectContaining({
            method: 'DELETE',
            body: JSON.stringify({
                confirm: true,
                expected_credential_version: 1,
                expected_mail_count: 2,
                expected_sent_count: 1,
                expected_share_count: 1,
            }),
            headers: expect.objectContaining({ 'x-admin-request-id': expect.any(String) }),
        }))
        mounted.wrapper.unmount()

        runtime.domains = [{
            id: 1,
            domain: 'example.test',
            enabled: true,
            receive_mode: 'cloudflare_email',
            setup_status: 'active',
            allow_address_creation: true,
            config_version: 7,
        }]
        mounted = await mountAdmin({ path: '/admin?view=routing' })
        const disableButton = mounted.wrapper.findAll('.domain-actions button')
            .find((button) => button.text() === '停用')
        expect(disableButton).toBeTruthy()
        await disableButton.trigger('click')
        await settle()

        expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/domains/1/impact')
        expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/domains/1', {
            method: 'DELETE',
            body: JSON.stringify({ config_version: 7, confirm: true }),
            headers: expect.objectContaining({ 'x-admin-request-id': expect.any(String) }),
        })
        expect(runtime.lastDomainDisable).toEqual({ config_version: 7, confirm: true })
        expect(confirm).toHaveBeenCalled()
        mounted.wrapper.unmount()
    })
})
