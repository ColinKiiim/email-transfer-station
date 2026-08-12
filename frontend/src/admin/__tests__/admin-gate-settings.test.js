/** @vitest-environment jsdom */
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(async () => ({ results: [] })),
    getOpenSettings: vi.fn(),
    getUserSettings: vi.fn(),
}))

vi.mock('../../api', () => ({ api: { fetch: mocks.fetch, getOpenSettings: mocks.getOpenSettings, getUserSettings: mocks.getUserSettings } }))
vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('naive-ui', async (importOriginal) => ({
    ...(await importOriginal()),
    useMessage: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
}))
vi.mock('../../utils/email-parser', () => ({
    getDownloadEmlUrl: () => '#',
    processItem: vi.fn(async (mail) => mail),
}))

import AdminNext from '../../views/AdminNext.vue'
import i18n from '../../i18n'
import { useGlobalState } from '../../store'

i18n.global.locale.value = 'zh'
const state = useGlobalState()

/*
 * `showAdminPage` is true when adminAuth is set, OR userSettings.is_admin, OR
 * openSettings.disableAdminPasswordCheck.
 *
 * The settings fetch used to sit behind `if (!showAdminPage) return`, so the
 * two data-driven paths could never activate: an ADMIN_USER_ROLE user, and an
 * instance running with DISABLE_ADMIN_PASSWORD_CHECK, were both locked out
 * because the data proving they may enter was only loaded once they had
 * already entered.
 */
const mountAdmin = async () => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/admin', component: AdminNext }, { path: '/:p(.*)*', component: { template: '<div/>' } }],
    })
    await router.push('/admin')
    await router.isReady()
    const wrapper = mount(AdminNext, { global: { plugins: [router, i18n], stubs: { Turnstile: true, MailContentRenderer: true, ShadowHtmlComponent: true } } })
    await flushPromises()
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mocks.fetch.mockClear()
    mocks.getOpenSettings.mockReset().mockResolvedValue(undefined)
    mocks.getUserSettings.mockReset().mockResolvedValue(undefined)
    state.adminAuth.value = ''
    state.showAdminAuth.value = false
    state.openSettings.value.fetched = false
    state.openSettings.value.disableAdminPasswordCheck = false
    state.userSettings.value.fetched = false
    state.userSettings.value.is_admin = false
})

afterEach(() => { vi.restoreAllMocks() })

describe('admin gate settings are loaded before the gate is evaluated', () => {
    it('fetches open and user settings even with no admin session', async () => {
        const wrapper = await mountAdmin()
        expect(mocks.getOpenSettings).toHaveBeenCalled()
        expect(mocks.getUserSettings).toHaveBeenCalled()
        wrapper.unmount()
    })

    it('lets an ADMIN_USER_ROLE user in once their settings arrive', async () => {
        mocks.getUserSettings.mockImplementation(async () => {
            state.userSettings.value.fetched = true
            state.userSettings.value.is_admin = true
        })
        const wrapper = await mountAdmin()
        await flushPromises()
        // console shell rendered, not the password form
        expect(wrapper.find('.admin-next.app').exists()).toBe(true)
        expect(wrapper.find('#admin-auth-title').exists()).toBe(false)
        wrapper.unmount()
    })

    it('still shows the login form when nothing grants access', async () => {
        mocks.getOpenSettings.mockImplementation(async () => { state.openSettings.value.fetched = true })
        mocks.getUserSettings.mockImplementation(async () => { state.userSettings.value.fetched = true })
        const wrapper = await mountAdmin()
        expect(wrapper.find('#admin-auth-title').exists()).toBe(true)
        wrapper.unmount()
    })
})
