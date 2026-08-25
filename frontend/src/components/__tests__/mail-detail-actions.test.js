/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const message = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
}

vi.mock('naive-ui', async (importOriginal) => {
    const original = await importOriginal()
    const { defineComponent, h } = await import('vue')
    return {
        ...original,
        useMessage: () => message,
        NDrawer: defineComponent({
            name: 'NDrawer',
            props: ['show'],
            setup(props, { slots }) {
                return () => (props.show ? h('div', { class: 'n-drawer' }, slots.default?.()) : null)
            },
        }),
        NDrawerContent: defineComponent({
            name: 'NDrawerContent',
            setup(_, { slots }) {
                return () => h('div', { class: 'n-drawer-content' }, slots.default?.())
            },
        }),
    }
})

import MailContentRenderer from '../MailContentRenderer.vue'
import i18n from '../../i18n'

const mail = {
    id: 7,
    address: 'recipient@example.test',
    source: 'sender@example.test',
    created_at: '2026-08-14 10:00:00',
    raw: 'Subject: Fixture\r\n\r\nBody',
    text: 'Body',
    message: '',
    messageIsHtml: false,
    attachments: [],
}

const stubs = {
    'n-space': { template: '<div><slot /></div>' },
    'n-tag': { template: '<span><slot /></span>' },
    'n-button': { template: '<button v-bind="$attrs"><slot name="icon" /><slot /></button>' },
    'n-icon': { template: '<span><slot /></span>' },
    'n-popconfirm': { template: '<div><slot name="trigger" /><slot /></div>' },
    'n-modal': { template: '<div><slot /></div>' },
    'n-drawer': { props: ['show'], template: '<div v-if="show" class="n-drawer-stub"><slot /></div>' },
    'n-drawer-content': { template: '<div><slot /></div>' },
    NDrawer: { props: ['show'], template: '<div v-if="show" class="n-drawer-stub"><slot /></div>' },
    NDrawerContent: { template: '<div><slot /></div>' },
    NButton: { template: '<button v-bind="$attrs"><slot name="icon" /><slot /></button>' },
    NIcon: { template: '<span><slot /></span>' },
    NPopconfirm: { template: '<div><slot name="trigger" /><slot /></div>' },
    NAlert: { template: '<div><slot /></div>' },
    'n-alert': { template: '<div><slot /></div>' },
    'n-spin': { template: '<div><slot /></div>' },
    'n-list': { template: '<div><slot /></div>' },
    'n-list-item': { template: '<div><slot /><slot name="suffix" /></div>' },
    'n-thing': { template: '<div><slot /><slot name="description" /></div>' },
}

beforeEach(() => {
    i18n.global.locale.value = 'zh'
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('ordinary-user mail detail actions', () => {
    it('keeps recipient copy beside the recipient tag and copies only that address', async () => {
        const wrapper = mount(MailContentRenderer, {
            props: { mail },
            global: { plugins: [i18n], stubs },
        })

        const copy = wrapper.get('.mail-copy-button')
        expect(copy.attributes('aria-label')).toBe('复制收件地址')
        expect(copy.attributes('title')).toBe('复制收件地址')
        await copy.trigger('click')
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('recipient@example.test')
    })

    it('opens fullscreen drawer and closes it when Escape key is pressed', async () => {
        const wrapper = mount(MailContentRenderer, {
            props: { mail, showReply: true },
            global: { plugins: [i18n], stubs },
        })

        expect(wrapper.find('.fullscreen-header-card').exists()).toBe(false)
        const fullscreenBtn = wrapper.findAll('button').find(b => b.text().includes('全屏'))
        expect(fullscreenBtn).toBeDefined()
        await fullscreenBtn.trigger('click')

        expect(wrapper.find('.fullscreen-header-card').exists()).toBe(true)

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await wrapper.vm.$nextTick()

        expect(wrapper.find('.fullscreen-header-card').exists()).toBe(false)
    })

    it('retains sender metadata, recipient line, and basic actions in fullscreen drawer without delete', async () => {
        const onReply = vi.fn()
        const onForward = vi.fn()
        const onDelete = vi.fn()
        const wrapper = mount(MailContentRenderer, {
            props: {
                mail,
                showReply: true,
                showEMailTo: true,
                enableUserDeleteEmail: true,
                onReply,
                onForward,
                onDelete,
            },
            global: { plugins: [i18n], stubs },
        })

        const fullscreenBtn = wrapper.findAll('button').find(b => b.text().includes('全屏'))
        await fullscreenBtn.trigger('click')

        const fullscreenHeader = wrapper.get('.fullscreen-header-card')
        expect(fullscreenHeader.find('.sender-name').text()).toBe('sender@example.test')
        expect(fullscreenHeader.find('.recipient-address').text()).toBe('recipient@example.test')

        const replyBtn = fullscreenHeader.findAll('button').find(b => b.text().includes('回复'))
        expect(replyBtn).toBeDefined()
        await replyBtn.trigger('click')
        expect(onReply).toHaveBeenCalledTimes(1)

        const forwardBtn = fullscreenHeader.findAll('button').find(b => b.text().includes('转发'))
        expect(forwardBtn).toBeDefined()
        await forwardBtn.trigger('click')
        expect(onForward).toHaveBeenCalledTimes(1)

        const downloadBtn = fullscreenHeader.find('[download="7.eml"]')
        expect(downloadBtn.exists()).toBe(true)

        const deleteBtn = fullscreenHeader.findAll('button').find(b => b.text().includes('删除'))
        expect(deleteBtn).toBeUndefined()
    })
})
