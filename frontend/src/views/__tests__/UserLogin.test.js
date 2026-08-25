/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        fetch: mocks.fetch,
    },
}))

vi.mock('naive-ui', () => ({
    useMessage: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
    NTabs: { props: ['value', 'size', 'justifyContent'], template: '<div><slot /></div>' },
    NTabPane: { props: ['name', 'tab'], template: '<div><slot /></div>' },
    NForm: { template: '<form><slot /></form>' },
    NFormItemRow: { props: ['label', 'required'], template: '<div><slot /></div>' },
    NInput: { props: ['value', 'type', 'placeholder', 'size', 'showPasswordOn'], template: '<div><input /></div>' },
    NInputGroup: { props: ['size'], template: '<div><slot /></div>' },
    NButton: { template: '<button v-bind="$attrs"><slot name="icon" /><slot /></button>' },
    NAlert: { props: ['showIcon', 'bordered'], template: '<div class="n-alert-stub"><slot /></div>' },
    NSpace: { props: ['justify'], template: '<div class="n-space-stub"><slot /></div>' },
    NModal: {
        props: ['show', 'preset', 'title'],
        emits: ['update:show'],
        template: '<div v-if="show" class="n-modal-stub"><slot /><div class="n-modal-footer-stub"><slot name="footer" /></div></div>',
    },
}))

import UserLogin from '../user/UserLogin.vue'
import i18n from '../../i18n'
import { useGlobalState } from '../../store'

const state = useGlobalState()

const stubs = {
    'n-tabs': { props: ['value', 'size', 'justifyContent'], template: '<div><slot /></div>' },
    'n-tab-pane': { props: ['name', 'tab'], template: '<div><slot /></div>' },
    'n-form': { template: '<form><slot /></form>' },
    'n-form-item-row': { props: ['label', 'required'], template: '<div><slot /></div>' },
    'n-input': { props: ['value', 'type', 'placeholder', 'size', 'showPasswordOn'], template: '<div><input /></div>' },
    'n-input-group': { props: ['size'], template: '<div><slot /></div>' },
    'n-button': { template: '<button v-bind="$attrs"><slot name="icon" /><slot /></button>' },
    'n-alert': { props: ['showIcon', 'bordered'], template: '<div class="n-alert-stub"><slot /></div>' },
    'n-space': { props: ['justify'], template: '<div class="n-space-stub"><slot /></div>' },
    'n-modal': {
        props: ['show', 'preset', 'title'],
        emits: ['update:show'],
        template: '<div v-if="show" class="n-modal-stub"><slot /><div class="n-modal-footer-stub"><slot name="footer" /></div></div>',
    },
    Turnstile: { template: '<div />' },
}

beforeEach(() => {
    i18n.global.locale.value = 'zh'
    state.openSettings.value = {
        enableGlobalTurnstileCheck: false,
        cfTurnstileSiteKey: '',
    }
    state.userOpenSettings.value = {
        enable: true,
        enableMailVerify: true,
        oauth2ClientIDs: [],
    }
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('UserLogin forgot-password modal', () => {
    it('opens modal and closes via the footer close button', async () => {
        const wrapper = mount(UserLogin, {
            global: { plugins: [i18n], stubs },
        })

        // Initially modal is closed
        expect(wrapper.find('.n-modal-stub').exists()).toBe(false)

        // Click forgot password button
        const forgotBtn = wrapper.find('.forgot-btn')
        expect(forgotBtn.exists()).toBe(true)
        await forgotBtn.trigger('click')

        // Modal is now open
        expect(wrapper.find('.n-modal-stub').exists()).toBe(true)

        // Footer close button exists and has localized text
        const footer = wrapper.find('.n-modal-footer-stub')
        expect(footer.exists()).toBe(true)
        const closeBtn = footer.find('button')
        expect(closeBtn.exists()).toBe(true)
        expect(closeBtn.text()).toBe('关闭')

        // Click close button
        await closeBtn.trigger('click')

        // Modal is closed
        expect(wrapper.find('.n-modal-stub').exists()).toBe(false)
    })

    it('renders English localization for close button when locale is en', async () => {
        i18n.global.locale.value = 'en'
        const wrapper = mount(UserLogin, {
            global: { plugins: [i18n], stubs },
        })

        const forgotBtn = wrapper.find('.forgot-btn')
        await forgotBtn.trigger('click')

        const footer = wrapper.find('.n-modal-footer-stub')
        const closeBtn = footer.find('button')
        expect(closeBtn.text()).toBe('Close')

        await closeBtn.trigger('click')
        expect(wrapper.find('.n-modal-stub').exists()).toBe(false)
    })

    it('provides footer close button when mail verification is disabled', async () => {
        state.userOpenSettings.value = {
            enable: true,
            enableMailVerify: false,
            oauth2ClientIDs: [],
        }

        const wrapper = mount(UserLogin, {
            global: { plugins: [i18n], stubs },
        })

        const forgotBtn = wrapper.find('.forgot-btn')
        await forgotBtn.trigger('click')

        expect(wrapper.find('.n-alert-stub').exists()).toBe(true)
        const footer = wrapper.find('.n-modal-footer-stub')
        const closeBtn = footer.find('button')
        expect(closeBtn.exists()).toBe(true)
        expect(closeBtn.text()).toBe('关闭')

        await closeBtn.trigger('click')
        expect(wrapper.find('.n-modal-stub').exists()).toBe(false)
    })
})
