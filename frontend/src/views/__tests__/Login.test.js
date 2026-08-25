/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getOpenSettings: vi.fn(),
    getUserSettings: vi.fn(),
    fetch: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        getOpenSettings: mocks.getOpenSettings,
        getUserSettings: mocks.getUserSettings,
        fetch: mocks.fetch,
        bindUserAddress: vi.fn(),
    },
}))

vi.mock('@vicons/material', () => ({
    NewLabelOutlined: { render: () => null },
    EmailOutlined: { render: () => null },
}))

vi.mock('naive-ui', () => ({
    useMessage: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
    useNotification: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
    NAlert: { template: '<div class="n-alert-stub"><slot /></div>' },
    NForm: { template: '<form><slot /></form>' },
    NFormItemRow: { template: '<div><slot /></div>' },
    NInput: { template: '<input />' },
    NInputGroup: { template: '<div><slot /></div>' },
    NInputGroupLabel: { template: '<span><slot /></span>' },
    NSelect: { template: '<select><slot /></select>' },
    NButton: { template: '<button><slot name="icon" /><slot /></button>' },
    NIcon: { template: '<span><slot /></span>' },
    NCheckbox: { template: '<input type="checkbox" />' },
    NSpin: { template: '<div><slot /></div>' },
}))

import Login from '../common/Login.vue'
import i18n from '../../i18n'
import { useGlobalState } from '../../store'

const router = createRouter({
    history: createMemoryHistory(),
    routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/user', component: { template: '<div />' } },
    ],
})

const state = useGlobalState()

const stubs = {
    'n-alert': { template: '<div class="n-alert-stub"><slot /></div>' },
    'n-form': { template: '<form><slot /></form>' },
    'n-form-item-row': { template: '<div><slot /></div>' },
    'n-input': { template: '<input />' },
    'n-input-group': { template: '<div><slot /></div>' },
    'n-input-group-label': { template: '<span><slot /></span>' },
    'n-select': { template: '<select><slot /></select>' },
    'n-button': { template: '<button><slot name="icon" /><slot /></button>' },
    'n-icon': { template: '<span><slot /></span>' },
    'n-checkbox': { template: '<input type="checkbox" />' },
    'n-spin': { template: '<div><slot /></div>' },
    Turnstile: { template: '<div />' },
    AdminContact: { template: '<div />' },
}

beforeEach(() => {
    i18n.global.locale.value = 'zh'
    state.openSettings.value = {
        fetched: true,
        domains: [{ label: 'example.com', value: 'example.com' }],
        defaultDomains: [],
        enableUserCreateEmail: false,
        disableAnonymousUserCreateEmail: false,
        enableGlobalTurnstileCheck: false,
        enableAddressPassword: false,
    }
    state.userSettings.value = {
        fetched: true,
        user_email: '',
        can_create_address: true,
    }
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('Login component anonymous address creation cue', () => {
    const defaultProps = {
        bindUserAddress: vi.fn(),
        newAddressPath: vi.fn(),
    }

    it('shows anonymousDisabledNotice when guest user cannot create anonymous address', async () => {
        state.openSettings.value.enableUserCreateEmail = true
        state.openSettings.value.disableAnonymousUserCreateEmail = true
        state.userSettings.value.user_email = ''

        const wrapper = mount(Login, {
            props: defaultProps,
            global: { plugins: [i18n, router], stubs },
        })

        const alerts = wrapper.findAll('.n-alert-stub')
        expect(alerts.length).toBe(1)
        expect(alerts[0].text()).toContain('当前系统未开放匿名创建地址，请使用现有账户登录或在用户中心绑定')
        expect(wrapper.text()).not.toContain('创建新邮箱')
    })

    it('shows localized English notice when locale is en and anonymous creation is disabled', async () => {
        i18n.global.locale.value = 'en'
        state.openSettings.value.enableUserCreateEmail = false
        state.userSettings.value.user_email = ''

        const wrapper = mount(Login, {
            props: defaultProps,
            global: { plugins: [i18n, router], stubs },
        })

        const alerts = wrapper.findAll('.n-alert-stub')
        expect(alerts.length).toBe(1)
        expect(alerts[0].text()).toContain('Anonymous address creation is unavailable')
    })

    it('does not show anonymousDisabledNotice when anonymous address creation is enabled', async () => {
        state.openSettings.value.enableUserCreateEmail = true
        state.openSettings.value.disableAnonymousUserCreateEmail = false
        state.userSettings.value.user_email = ''

        const wrapper = mount(Login, {
            props: defaultProps,
            global: { plugins: [i18n, router], stubs },
        })

        const alerts = wrapper.findAll('.n-alert-stub')
        expect(alerts.length).toBe(0)
        expect(wrapper.text()).toContain('创建新邮箱')
    })

    it('shows bindUserInfo instead for signed-in users', async () => {
        state.openSettings.value.enableUserCreateEmail = true
        state.openSettings.value.disableAnonymousUserCreateEmail = true
        state.userSettings.value.user_email = 'member@example.com'

        const wrapper = mount(Login, {
            props: defaultProps,
            global: { plugins: [i18n, router], stubs },
        })

        const alerts = wrapper.findAll('.n-alert-stub')
        expect(alerts.length).toBe(1)
        expect(alerts[0].text()).toContain('已登录用户, 登录未绑定邮箱或创建新邮箱地址将绑定到当前用户')
        expect(alerts[0].text()).not.toContain('当前系统未开放匿名创建地址')
    })
})
